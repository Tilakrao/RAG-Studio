import json
import sqlite3
import uuid
import logging
import time
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


def _conn(db_path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


class PipelineService:
    def __init__(self, db_path: str, registry, vector_store):
        self.db_path = db_path
        self.registry = registry
        self.vector_store = vector_store

    def create_pipeline(self, doc_id: str, config: dict) -> dict:
        from app.core.pipeline import PipelineConfig
        from app.core.pipeline import LoaderConfig, SplitterConfig, EmbedderConfig

        pipeline_id = str(uuid.uuid4())
        pc = PipelineConfig(
            loader=LoaderConfig(**config["loader"]),
            splitter=SplitterConfig(**config["splitter"]),
            embedder=EmbedderConfig(**config["embedder"]),
        )
        collection_name = pc.collection_name(doc_id)
        config_summary = pc.summary()

        record = {
            "pipeline_id": pipeline_id,
            "doc_id": doc_id,
            "config_json": json.dumps(config),
            "collection_name": collection_name,
            "status": "pending",
            "chunk_count": 0,
            "error": None,
            "config_summary": config_summary,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "completed_at": None,
            "duration_seconds": None,
        }
        with _conn(self.db_path) as conn:
            conn.execute(
                """INSERT INTO pipelines
                   (pipeline_id, doc_id, config_json, collection_name, status,
                    chunk_count, error, config_summary, created_at, completed_at, duration_seconds)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    record["pipeline_id"], record["doc_id"], record["config_json"],
                    record["collection_name"], record["status"], record["chunk_count"],
                    record["error"], record["config_summary"], record["created_at"],
                    record["completed_at"], record["duration_seconds"],
                ),
            )
        return record

    def run_pipeline_task(self, pipeline_id: str, file_path: str):
        from app.core.pipeline import Pipeline, PipelineConfig, LoaderConfig, SplitterConfig, EmbedderConfig

        start = time.time()
        try:
            with _conn(self.db_path) as conn:
                row = conn.execute(
                    "SELECT * FROM pipelines WHERE pipeline_id=?", (pipeline_id,)
                ).fetchone()
            if not row:
                return

            config = json.loads(row["config_json"])
            pc = PipelineConfig(
                loader=LoaderConfig(**config["loader"]),
                splitter=SplitterConfig(**config["splitter"]),
                embedder=EmbedderConfig(**config["embedder"]),
            )

            self._update_status(pipeline_id, "running")

            def _step(msg: str):
                self._update_step(pipeline_id, msg)

            pipeline = Pipeline(pc, self.registry, self.vector_store)
            result = pipeline.run(file_path, row["doc_id"], step_callback=_step)

            duration = time.time() - start

            if result.get("status") == "cached":
                # Fetch existing chunk count from DB
                existing_chunks = self._get_chunk_count(row["collection_name"])
                self._update_complete(
                    pipeline_id, "cached", existing_chunks or 0, None, duration
                )
            else:
                # Store all chunks in DB
                all_chunks = result.get("all_chunks", [])
                self._store_chunks(pipeline_id, all_chunks)
                self._update_complete(
                    pipeline_id, "completed", result["chunk_count"], None, duration
                )
        except Exception as e:
            duration = time.time() - start
            logger.exception("Pipeline %s failed", pipeline_id)
            self._update_complete(pipeline_id, "failed", 0, str(e), duration)

    def _get_chunk_count(self, collection_name: str) -> int:
        with _conn(self.db_path) as conn:
            row = conn.execute(
                "SELECT chunk_count FROM pipelines WHERE collection_name=? AND status IN ('completed','cached') LIMIT 1",
                (collection_name,)
            ).fetchone()
        return row["chunk_count"] if row else 0

    def _update_status(self, pipeline_id: str, status: str):
        with _conn(self.db_path) as conn:
            conn.execute(
                "UPDATE pipelines SET status=? WHERE pipeline_id=?",
                (status, pipeline_id),
            )

    def _update_step(self, pipeline_id: str, step: str):
        """Append step to the JSON step-log array stored in the 'step' column."""
        try:
            with _conn(self.db_path) as conn:
                row = conn.execute(
                    "SELECT step FROM pipelines WHERE pipeline_id=?", (pipeline_id,)
                ).fetchone()
                try:
                    log = json.loads(row["step"]) if row and row["step"] else []
                    if not isinstance(log, list):
                        log = [str(log)]  # migrate old single-string value
                except (json.JSONDecodeError, TypeError):
                    log = []
                log.append(step)
                conn.execute(
                    "UPDATE pipelines SET step=? WHERE pipeline_id=?",
                    (json.dumps(log, ensure_ascii=False), pipeline_id),
                )
        except Exception:
            logger.exception("Failed to persist step for pipeline %s: %r", pipeline_id, step)

    def _update_complete(self, pipeline_id: str, status: str, chunk_count: int, error: str | None, duration: float):
        with _conn(self.db_path) as conn:
            conn.execute(
                """UPDATE pipelines SET status=?, chunk_count=?, error=?,
                   completed_at=?, duration_seconds=? WHERE pipeline_id=?""",
                (
                    status, chunk_count, error,
                    datetime.now(timezone.utc).isoformat(),
                    round(duration, 2), pipeline_id,
                ),
            )

    def _store_chunks(self, pipeline_id: str, chunks: list[dict]):
        import json
        with _conn(self.db_path) as conn:
            conn.executemany(
                "INSERT INTO chunks (pipeline_id, chunk_index, content, metadata_json) VALUES (?,?,?,?)",
                [
                    (pipeline_id, c["index"], c["content"], json.dumps(c.get("metadata", {})))
                    for c in chunks
                ],
            )

    def get_pipeline(self, pipeline_id: str) -> dict | None:
        with _conn(self.db_path) as conn:
            row = conn.execute(
                "SELECT * FROM pipelines WHERE pipeline_id=?", (pipeline_id,)
            ).fetchone()
        if not row:
            return None
        result = dict(row)
        result["config"] = json.loads(result.pop("config_json"))
        result["chunks_preview"] = self._get_chunks_preview(pipeline_id)
        # Parse step log — stored as JSON array; fall back gracefully for old records
        raw_step = result.get("step") or "[]"
        try:
            step_log = json.loads(raw_step)
            if not isinstance(step_log, list):
                step_log = [str(step_log)]
        except (json.JSONDecodeError, TypeError):
            step_log = [raw_step] if raw_step else []
        result["step_log"] = step_log
        result["step"] = step_log[-1] if step_log else None
        return result

    def _get_chunks_preview(self, pipeline_id: str, limit: int = 5) -> list[dict]:
        import json
        with _conn(self.db_path) as conn:
            rows = conn.execute(
                "SELECT chunk_index, content, metadata_json FROM chunks WHERE pipeline_id=? ORDER BY chunk_index LIMIT ?",
                (pipeline_id, limit),
            ).fetchall()
        return [
            {"index": r["chunk_index"], "content": r["content"], "metadata": json.loads(r["metadata_json"])}
            for r in rows
        ]

    def get_chunks(self, pipeline_id: str) -> list[dict]:
        import json
        with _conn(self.db_path) as conn:
            rows = conn.execute(
                "SELECT chunk_index, content, metadata_json FROM chunks WHERE pipeline_id=? ORDER BY chunk_index",
                (pipeline_id,),
            ).fetchall()
        return [
            {"index": r["chunk_index"], "content": r["content"], "metadata": json.loads(r["metadata_json"])}
            for r in rows
        ]

    def list_pipelines(self, doc_id: str | None = None) -> list[dict]:
        with _conn(self.db_path) as conn:
            if doc_id:
                rows = conn.execute(
                    "SELECT * FROM pipelines WHERE doc_id=? ORDER BY created_at DESC", (doc_id,)
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT * FROM pipelines ORDER BY created_at DESC"
                ).fetchall()
        results = []
        for row in rows:
            r = dict(row)
            r["config"] = json.loads(r.pop("config_json"))
            r["chunks_preview"] = []
            results.append(r)
        return results

    def delete_pipeline(self, pipeline_id: str) -> bool:
        try:
            pipeline = self.get_pipeline(pipeline_id)
            if pipeline:
                self.vector_store.delete_collection(pipeline["collection_name"])
        except Exception as e:
            logger.warning("Error deleting collection for pipeline %s: %s", pipeline_id, e)

        with _conn(self.db_path) as conn:
            conn.execute("DELETE FROM chunks WHERE pipeline_id=?", (pipeline_id,))
            conn.execute("DELETE FROM pipelines WHERE pipeline_id=?", (pipeline_id,))
        logger.info("Deleted pipeline %s", pipeline_id)
        return True

import sqlite3
import uuid
import shutil
import logging
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger(__name__)


def _conn(db_path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db(db_path: str):
    with _conn(db_path) as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS documents (
                doc_id TEXT PRIMARY KEY,
                filename TEXT NOT NULL,
                size_bytes INTEGER NOT NULL,
                upload_time TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS pipelines (
                pipeline_id TEXT PRIMARY KEY,
                doc_id TEXT NOT NULL REFERENCES documents(doc_id),
                config_json TEXT NOT NULL,
                collection_name TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                chunk_count INTEGER DEFAULT 0,
                error TEXT,
                config_summary TEXT,
                created_at TEXT NOT NULL,
                completed_at TEXT,
                duration_seconds REAL,
                step TEXT
            );
            CREATE TABLE IF NOT EXISTS chunks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                pipeline_id TEXT NOT NULL REFERENCES pipelines(pipeline_id),
                chunk_index INTEGER NOT NULL,
                content TEXT NOT NULL,
                metadata_json TEXT NOT NULL
            );
        """)
        # Migrate existing DBs that don't have the step column yet
        try:
            conn.execute("ALTER TABLE pipelines ADD COLUMN step TEXT")
        except Exception:
            pass


class DocumentService:
    def __init__(self, db_path: str, uploads_dir: str):
        self.db_path = db_path
        self.uploads_dir = Path(uploads_dir)

    def save_upload(self, filename: str, content: bytes) -> dict:
        doc_id = str(uuid.uuid4())
        dest = self.uploads_dir / doc_id / filename
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(content)

        record = {
            "doc_id": doc_id,
            "filename": filename,
            "size_bytes": len(content),
            "upload_time": datetime.now(timezone.utc).isoformat(),
        }
        with _conn(self.db_path) as conn:
            conn.execute(
                "INSERT INTO documents (doc_id, filename, size_bytes, upload_time) VALUES (?,?,?,?)",
                (record["doc_id"], record["filename"], record["size_bytes"], record["upload_time"]),
            )
        logger.info("Saved document %s (%s)", doc_id, filename)
        return record

    def get_file_path(self, doc_id: str) -> str | None:
        with _conn(self.db_path) as conn:
            row = conn.execute("SELECT filename FROM documents WHERE doc_id=?", (doc_id,)).fetchone()
        if not row:
            return None
        path = self.uploads_dir / doc_id / row["filename"]
        return str(path) if path.exists() else None

    def list_documents(self) -> list[dict]:
        with _conn(self.db_path) as conn:
            rows = conn.execute("SELECT * FROM documents ORDER BY upload_time DESC").fetchall()
        return [dict(r) for r in rows]

    def get_document(self, doc_id: str) -> dict | None:
        with _conn(self.db_path) as conn:
            row = conn.execute("SELECT * FROM documents WHERE doc_id=?", (doc_id,)).fetchone()
        return dict(row) if row else None

    def delete_document(self, doc_id: str, pipeline_service) -> bool:
        pipelines = pipeline_service.list_pipelines(doc_id=doc_id)
        for p in pipelines:
            pipeline_service.delete_pipeline(p["pipeline_id"])

        doc_dir = self.uploads_dir / doc_id
        if doc_dir.exists():
            shutil.rmtree(doc_dir)

        with _conn(self.db_path) as conn:
            conn.execute("DELETE FROM documents WHERE doc_id=?", (doc_id,))
        logger.info("Deleted document %s", doc_id)
        return True

import os
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from app.config import Settings
from app.logging_config import setup_logging
from app.services.document_service import init_db
from app.dependencies import get_settings, get_registry
from app.api.components import router as components_router
from app.api.documents import router as documents_router
from app.api.pipelines import router as pipelines_router
from app.api.search import router as search_router
from app.api.logs import router as logs_router, attach_buffer_handler

# Detect if we are running in Vercel or a serverless cloud environment
IS_SERVERLESS = os.environ.get("VERCEL") == "1" or os.environ.get("ENVIRONMENT") == "production"

# For local development, prevent DNS rebinding. In production, we must allow Vercel hostnames.
_ALLOWED_HOST_SUFFIXES = (".vercel.app", ".now.sh")


def _configure_tesseract() -> None:
    import platform
    if platform.system() != "Windows":
        return
    tess_dir = r"C:\Program Files\Tesseract-OCR"
    tess_exe = os.path.join(tess_dir, "tesseract.exe")
    if not os.path.isfile(tess_exe):
        return
    current_path = os.environ.get("PATH", "")
    if tess_dir not in current_path:
        os.environ["PATH"] = tess_dir + os.pathsep + current_path
    try:
        import pytesseract
        pytesseract.pytesseract.tesseract_cmd = tess_exe
        logging.getLogger(__name__).info("Tesseract configured: %s", tess_exe)
    except ImportError:
        pass


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    attach_buffer_handler()
    
    # Resolve paths based on environment to avoid Read-Only Filesystem errors
    if IS_SERVERLESS:
        # Route logs to stdout and DB/data to /tmp (ephemeral scratchpad)
        log_file = None  # Setup logging to write to console stdout/stderr instead of disk
        db_path = "/tmp/rag_studio.db"
    else:
        log_file = str(settings.data_dir / "rag_studio.log")
        db_path = str(settings.db_path)

    setup_logging(settings.log_level, settings.log_format, log_file=log_file)
    
    if log_file:
        os.environ["LOG_FILE"] = log_file

    os.environ["HF_HOME"] = "/tmp/hf_home" if IS_SERVERLESS else str(settings.hf_home)
    
    if settings.transformers_offline != "0":
        os.environ["TRANSFORMERS_OFFLINE"] = settings.transformers_offline
        
    _configure_tesseract()
    
    if not IS_SERVERLESS:
        settings.ensure_dirs()
        
    # Warn developer if they are relying on SQLite in serverless
    if IS_SERVERLESS and db_path.endswith(".db"):
        logging.getLogger(__name__).warning(
            "Running with ephemeral local SQLite database in serverless environment! "
            "Data will be wiped on cold starts."
        )
        
    init_db(db_path)
    
    try:
        get_registry()
    except Exception as e:
        logging.getLogger(__name__).error("Component registration failed: %s", e)
        
    logging.getLogger(__name__).info("RAG Studio started — environment handles loaded")
    yield
    logging.getLogger(__name__).info("RAG Studio shutting down")


app = FastAPI(title="RAG Studio", version="1.0.0", lifespan=lifespan)

# ── Dynamic CORS Config ───────────────────────────────────────────────────────

cors_origins = [
    "http://localhost:8000",
    "http://127.0.0.1:8000",
]
if IS_SERVERLESS:
    # Allow wildcard or your production front-end URL here
    cors_origins.append("*") 

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Content-Type"],
)

# ── Host Guard Middleware (Modified) ──────────────────────────────────────────

@app.middleware("http")
async def host_guard(request: Request, call_next):
    """Host protection: strict on localhost, allows Vercel domain patterns in production."""
    host = request.headers.get("host", "").split(":")[0]
    
    # 1. Always allow local addresses
    if host in {"localhost", "127.0.0.1"}:
        return await call_next(request)
        
    # 2. In serverless deployment, accept platform domains
    if IS_SERVERLESS:
        if any(host.endswith(suffix) for suffix in _ALLOWED_HOST_SUFFIXES):
            return await call_next(request)
            
    logging.getLogger(__name__).warning(
        "Blocked request with unexpected Host header: %r", host
    )
    return JSONResponse(
        status_code=421,
        content={"detail": "Misdirected request — domain unauthorized"},
    )


# ── Exception handler ─────────────────────────────────────────────────────────

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logging.getLogger("rag_studio.error").exception(
        "Unhandled error on %s %s: %s", request.method, request.url.path, exc
    )
    return JSONResponse(status_code=500, content={"detail": str(exc)})


# ── Routers ───────────────────────────────────────────────────────────────────

app.include_router(components_router)
app.include_router(documents_router)
app.include_router(pipelines_router)
app.include_router(search_router)
app.include_router(logs_router)

# ── Static + SPA ──────────────────────────────────────────────────────────────

static_dir = os.path.join(os.path.dirname(__file__), "static")
app.mount("/static", StaticFiles(directory=static_dir), name="static")


@app.get("/")
def serve_spa():
    return FileResponse(
        os.path.join(static_dir, "index.html"),
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
        },
    )


@app.get("/health")
def health():
    return {"status": "ok", "version": "1.0.0"}

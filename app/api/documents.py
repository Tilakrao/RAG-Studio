import logging
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from fastapi.responses import FileResponse
from app.services.document_service import DocumentService
from app.services.pipeline_service import PipelineService
from app.dependencies import get_document_service, get_pipeline_service, get_settings
from app.config import Settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/documents", tags=["documents"])


@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    settings: Settings = Depends(get_settings),
    doc_service: DocumentService = Depends(get_document_service),
):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    content = await file.read()
    max_bytes = settings.max_upload_size_mb * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(status_code=413, detail=f"File exceeds {settings.max_upload_size_mb}MB limit")

    # Verify PDF magic bytes — rejects disguised non-PDF files regardless of extension
    if not content.startswith(b"%PDF"):
        raise HTTPException(status_code=400, detail="File is not a valid PDF (bad magic bytes)")

    record = doc_service.save_upload(file.filename, content)
    return record


@router.get("")
def list_documents(doc_service: DocumentService = Depends(get_document_service)):
    return doc_service.list_documents()


@router.get("/{doc_id}/file")
def serve_document_file(
    doc_id: str,
    doc_service: DocumentService = Depends(get_document_service),
):
    file_path = doc_service.get_file_path(doc_id)
    if not file_path:
        raise HTTPException(status_code=404, detail="File not found on disk")
    return FileResponse(file_path, media_type="application/pdf", filename=file_path.split("/")[-1])


@router.delete("/{doc_id}")
def delete_document(
    doc_id: str,
    doc_service: DocumentService = Depends(get_document_service),
    pipeline_service: PipelineService = Depends(get_pipeline_service),
):
    doc = doc_service.get_document(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    doc_service.delete_document(doc_id, pipeline_service)
    return {"status": "deleted", "doc_id": doc_id}

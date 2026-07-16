from pydantic import BaseModel


class DocumentResponse(BaseModel):
    doc_id: str
    filename: str
    size_bytes: int
    upload_time: str

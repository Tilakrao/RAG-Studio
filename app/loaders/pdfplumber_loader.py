from langchain_community.document_loaders import PDFPlumberLoader
from app.core.base import BaseLoader
from app.core.registry import ComponentRegistry


@ComponentRegistry.register_loader("pdfplumber")
class PDFPlumberLoaderWrapper(BaseLoader):
    name = "pdfplumber"

    def __init__(self):
        pass

    def load(self, file_path: str) -> list:
        loader = PDFPlumberLoader(file_path)
        return loader.load()

    @classmethod
    def params_schema(cls) -> list[dict]:
        return []

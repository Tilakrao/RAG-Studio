from langchain_community.document_loaders import PDFMinerLoader
from app.core.base import BaseLoader
from app.core.registry import ComponentRegistry


@ComponentRegistry.register_loader("pdfminer")
class PDFMinerLoaderWrapper(BaseLoader):
    name = "pdfminer"

    def __init__(self):
        pass

    def load(self, file_path: str) -> list:
        loader = PDFMinerLoader(file_path)
        return loader.load()

    @classmethod
    def params_schema(cls) -> list[dict]:
        return []

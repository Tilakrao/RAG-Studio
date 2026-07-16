from langchain_community.document_loaders import PyPDFLoader
from app.core.base import BaseLoader
from app.core.registry import ComponentRegistry


@ComponentRegistry.register_loader("pypdf")
class PyPDFLoaderWrapper(BaseLoader):
    name = "pypdf"

    def __init__(self):
        pass

    def load(self, file_path: str) -> list:
        loader = PyPDFLoader(file_path)
        return loader.load()

    @classmethod
    def params_schema(cls) -> list[dict]:
        return []

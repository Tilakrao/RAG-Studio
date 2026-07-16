from abc import ABC, abstractmethod
from typing import Any


class BaseLoader(ABC):
    name: str = ""

    @abstractmethod
    def load(self, file_path: str) -> list:
        ...

    @classmethod
    @abstractmethod
    def params_schema(cls) -> list[dict]:
        ...


class BaseSplitter(ABC):
    name: str = ""

    @abstractmethod
    def split(self, documents: list) -> list:
        ...

    @classmethod
    @abstractmethod
    def params_schema(cls) -> list[dict]:
        ...


class BaseEmbedder(ABC):
    name: str = ""
    model_name: str = ""
    dimension: int = 0

    @abstractmethod
    def get_embeddings(self):
        ...


class BaseVectorStore(ABC):
    @abstractmethod
    def add_documents(self, docs: list, collection_name: str, embeddings) -> int:
        ...

    @abstractmethod
    def similarity_search_with_score(
        self, query: str, collection_name: str, embeddings, k: int
    ) -> list[tuple]:
        ...

    @abstractmethod
    def collection_exists(self, collection_name: str) -> bool:
        ...

    @abstractmethod
    def delete_collection(self, collection_name: str) -> None:
        ...

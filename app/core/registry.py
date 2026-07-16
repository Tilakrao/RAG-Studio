import logging
from app.core.base import BaseLoader, BaseSplitter, BaseEmbedder
from app.core.exceptions import ComponentNotFoundError

logger = logging.getLogger(__name__)


class ComponentRegistry:
    _loaders: dict[str, type[BaseLoader]] = {}
    _splitters: dict[str, type[BaseSplitter]] = {}
    _embedders: dict[str, type[BaseEmbedder]] = {}

    @classmethod
    def register_loader(cls, name: str):
        def decorator(klass: type[BaseLoader]):
            klass.name = name
            cls._loaders[name] = klass
            logger.debug("Registered loader: %s", name)
            return klass
        return decorator

    @classmethod
    def register_splitter(cls, name: str):
        def decorator(klass: type[BaseSplitter]):
            klass.name = name
            cls._splitters[name] = klass
            logger.debug("Registered splitter: %s", name)
            return klass
        return decorator

    @classmethod
    def register_embedder(cls, name: str):
        def decorator(klass: type[BaseEmbedder]):
            klass.name = name
            cls._embedders[name] = klass
            logger.debug("Registered embedder: %s", name)
            return klass
        return decorator

    @classmethod
    def get_loader(cls, name: str, params: dict | None = None) -> BaseLoader:
        if name not in cls._loaders:
            raise ComponentNotFoundError(f"Loader '{name}' not found")
        return cls._loaders[name](**(params or {}))

    @classmethod
    def get_splitter(cls, name: str, params: dict | None = None) -> BaseSplitter:
        if name not in cls._splitters:
            raise ComponentNotFoundError(f"Splitter '{name}' not found")
        return cls._splitters[name](**(params or {}))

    @classmethod
    def get_embedder(cls, name: str, params: dict | None = None) -> BaseEmbedder:
        if name not in cls._embedders:
            raise ComponentNotFoundError(f"Embedder '{name}' not found")
        return cls._embedders[name](**(params or {}))

    @classmethod
    def list_loaders(cls) -> list[dict]:
        return [
            {"name": name, "params_schema": klass.params_schema()}
            for name, klass in cls._loaders.items()
        ]

    @classmethod
    def list_splitters(cls) -> list[dict]:
        return [
            {"name": name, "params_schema": klass.params_schema()}
            for name, klass in cls._splitters.items()
        ]

    @classmethod
    def list_embedders(cls) -> list[dict]:
        return [
            {
                "name": name,
                "model_name": klass.model_name,
                "dimension": klass.dimension,
            }
            for name, klass in cls._embedders.items()
        ]

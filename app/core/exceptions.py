class RAGStudioError(Exception):
    pass


class LoaderError(RAGStudioError):
    pass


class SplitterError(RAGStudioError):
    pass


class EmbedderError(RAGStudioError):
    pass


class VectorStoreError(RAGStudioError):
    pass


class PipelineError(RAGStudioError):
    pass


class DocumentNotFoundError(RAGStudioError):
    pass


class PipelineNotFoundError(RAGStudioError):
    pass


class ComponentNotFoundError(RAGStudioError):
    pass

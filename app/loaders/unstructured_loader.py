"""
Loaders that extract text from scanned/image-based PDFs via OCR.

unstructured_fast  — tries UnstructuredPDFLoader(mode='fast'); falls back to PyMuPDF+OCR
unstructured_hires — PyMuPDF high-DPI render (300 dpi) + Tesseract OCR
unstructured_ocr   — PyMuPDF standard render (200 dpi) + Tesseract OCR

PyMuPDF (fitz) is used for PDF-to-image conversion so poppler is NOT required.
Tesseract must be installed; path is auto-configured at startup in main.py.
"""
import logging
from langchain_core.documents import Document
from app.core.base import BaseLoader
from app.core.registry import ComponentRegistry

logger = logging.getLogger(__name__)


def _pdf_to_text_via_ocr(file_path: str, dpi: int = 200) -> list[Document]:
    """Render each PDF page with PyMuPDF and run Tesseract OCR on it."""
    import fitz  # PyMuPDF
    import pytesseract
    from PIL import Image
    import io

    docs = []
    pdf = fitz.open(file_path)
    mat = fitz.Matrix(dpi / 72, dpi / 72)  # scale factor: dpi/72

    for page_num in range(len(pdf)):
        page = pdf[page_num]
        pix = page.get_pixmap(matrix=mat, alpha=False)
        img_bytes = pix.tobytes("png")
        img = Image.open(io.BytesIO(img_bytes))
        text = pytesseract.image_to_string(img, lang="eng").strip()
        if text:
            docs.append(Document(
                page_content=text,
                metadata={"page": page_num + 1, "source": file_path, "loader": "ocr"},
            ))
        else:
            logger.debug("Page %d produced no OCR text", page_num + 1)

    pdf.close()
    logger.info("OCR extracted %d pages with text from %s", len(docs), file_path)
    return docs


@ComponentRegistry.register_loader("unstructured_fast")
class UnstructuredFastLoader(BaseLoader):
    """Fast text extraction — uses UnstructuredPDFLoader, falls back to OCR for image PDFs."""
    name = "unstructured_fast"

    def __init__(self):
        pass

    def load(self, file_path: str) -> list:
        try:
            from langchain_community.document_loaders import UnstructuredPDFLoader
            docs = UnstructuredPDFLoader(file_path, mode="fast").load()
            if docs and any(d.page_content.strip() for d in docs):
                return docs
            logger.info("UnstructuredPDFLoader fast returned empty text, falling back to OCR")
        except Exception as e:
            logger.warning("UnstructuredPDFLoader fast failed (%s), falling back to OCR", e)
        return _pdf_to_text_via_ocr(file_path, dpi=150)

    @classmethod
    def params_schema(cls) -> list[dict]:
        return []


@ComponentRegistry.register_loader("unstructured_hires")
class UnstructuredHiResLoader(BaseLoader):
    """High-resolution OCR using PyMuPDF at 300 dpi + Tesseract."""
    name = "unstructured_hires"

    def __init__(self, dpi: int = 300):
        self.dpi = int(dpi)

    def load(self, file_path: str) -> list:
        return _pdf_to_text_via_ocr(file_path, dpi=self.dpi)

    @classmethod
    def params_schema(cls) -> list[dict]:
        return [
            {
                "name": "dpi",
                "type": "int",
                "default": 300,
                "description": "Render resolution in DPI. Higher = better quality but slower.",
            }
        ]


@ComponentRegistry.register_loader("unstructured_ocr")
class UnstructuredOcrLoader(BaseLoader):
    """Standard OCR using PyMuPDF at 200 dpi + Tesseract. Best for most scanned PDFs."""
    name = "unstructured_ocr"

    def __init__(self):
        pass

    def load(self, file_path: str) -> list:
        return _pdf_to_text_via_ocr(file_path, dpi=200)

    @classmethod
    def params_schema(cls) -> list[dict]:
        return []

<div align="center">

```
██████╗  █████╗  ██████╗     ███████╗████████╗██╗   ██╗██████╗ ██╗ ██████╗
██╔══██╗██╔══██╗██╔════╝     ██╔════╝╚══██╔══╝██║   ██║██╔══██╗██║██╔═══██╗
██████╔╝███████║██║  ███╗    ███████╗   ██║   ██║   ██║██║  ██║██║██║   ██║
██╔══██╗██╔══██║██║   ██║    ╚════██║   ██║   ██║   ██║██║  ██║██║██║   ██║
██║  ██║██║  ██║╚██████╔╝    ███████║   ██║   ╚██████╔╝██████╔╝██║╚██████╔╝
╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝     ╚══════╝   ╚═╝    ╚═════╝ ╚═════╝ ╚═╝ ╚═════╝
```

**The open-source, local-first RAG evaluation workbench**

Compare loaders · chunkers · embedders · search strategies · rerankers — side-by-side, on your machine, with zero cloud dependency.

[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=flat-square&logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.111+-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![ChromaDB](https://img.shields.io/badge/ChromaDB-0.5+-FF6B35?style=flat-square)](https://www.trychroma.com/)
[![HuggingFace](https://img.shields.io/badge/HuggingFace-Sentence--Transformers-FFD21E?style=flat-square&logo=huggingface&logoColor=black)](https://huggingface.co/)
[![Local Only](https://img.shields.io/badge/Runs-100%25%20Local-10B981?style=flat-square)](#)
[![No API Keys](https://img.shields.io/badge/No%20API%20Keys-Required-blue?style=flat-square)](#)

</div>

---

## What is RAG Studio?

RAG Studio is a **fully local evaluation workbench** for Retrieval-Augmented Generation pipelines. Most RAG tools hide the internals — you feed them a document, get back results, and never know whether a different chunking strategy or embedding model would have worked better.

**RAG Studio fixes that.** Every component is swappable, every score is visible, every comparison is transparent.

```
Upload PDF  ──►  Configure Loader + Splitter + Embedder  ──►  Run Pipeline
                                                                    │
                                                                    ▼
                                    Search & Compare  ◄──  ChromaDB Collection
```

All models run locally via HuggingFace. No API keys. No cloud calls. No data ever leaves your machine.

---

## Feature Overview

| Category | What's included |
|---|---|
| **PDF Loaders** | `pypdf` · `pdfminer` · `pdfplumber` · `unstructured_fast` · `unstructured_hires` · `unstructured_ocr` |
| **Text Splitters** | `recursive_character` · `character` · `token` · `sentence_transformers_token` · `markdown_header` · `recursive_json` |
| **Embedding Models** | 6 local HuggingFace models — 384d to 768d dimensions |
| **Search Methods** | Cosine · L2 · Dot Product · BM25 · Cosine+BM25 · L2+BM25 · Dot+BM25 (RRF) |
| **Rerankers** | TinyBERT · MiniLM-L6 · MiniLM-L12 · BGE Base · None |
| **Pipeline Compare** | Up to 4 configs side-by-side · Pin & VS compare |
| **Auto-OCR** | PyMuPDF renders pages → Tesseract extracts text (no poppler needed) |
| **Smart Cache** | SHA-256 pipeline hashing — same config = instant cached result |
| **Live Log** | Per-step timing: Load → Split → Embed → Store |
| **Security** | CORS · Host Guard (DNS-rebind) · PDF magic-bytes validation |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser (SPA)                            │
│              Vanilla JS · 4 Tabs · Dynamic Forms                │
│                    Live Polling · Pin & Compare                 │
└─────────────────────────┬───────────────────────────────────────┘
                          │  HTTP / REST
┌─────────────────────────▼───────────────────────────────────────┐
│                     FastAPI  API Layer                          │
│          CORS Middleware · Host Guard · File Validation         │
└─────────────────────────┬───────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────┐
│                      Service Layer                              │
│     Document Service · Pipeline Service · Search Service        │
└─────────────────────────┬───────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────┐
│              Core · Orchestrator + Component Registry           │
│   ┌──────────┐  ┌───────────┐  ┌──────────┐  ┌─────────────┐  │
│   │6 Loaders │  │6 Splitters│  │6 Embedders│  │4 Rerankers │  │
│   └──────────┘  └───────────┘  └──────────┘  └─────────────┘  │
└───────────┬──────────────────────────────────────┬─────────────┘
            │                                      │
┌───────────▼────────────┐           ┌─────────────▼───────────────┐
│       ChromaDB         │           │   SQLite  ·  File System     │
│    Vector Store        │           │   Metadata  ·  PDF Uploads   │
└────────────────────────┘           └─────────────────────────────┘
```

### Ingestion Pipeline
```
PDF Upload ──► [Loader] ──► Raw Text ──► [Splitter] ──► Chunks ──► [Embedder] ──► ChromaDB
```
> Each pipeline config is SHA-256 hashed. Re-running the same config returns cached results instantly.

### Query Pipeline
```
                              ┌──► ChromaDB  (Dense: cosine / L2 / dot)  ──┐
Query ──► [same Embedder] ────┤                                             ├──► RRF Fusion ──► [Reranker] ──► Results
                              └──► BM25Okapi (Sparse: keyword)             ─┘
```
> **RRF formula:** `score = 1/(60 + rank_dense) + 1/(60 + rank_sparse)` — no score normalization needed.

---

## Embedding Models

| Model | Dims | Profile | Best For |
|---|---|---|---|
| `all-MiniLM-L6-v2` | 384 | ⚡ Fast | General English, quick baseline |
| `all-MiniLM-L12-v2` | 384 | ⚖️ Balanced | Better recall at moderate speed |
| `all-mpnet-base-v2` | 768 | ✨ Quality | Highest semantic accuracy |
| `multi-qa-MiniLM-L6-cos-v1` | 384 | ⚡ Fast | Question-answering retrieval |
| `paraphrase-multilingual-MiniLM-L12-v2` | 384 | 🌍 Multilingual | 50+ languages |
| `e5-small-v2` | 384 | ⚡ Fast | E5-family retrieval (query/passage prefixes) |

All models are downloaded once and cached locally. The server can operate fully **offline** after first run.

---

## Quick Start

### Prerequisites

- **Python 3.11+**
- **[Tesseract OCR](https://github.com/tesseract-ocr/tesseract)** — required for OCR loaders
  - Windows: [download installer](https://github.com/UB-Mannheim/tesseract/wiki)
  - macOS: `brew install tesseract`
  - Ubuntu: `sudo apt install tesseract-ocr`
- ~4 GB disk space for model weights (downloaded on first use)

### 1 · Clone

```bash
git clone <repo-url> rag-studio
cd rag-studio
```

### 2 · Create virtual environment & install

```bash
# Windows
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt

# macOS / Linux
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 3 · Configure environment

```bash
cp .env.example .env
# Edit .env as needed
```

### 4 · Start the server

```bash
# Windows
.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1

# macOS / Linux
.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1
```

> **`--workers 1` is required** — ChromaDB PersistentClient is single-process only.  
> First startup takes **60–90 seconds** while HuggingFace models load into memory.

### 5 · Open browser

```
http://localhost:8000
```

Click **Launch App** on the landing page to enter the Pipeline Studio.

---


## Step-by-Step Usage Guide

### Step 1 — Upload a PDF

Go to the **Documents** tab. Drag-and-drop any PDF (text-based or scanned) onto the upload zone. Files are validated via magic-bytes before storage.

> **Tip:** Scanned PDFs with no selectable text are fully supported — the `unstructured_hires` and `unstructured_ocr` loaders handle them automatically via PyMuPDF + Tesseract.

### Step 2 — Configure a pipeline

Switch to **Pipeline Studio**. Select your document, then configure three components:

- **Loader** — how to extract text from the PDF
- **Splitter** — chunk size, overlap, and splitting strategy
- **Embedder** — which HuggingFace model to use for vectorization

Add up to **4 different configurations** to the Comparison Basket.

> **Tip:** Start with `pypdf + recursive_character (500/50) + all-MiniLM-L6-v2` as a baseline, then vary one component at a time to isolate impact.

### Step 3 — Run pipelines

Click **Run All**. Each pipeline processes in parallel and shows a live step log:

```
✓ Load      0.8s  →  42 pages extracted
✓ Split     0.1s  →  187 chunks created
✓ Embed    12.3s  →  187 vectors stored in ChromaDB
✓ Store     0.2s  →  Collection ready
```

Running the same configuration a second time returns cached results instantly — no reprocessing.

### Step 4 — Search & compare

In **Search & Evaluate**, select one or more pipelines, type a natural language question, choose a search method (dense / sparse / hybrid RRF), optionally apply a cross-encoder reranker, and click Search.

Results appear side-by-side with similarity scores and chunk text. Use **Pin** to freeze one result set and compare it against a different query or configuration.

---

## Project Structure

```
rag-studio/
├── app/
│   ├── main.py                      # FastAPI app · middleware · routers · lifespan
│   ├── config.py                    # Pydantic Settings (env vars + .env)
│   ├── core/
│   │   ├── base.py                  # Abstract: BaseLoader, BaseSplitter, BaseEmbedder
│   │   ├── registry.py              # ComponentRegistry (@register_* decorators)
│   │   └── pipeline.py              # SHA-256 hashing + Pipeline orchestrator
│   ├── loaders/                     # 6 PDF loader implementations
│   ├── splitters/                   # 6 text splitter implementations
│   ├── embedders/                   # 6 HuggingFace embedding wrappers
│   ├── rerankers/                   # 4 cross-encoder reranker wrappers
│   ├── vectorstores/                # ChromaDB PersistentClient wrapper
│   ├── services/
│   │   ├── document_service.py      # File I/O + SQLite documents table
│   │   ├── pipeline_service.py      # Background tasks + step log + SQLite
│   │   └── search_service.py        # Dense + BM25 + RRF + reranking
│   ├── api/                         # FastAPI routers
│   │   ├── components.py            # GET /api/components/*
│   │   ├── documents.py             # POST/GET/DELETE /api/documents
│   │   ├── pipelines.py             # POST /api/pipelines/run + GET/DELETE
│   │   ├── search.py                # POST /api/search/query|compare|strategy_compare
│   │   └── logs.py                  # GET /api/logs/json
│   └── static/
│       ├── index.html               # Single-page app shell + landing page
│       ├── css/main.css             # All styles (app + landing)
│       └── js/
│           ├── api.js               # RagStudioAPI — all fetch calls
│           ├── app.js               # Tab routing + shared state
│           ├── upload.js            # Documents view (drag-drop + doc list)
│           ├── pipeline.js          # Pipeline Studio (forms + polling)
│           ├── search.js            # Search & Evaluate (compare grid + pin)
│           ├── auth.js              # Landing ↔ App shell toggle
│           └── logger.js            # In-browser log panel
├── requirements.txt
├── .env
└── .env.example
```

---

## API Reference

```
GET  /health

# Component discovery
GET  /api/components/loaders
GET  /api/components/splitters
GET  /api/components/embedders

# Documents
POST   /api/documents/upload          # multipart/form-data · PDF only
GET    /api/documents
DELETE /api/documents/{doc_id}        # cascades to pipelines + ChromaDB collections

# Pipelines
POST   /api/pipelines/run             # { doc_id, configs: [...] }
GET    /api/pipelines                 # optional ?doc_id= filter
GET    /api/pipelines/{id}            # status + step log + chunk preview
GET    /api/pipelines/{id}/chunks
GET    /api/pipelines/{id}/embeddings
DELETE /api/pipelines/{id}

# Search
POST /api/search/query                # { pipeline_ids:[one], query, k, search_type, reranker }
POST /api/search/compare              # { pipeline_ids:[1-4], query, k, search_type, reranker }
POST /api/search/strategy_compare     # { pipeline_id, query, k, search_types:[], reranker }

# Logs
GET  /api/logs/json                   # ?lines=200&level=ALL
```

---

## Configuration

All settings are controlled via environment variables or a `.env` file:

| Variable | Default | Description |
|---|---|---|
| `DATA_DIR` | `./data` | Root directory for uploads, ChromaDB, SQLite |
| `HF_HOME` | `./data/models` | HuggingFace model cache location |
| `TRANSFORMERS_OFFLINE` | `0` | Set to `1` to block all HuggingFace downloads |
| `LOG_LEVEL` | `INFO` | `DEBUG` · `INFO` · `WARNING` · `ERROR` |
| `LOG_FORMAT` | `json` | `json` (structured) or `text` |
| `MAX_UPLOAD_SIZE_MB` | `50` | Maximum PDF file size |

---

## Security

RAG Studio is designed for **localhost-only use** and includes technical protections:

| Protection | How it works |
|---|---|
| **CORS** | Only accepts requests from `http://localhost:8000` and `http://127.0.0.1:8000` |
| **Host Guard** | Middleware rejects any request where `Host` ≠ `localhost` / `127.0.0.1` — blocks DNS-rebinding attacks |
| **PDF Validation** | Every upload is checked for the `%PDF` magic-bytes before being stored or processed |

> **Important:** Do not expose port 8000 to the internet or a shared network without adding your own authentication layer.

---

## Development

```bash
# Install dev dependencies
pip install -r requirements-dev.txt


# Run with auto-reload (dev mode)
uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1 --reload
```

### Extending with a new component

Every component self-registers via a Python decorator. Adding a new loader requires only writing the class:

```python
# app/loaders/my_loader.py
from langchain_core.documents import Document
from app.core.base import BaseLoader
from app.core.registry import ComponentRegistry

@ComponentRegistry.register_loader("my_loader")
class MyLoader(BaseLoader):
    name = "my_loader"

    def __init__(self, my_param: int = 42):
        self.my_param = my_param

    def load(self, file_path: str) -> list[Document]:
        # ... your extraction logic
        return docs

    @classmethod
    def params_schema(cls) -> list[dict]:
        return [
            {"name": "my_param", "type": "int", "default": 42, "description": "Your param"}
        ]
```

Import it in `app/loaders/__init__.py` — it will appear in the UI automatically with no frontend changes needed.

The same pattern works for splitters (`@ComponentRegistry.register_splitter`) and embedders (`@ComponentRegistry.register_embedder`).

---

## Tech Stack

| Layer | Technology |
|---|---|
| **API** | FastAPI · Uvicorn |
| **Embeddings** | HuggingFace `sentence-transformers` |
| **Vector Store** | ChromaDB (persistent, local) |
| **RAG Primitives** | LangChain (loaders, splitters, embeddings) |
| **Sparse Retrieval** | `rank_bm25` — BM25Okapi |
| **PDF Processing** | pypdf · pdfminer.six · pdfplumber |
| **OCR** | PyMuPDF (rendering) + Tesseract (recognition) |
| **Cross-Encoders** | `sentence-transformers` CrossEncoder |
| **Metadata Store** | SQLite (Python stdlib `sqlite3`) |
| **Frontend** | Vanilla JS · HTML5 · CSS3 (no build step) |
| **Config** | Pydantic Settings v2 |
| **Containerization** | Docker · Docker Compose |

---

## Roadmap

- [ ] MTEB benchmark integration (automatic retrieval quality metrics)
- [ ] Export pipeline comparison as PDF / CSV report
- [ ] Query history and saved search sessions
- [ ] Custom embedding model support (plug in any HuggingFace model)
- [ ] LLM answer generation layer (OpenAI / Ollama / Gemini)
- [ ] Multi-document corpus support per pipeline

---



<div align="center">

Built with love in India 
    By Tilak Rao

**Local-first · Open-source · Zero cloud · No API keys**

*If RAG Studio helped your project, give it a ⭐*

</div>

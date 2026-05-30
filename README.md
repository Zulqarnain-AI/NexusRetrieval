# NexusRetrieval — Advanced Multi-Source RAG System

> A production-ready Retrieval-Augmented Generation (RAG) pipeline that lets you chat with your documents. Upload PDFs, Word files, or scrape websites — NexusRetrieval finds the exact passages that answer your question and cites every source.

![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=flat&logo=python&logoColor=white)
![Flask](https://img.shields.io/badge/Flask-3.0-000000?style=flat&logo=flask&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?style=flat&logo=react&logoColor=black)
![LangChain](https://img.shields.io/badge/LangChain-0.3-1C3C3C?style=flat)
![ChromaDB](https://img.shields.io/badge/ChromaDB-0.5-FF6B35?style=flat)
![Groq](https://img.shields.io/badge/Groq-LLaMA_3.1-F55036?style=flat)

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Backend Setup](#backend-setup)
  - [Frontend Setup](#frontend-setup)
- [Environment Variables](#environment-variables)
- [API Reference](#api-reference)
- [Deployment](#deployment)
- [How It Works](#how-it-works)

---

## Overview

NexusRetrieval is a full-stack RAG application built from scratch with a focus on production quality. It implements a **Multi-Query Retrieval** strategy — the LLM rewrites each user question into multiple semantic variants before searching the vector database, dramatically improving answer quality compared to naive single-query RAG.

**Live Demo**
- Frontend: nexusretrieval-frontend-nxwcshjka-zulqarnain-hassan.vercel.app

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    React Frontend (Vercel)                   │
│           Upload UI · Chat Interface · Source Viewer        │
└──────────────┬──────────────────────────┬───────────────────┘
               │ POST /api/upload-file     │ POST /api/chat
               │ POST /api/scrape-url      │ (SSE Stream)
               ▼                          ▼
┌─────────────────────────────────────────────────────────────┐
│              Flask API (Hugging Face Spaces)                 │
└──────────────┬──────────────────────────┬───────────────────┘
               │                          │
               ▼                          ▼
┌──────────────────────┐     ┌────────────────────────────────┐
│   Ingestion Engine   │     │         RAG Chain (LCEL)        │
│                      │     │                                 │
│  PyPDFLoader         │     │  User Query                     │
│  Docx2txtLoader      │     │       │                         │
│  WebBaseLoader       │     │       ▼                         │
│  RecursiveCharacter  │     │  MultiQueryRetriever            │
│  TextSplitter        │     │  (LLM rewrites → 3 variants)    │
│  HuggingFace         │     │       │                         │
│  Embeddings          │     │       ▼                         │
└──────────┬───────────┘     │  ChromaDB similarity search     │
           │                 │       │                         │
           ▼                 │       ▼                         │
┌──────────────────────┐     │  Context + source assembly      │
│  ChromaDB (persistent│◄────│       │                         │
│  /data/chroma_db)    │     │       ▼                         │
└──────────────────────┘     │  Groq LLaMA 3.1 (streaming)    │
                             │       │                         │
                             │       ▼                         │
                             │  SSE stream → client            │
                             └────────────────────────────────┘
```

---

## Features

**Ingestion**
- Upload PDF, DOCX, and TXT files via drag-and-drop
- Scrape any public web URL with SSRF protection
- Real-time status indicators: Parsing → Embedding → Ready
- Recursive character chunking with configurable size and overlap

**Retrieval**
- Multi-Query Retriever: LLM rewrites each question into 3 semantic variants
- Searches all variants independently, deduplicates results
- Significantly higher recall than single-query RAG

**Generation**
- Streaming responses via Server-Sent Events (SSE)
- Strict system prompt: no hallucinations, must cite sources
- Sources accordion shows exact retrieved chunks with page numbers
- Markdown-rendered responses with syntax highlighting

**Infrastructure**
- Persistent ChromaDB vector storage (survives server restarts)
- HuggingFace `all-MiniLM-L6-v2` embeddings — free, runs on CPU
- Groq LLaMA 3.1 — extremely fast inference, free tier available
- Structured JSON logging with rotating file handler
- Production WSGI server (Gunicorn) with threading

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | React 18 + Vite | UI framework |
| Styling | Inline styles | Zero-dependency design system |
| Markdown | react-markdown + remark-gfm | AI response rendering |
| Backend | Flask 3.0 | REST API + SSE streaming |
| Orchestration | LangChain 0.3 (LCEL) | RAG pipeline |
| LLM | Groq (LLaMA 3.1 8B Instant) | Fast inference, free tier |
| Embeddings | HuggingFace all-MiniLM-L6-v2 | Local, no API key needed |
| Vector DB | ChromaDB 0.5 | Persistent local vector store |
| PDF Parsing | PyPDF | Page-aware PDF extraction |
| DOCX Parsing | Docx2txt | Word document extraction |
| Web Scraping | LangChain WebBaseLoader | URL content extraction |
| Deployment | HF Spaces (Docker) + Vercel | Free hosting |

---

## Project Structure

```
NexusRetrieval/
│
├── backend/                        # Flask API
│   ├── app/
│   │   ├── __init__.py             # App factory
│   │   ├── config.py               # Pydantic settings
│   │   ├── core/
│   │   │   ├── ingestion.py        # PDF/DOCX/Web loaders + chunking
│   │   │   ├── vectorstore.py      # ChromaDB singleton + operations
│   │   │   ├── rag_chain.py        # LCEL chain + Groq streaming
│   │   │   ├── multi_query.py      # Custom MultiQueryRetriever
│   │   │   └── logging_config.py   # JSON structured logging
│   │   └── routes/
│   │       ├── ingest.py           # /upload-file, /scrape-url, /reset
│   │       └── chat.py             # /chat SSE, /health
│   ├── run.py                      # Entrypoint
│   ├── Dockerfile                  # HF Spaces deployment
│   ├── requirements.txt
│   ├── .env.example
│   └── README.md
│
└── frontend/                       # React App
    ├── src/
    │   ├── App.jsx                 # Main UI component
    │   ├── hooks/
    │   │   ├── useChat.js          # Streaming chat state manager
    │   │   └── useKnowledgeBase.js # Document + health manager
    │   ├── lib/
    │   │   └── api.js              # Fetch + SSE client
    │   └── main.jsx
    ├── vercel.json                 # Vercel routing config
    ├── .env.example
    └── package.json
```

---

## Getting Started

### Prerequisites

- Python 3.11+
- Node.js 18+
- A free [Groq API key](https://console.groq.com)

---

### Backend Setup

```bash
# 1. Navigate to backend
cd backend

# 2. Create and activate virtual environment
python -m venv venv
source venv/bin/activate          # Mac/Linux
venv\Scripts\activate             # Windows

# 3. Install dependencies
pip install -r requirements.txt

# 4. Configure environment
cp .env.example .env
# Edit .env and add your GROQ_API_KEY

# 5. Start the development server
python run.py
```

Backend runs at `http://localhost:5000`

---

### Frontend Setup

```bash
# 1. Navigate to frontend
cd frontend

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env — set VITE_API_URL=http://localhost:5000/api

# 4. Start the development server
npm run dev
```

Frontend runs at `http://localhost:5173`

---

## Environment Variables

### Backend (`.env`)

```bash
# Required
GROQ_API_KEY=your_groq_api_key_here

# Flask
FLASK_ENV=development
FLASK_SECRET_KEY=your_secret_key_here

# Models
GROQ_MODEL_NAME=llama-3.1-8b-instant
EMBEDDING_MODEL_NAME=sentence-transformers/all-MiniLM-L6-v2

# Storage
CHROMA_DB_PATH=./chroma_db
UPLOAD_FOLDER=./uploads

# Chunking (tune for your use case)
CHUNK_SIZE=1000
CHUNK_OVERLAP=200

# Retrieval
RETRIEVER_K=5
MULTI_QUERY_VARIANTS=3

# Logging
LOG_LEVEL=INFO
LOG_DIR=./logs

# Misc
USER_AGENT=NexusRetrieval/1.0
```

### Frontend (`.env`)

```bash
VITE_API_URL=http://localhost:5000/api
```

---

## API Reference

### `GET /api/health`
Returns backend status and knowledge base stats.

```json
{
  "status": "ok",
  "knowledge_base": {
    "collection_name": "nexus_documents",
    "document_count": 73
  }
}
```

---

### `POST /api/upload-file`
Upload a PDF, DOCX, or TXT file.

**Request:** `multipart/form-data` with `file` field

**Response:**
```json
{
  "status": "success",
  "original_filename": "report.pdf",
  "chunks_created": 24,
  "collection_stats": { "document_count": 97 }
}
```

---

### `POST /api/scrape-url`
Scrape a public URL and add it to the knowledge base.

**Request:**
```json
{ "url": "https://example.com/article" }
```

**Response:**
```json
{
  "status": "success",
  "url": "https://example.com/article",
  "chunks_created": 18
}
```

---

### `POST /api/chat`
Stream an AI response for a question. Returns Server-Sent Events.

**Request:**
```json
{ "question": "What are the key findings?" }
```

**SSE Event sequence:**
```
event: sources
data: {"sources": [{"source_name": "report.pdf", "page": 3, "snippet": "..."}]}

event: token
data: {"token": "Based"}

event: token
data: {"token": " on"}

event: done
data: {"token_count": 187}
```

---

### `DELETE /api/reset`
Wipes the entire ChromaDB collection.

```json
{ "status": "success", "documents_deleted": 73 }
```

---

## Deployment

### Backend → Hugging Face Spaces (Free)

```bash
cd backend
git init
git add .
git commit -m "initial deployment"
git remote add hf https://huggingface.co/spaces/YOUR_USERNAME/nexusretrieval-backend
git push hf main
```

Add secrets in HF Spaces → Settings → Variables and Secrets:
- `GROQ_API_KEY`
- `FLASK_SECRET_KEY`
- `FLASK_ENV=production`
- `CHROMA_DB_PATH=/data/chroma_db`

---

### Frontend → Vercel (Free)

```bash
cd frontend
# Push to GitHub, then import at vercel.com
# Set environment variable:
# VITE_API_URL = https://YOUR_USERNAME-nexusretrieval-backend.hf.space/api
```

---

## How It Works

### 1. Ingestion Pipeline
When you upload a file or scrape a URL, the backend:
1. Loads the document using the appropriate loader (PyPDF, Docx2txt, WebBaseLoader)
2. Splits it into overlapping chunks using `RecursiveCharacterTextSplitter`
3. Generates 384-dimensional embeddings using `all-MiniLM-L6-v2` (local, free)
4. Stores vectors and metadata in persistent ChromaDB

### 2. Multi-Query Retrieval
When you ask a question:
1. The LLM rewrites your question into 3 semantic variants
2. All 4 queries (original + 3 variants) hit ChromaDB independently
3. Results are deduplicated by content hash
4. Top unique chunks are assembled into a context string with source citations

### 3. Streaming Generation
1. The LCEL chain injects the context + question into the system prompt
2. Groq LLaMA 3.1 streams tokens back to Flask
3. Flask wraps tokens in SSE format and streams to the browser
4. React appends tokens in real time — sources appear before the first token

### Why Multi-Query?
A single query only finds documents that use similar vocabulary. Multi-query retrieval covers synonyms, different phrasings, and related concepts — typically increasing relevant chunk recall by 40-60% on domain-specific documents.

---

## License

MIT — free to use, modify, and deploy.

---

*Built with LangChain, ChromaDB, Groq, Flask, and React.*

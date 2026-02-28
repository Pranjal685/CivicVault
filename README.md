# CivicVault

> Air-gapped, offline document intelligence platform powered by local LLMs via Ollama.

CivicVault is a privacy-first desktop application that lets you index PDF documents and query them using a local AI model — **no internet required, no data leaves your machine.**

---

## Features

- **Fully Offline** — All processing happens locally. No cloud APIs, no data upload.
- **PDF Ingestion** — Drop a PDF and it's automatically parsed, embedded, and indexed.
- **Hybrid Search** — Combines vector similarity (semantic) + BM25 keyword search with Reciprocal Rank Fusion (RRF).
- **Subject Section Detection** — Intelligent 3-tier scoring system that accurately locates specific subject content in multi-subject documents.
- **Cryptographic Evidence Sealing** — Automatically calculates SHA-256 hashes of imported PDFs to cryptographically guarantee document immutability and verify evidence.
- **Streaming Responses** — Token-by-token output rendering for real-time feedback.
- **Markdown Rendering** — AI answers are formatted with headings, bullet lists, bold terms, and source citations.
- **Conversation Memory** — Follow-up questions remember context from previous turns.
- **Deterministic Output** — Temperature-0 generation for consistent, reproducible answers.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop Framework | Electron |
| Frontend | React + Vite + TailwindCSS |
| PDF Parsing | pdf-parse |
| Embeddings | Ollama (nomic-embed-text) |
| LLM | Ollama (llama3 8B) |
| Search | Custom hybrid search (vector + BM25 + RRF) |

---

## Prerequisites

1. **Node.js** (v18+)
2. **Ollama** — Install from [ollama.ai](https://ollama.ai)
3. **Required models:**
   ```bash
   ollama pull nomic-embed-text
   ollama pull llama3
   ```

---

## Installation

```bash
git clone https://github.com/Pranjal685/CivicVault.git
cd CivicVault
git checkout Pranjal
npm install
```

---

## Running

```bash
npm run dev
```

This starts both the Vite dev server and Electron app concurrently.

---

## Architecture

### RAG Pipeline

```
User Query
    ↓
┌─────────────────────────────────────────────┐
│ 1. Subject Section Detection (3-tier)       │
│    - TIER 1: Subject + Number + Unit content│
│    - TIER 2: Subject + Number in header     │
│    - TIER 3: Subject mentioned anywhere     │
│    - Roman numeral mapping (2 → ii)         │
│    - Adjacency check (prevents false match) │
└─────────────┬───────────────────────────────┘
              ↓
┌─────────────────────────────────────────────┐
│ 2. Hybrid Search (fallback)                 │
│    - Vector search (nomic-embed-text)       │
│    - Keyword search (BM25-style)            │
│    - RRF fusion (3x keyword weight)         │
│    - Section expansion (top keyword page    │
│      + next 3 pages)                        │
└─────────────┬───────────────────────────────┘
              ↓
┌─────────────────────────────────────────────┐
│ 3. LLM Generation (llama3 8B)              │
│    - Streaming via Ollama /api/chat         │
│    - Temperature 0 (deterministic)          │
│    - Markdown-formatted output              │
│    - num_ctx: 4096, num_predict: 4096       │
└─────────────────────────────────────────────┘
```

### Key Files

| File | Purpose |
|---|---|
| `electron/ingestion.cjs` | PDF parsing, vector store, search, LLM interaction |
| `electron/main.cjs` | Electron main process, IPC handlers |
| `electron/preload.cjs` | Context bridge for renderer ↔ main |
| `src/components/SearchView.jsx` | Chat UI with streaming + markdown renderer |
| `src/components/Dashboard.jsx` | File management dashboard |
| `src/components/DropZone.jsx` | PDF upload drag-and-drop |

---

## Subject Section Detection

The system intelligently locates specific subjects within multi-subject PDFs (e.g., a syllabus with both "Engineering Mathematics 1" and "Engineering Mathematics 2"):

1. **Aggressive normalization** — Strips all punctuation, hyphens, dashes so `Engineering Mathematics-II` matches `Engineering Mathematics 2`
2. **Number adjacency check** — Ensures the number (2/ii) appears right after the base name, preventing "Semester – II" from matching
3. **Strict unit detection** — Matches `Unit I`, `Unit II` patterns but NOT `Unit Test` or `Unit No`
4. **COURSE keyword boost** — Pages with `COURSE:` in the header score higher than semester index tables
5. **Next-page units boost** — If the subject intro page is followed by a page with unit details, it ranks as TIER 1b

---

## License

MIT

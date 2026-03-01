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
- **1-Click Case Chronology** — Hybrid regex + LLM timeline extraction that deterministically finds every date in legal documents and generates a beautiful interactive timeline UI.
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
| `electron/ingestion.cjs` | PDF parsing, vector store, search, LLM interaction, timeline extraction |
| `electron/main.cjs` | Electron main process, IPC handlers |
| `electron/preload.cjs` | Context bridge for renderer ↔ main |
| `src/components/SearchView.jsx` | Chat UI with streaming + markdown renderer |
| `src/components/Dashboard.jsx` | File management dashboard |
| `src/components/DropZone.jsx` | PDF upload drag-and-drop |
| `src/components/TimelineView.jsx` | Case chronology timeline UI |

---

## Subject Section Detection

The system intelligently locates specific subjects within multi-subject PDFs (e.g., a syllabus with both "Engineering Mathematics 1" and "Engineering Mathematics 2"):

1. **Aggressive normalization** — Strips all punctuation, hyphens, dashes so `Engineering Mathematics-II` matches `Engineering Mathematics 2`
2. **Number adjacency check** — Ensures the number (2/ii) appears right after the base name, preventing "Semester – II" from matching
3. **Strict unit detection** — Matches `Unit I`, `Unit II` patterns but NOT `Unit Test` or `Unit No`
4. **COURSE keyword boost** — Pages with `COURSE:` in the header score higher than semester index tables
5. **Next-page units boost** — If the subject intro page is followed by a page with unit details, it ranks as TIER 1b

---

## 1-Click Case Chronology Generator

The timeline feature uses a **hybrid regex + LLM architecture** to guarantee exhaustive date extraction from legal documents:

1. **Regex Date Scanner** — Programmatically scans ALL document chunks using 5 date patterns (`DD/MM/YYYY`, ISO, full month names, ordinal dates, abbreviated months). This is deterministic and can never miss a date.
2. **Contextual LLM Call** — Pre-found dates + surrounding context are sent to the LLM in a single focused call. The LLM only needs to describe each event, not find dates — a much simpler task for small models like LLaMA 3.2 (3B).
3. **JSON Schema Enforcement** — Ollama's native grammar constraint (`format: jsonSchema`) physically prevents the model from outputting anything other than the required `{ date, event, source }` structure.
4. **Safety Net** — After the LLM responds, any dates it skipped are manually injected with raw context from the document.
5. **Full Fallback** — If the LLM crashes entirely, the system returns all regex-found dates with their surrounding context anyway.

---

## License

MIT

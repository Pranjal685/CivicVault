/**
 * IngestionEngine — 100% CJS, zero ESM imports
 *
 * - PDF parsing:      pdf-parse (CJS)
 * - Text splitting:   Manual RecursiveCharacterTextSplitter (pure JS)
 * - Embeddings:       Direct HTTP calls to Ollama /api/embed
 * - Vector store:     Custom in-memory cosine-similarity store
 *
 * No LangChain packages are loaded at runtime — eliminates all
 * ESM/CJS dynamic import issues in Electron's main process.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const MiniSearch = require('minisearch');

// ═══════════════════════════════════════════════════════════════════════
// 1. EMBEDDINGS — Direct API call to Ollama
// ═══════════════════════════════════════════════════════════════════════

function ollamaEmbed(texts, model = 'nomic-embed-text', baseUrl = 'http://localhost:11434') {
    return new Promise((resolve, reject) => {
        const url = new URL('/api/embed', baseUrl);
        const payload = JSON.stringify({ model, input: texts });

        const req = http.request(
            {
                hostname: url.hostname,
                port: url.port,
                path: url.pathname,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(payload),
                },
            },
            (res) => {
                let body = '';
                res.on('data', (chunk) => (body += chunk));
                res.on('end', () => {
                    if (res.statusCode !== 200) {
                        return reject(new Error(`Ollama returned ${res.statusCode}: ${body}`));
                    }
                    try {
                        const data = JSON.parse(body);
                        resolve(data.embeddings);
                    } catch (err) {
                        reject(new Error('Failed to parse Ollama response: ' + err.message));
                    }
                });
            }
        );

        req.on('error', (err) => {
            reject(
                new Error(
                    'Cannot connect to Ollama at ' +
                    baseUrl +
                    '. Make sure Ollama is running.\n\n' +
                    err.message
                )
            );
        });

        req.write(payload);
        req.end();
    });
}

// ═══════════════════════════════════════════════════════════════════════
// 2. TEXT SPLITTER — Recursive character splitting (pure JS)
// ═══════════════════════════════════════════════════════════════════════

const DEFAULT_SEPARATORS = ['\n\n', '\n', '. ', ', ', ' ', ''];

function recursiveSplit(text, chunkSize, chunkOverlap, separators) {
    if (!text || text.length === 0) return [];
    if (text.length <= chunkSize) return [text];

    const sep = separators[0];
    const remaining = separators.slice(1);

    // Split by current separator
    const parts = sep === '' ? [...text] : text.split(sep);

    const chunks = [];
    let current = '';

    for (const part of parts) {
        const candidate = current ? current + sep + part : part;

        if (candidate.length > chunkSize && current.length > 0) {
            chunks.push(current.trim());
            // Start next chunk with overlap from end of current
            const overlap = current.slice(-chunkOverlap);
            current = overlap + sep + part;
        } else {
            current = candidate;
        }
    }
    if (current.trim().length > 0) {
        chunks.push(current.trim());
    }

    // Recursively split any chunk that's still too large
    const results = [];
    for (const chunk of chunks) {
        if (chunk.length > chunkSize && remaining.length > 0) {
            results.push(...recursiveSplit(chunk, chunkSize, chunkOverlap, remaining));
        } else {
            results.push(chunk);
        }
    }

    return results;
}

function splitTextChunks(text, chunkSize = 1000, chunkOverlap = 200) {
    return recursiveSplit(text, chunkSize, chunkOverlap, DEFAULT_SEPARATORS).filter(
        (c) => c.length > 0
    );
}

// ═══════════════════════════════════════════════════════════════════════
// 3. VECTOR STORE + KEYWORD INDEX — Hybrid search
// ═══════════════════════════════════════════════════════════════════════

function cosineSimilarity(a, b) {
    let dot = 0,
        magA = 0,
        magB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        magA += a[i] * a[i];
        magB += b[i] * b[i];
    }
    return dot / (Math.sqrt(magA) * Math.sqrt(magB) + 1e-10);
}

/** Simple stop words to filter out common noise */
const STOP_WORDS = new Set([
    'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
    'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'shall', 'can',
    'of', 'in', 'to', 'for', 'with', 'on', 'at', 'by', 'from', 'as', 'into', 'about', 'between',
    'through', 'during', 'before', 'after', 'above', 'below', 'and', 'but', 'or', 'not', 'no',
    'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'than',
    'too', 'very', 'just', 'also', 'how', 'what', 'which', 'who', 'whom', 'this', 'that',
    'these', 'those', 'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'she', 'it', 'they',
    'them', 'his', 'her', 'its', 'their',
]);

/** Tokenize text into meaningful terms */
function tokenize(text) {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((t) => t.length > 2 && !STOP_WORDS.has(t));
}

class SimpleVectorStore {
    constructor() {
        this.entries = []; // { embedding: number[], document: { pageContent, metadata } }
    }

    async addDocuments(documents, embeddings) {
        for (let i = 0; i < documents.length; i++) {
            this.entries.push({
                embedding: embeddings[i],
                document: documents[i],
            });
        }
    }

    /** Vector-only similarity search */
    async similaritySearch(queryEmbedding, k = 4) {
        const scored = this.entries.map((entry) => ({
            score: cosineSimilarity(queryEmbedding, entry.embedding),
            document: entry.document,
        }));
        scored.sort((a, b) => b.score - a.score);
        return scored.slice(0, k);
    }

    /**
     * BM25-style keyword search.
     * Scores each chunk based on:
     *   - Term frequency of query words
     *   - Exact phrase match bonus (massive boost)
     *   - Multi-word substring match bonus
     */
    keywordSearch(query, k = 10) {
        const queryTerms = tokenize(query);
        const queryLower = query.toLowerCase().trim();

        // Extract significant multi-word phrases (2-4 word combinations)
        const queryWords = queryLower.split(/\s+/).filter((w) => w.length > 2);
        const phrases = [];
        for (let len = Math.min(4, queryWords.length); len >= 2; len--) {
            for (let i = 0; i <= queryWords.length - len; i++) {
                phrases.push(queryWords.slice(i, i + len).join(' '));
            }
        }

        const scored = this.entries.map((entry, idx) => {
            const text = entry.document.pageContent.toLowerCase();
            let score = 0;

            // 1. Term frequency — count each query term in chunk
            for (const term of queryTerms) {
                let pos = 0;
                let count = 0;
                while ((pos = text.indexOf(term, pos)) !== -1) {
                    count++;
                    pos += term.length;
                }
                // BM25-style diminishing returns: log(1 + count)
                score += Math.log(1 + count);
            }

            // 2. Exact full-query match — massive bonus
            if (text.includes(queryLower)) {
                score += 20;
            }

            // 3. Multi-word phrase matches — strong bonus
            for (const phrase of phrases) {
                if (text.includes(phrase)) {
                    score += phrase.split(' ').length * 3; // longer phrase = bigger bonus
                }
            }

            return { score, document: entry.document, idx, page: entry.document.metadata.page };
        });

        // 4. NEIGHBOR PAGE BOOST — when a page scores high,
        //    boost its adjacent pages (±2). This solves the problem where
        //    "Linear Data Structures" is on page 56 but units are on pages 57-58.
        const pageScores = new Map();
        for (const s of scored) {
            if (s.score > 0) {
                pageScores.set(s.page, (pageScores.get(s.page) || 0) + s.score);
            }
        }

        for (const s of scored) {
            const page = s.page;
            // Check if any neighbor page (within ±2) has a keyword match
            for (let delta = -2; delta <= 2; delta++) {
                if (delta === 0) continue;
                const neighborPage = page + delta;
                const neighborScore = pageScores.get(neighborPage) || 0;
                if (neighborScore > 0) {
                    // Closer neighbors get more boost: ±1 = 50%, ±2 = 25%
                    const boostFactor = Math.abs(delta) === 1 ? 0.5 : 0.25;
                    s.score += neighborScore * boostFactor;
                }
            }
        }

        return scored
            .filter((s) => s.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, k);
    }

    get size() {
        return this.entries.length;
    }
}

// ═══════════════════════════════════════════════════════════════════════
// 4. INGESTION ENGINE — ties everything together
// ═══════════════════════════════════════════════════════════════════════

class IngestionEngine {
    constructor() {
        this.vectorStore = new SimpleVectorStore();
        this.ingestedFiles = [];
        // LRU response cache — top 50 queries, cleared on new ingestion
        this._cache = new Map();
        this._cacheMax = 50;
        // Per-case MiniSearch instances (loaded from disk on demand)
        this._miniSearchInstances = new Map();
        // userData path — set via setUserDataPath() from main.cjs
        this._userDataPath = null;
        // Hardware profile for VRAM-aware routing
        this._vramMB = 0;
        this._gpuBackend = 'CPU';
    }

    /**
     * Set hardware profile for VRAM-aware inference routing.
     * @param {{ vramMB: number, backend: string }} profile
     */
    setHardwareProfile(profile) {
        this._vramMB = profile.vramMB || 0;
        this._gpuBackend = profile.backend || 'CPU';
        console.log(`[CivicVault] IngestionEngine VRAM: ${this._vramMB}MB, Backend: ${this._gpuBackend}`);
    }

    /**
     * Set the userData directory for persistent index storage.
     * @param {string} dirPath - app.getPath('userData')
     */
    setUserDataPath(dirPath) {
        this._userDataPath = dirPath;
        // Ensure keyword_indices directory exists
        const indexDir = path.join(dirPath, 'keyword_indices');
        if (!fs.existsSync(indexDir)) {
            fs.mkdirSync(indexDir, { recursive: true });
        }
    }

    /**
     * Get or load a MiniSearch instance for a specific case.
     * @param {string} caseId
     * @returns {MiniSearch|null}
     */
    _getMiniSearch(caseId) {
        if (!caseId) return null;

        if (this._miniSearchInstances.has(caseId)) {
            return this._miniSearchInstances.get(caseId);
        }

        // Try loading from disk
        if (this._userDataPath) {
            const indexPath = path.join(this._userDataPath, 'keyword_indices', `keyword_index_${caseId}.json`);
            if (fs.existsSync(indexPath)) {
                try {
                    const json = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
                    const ms = MiniSearch.loadJSON(JSON.stringify(json), {
                        fields: ['text'],
                        storeFields: ['text', 'page', 'source', 'chunkIndex'],
                    });
                    this._miniSearchInstances.set(caseId, ms);
                    console.log(`[CivicVault] Loaded MiniSearch index for case ${caseId.substring(0, 8)} (${ms.documentCount} docs)`);
                    return ms;
                } catch (err) {
                    console.error(`[CivicVault] Failed to load MiniSearch index:`, err.message);
                }
            }
        }

        return null;
    }

    /**
     * Persist a MiniSearch instance to disk.
     * @param {string} caseId
     * @param {MiniSearch} ms
     */
    _saveMiniSearch(caseId, ms) {
        if (!this._userDataPath || !caseId) return;
        const indexPath = path.join(this._userDataPath, 'keyword_indices', `keyword_index_${caseId}.json`);
        try {
            fs.writeFileSync(indexPath, JSON.stringify(ms.toJSON()), 'utf-8');
            console.log(`[CivicVault] Saved MiniSearch index for case ${caseId.substring(0, 8)} (${ms.documentCount} docs)`);
        } catch (err) {
            console.error(`[CivicVault] Failed to save MiniSearch index:`, err.message);
        }
    }

    /**
     * Full pipeline for one PDF.
     *
     * @param {string} filePath
     * @param {string} fileName
     * @param {function} onProgress – ({ status, message, progress?, total? })
     * @param {string} [caseId] – Optional case ID for multi-case isolation
     */
    async ingestPDF(filePath, fileName, onProgress, caseId = null) {
        // Clear cache when new documents are added
        this._cache.clear();
        console.log('[CivicVault] Response cache cleared (new ingestion)');

        // ── Step 1: Read & parse PDF & generate Hash ──────────────────
        onProgress({ status: 'reading', message: 'Reading PDF file & Generating Hash…' });

        const buffer = fs.readFileSync(filePath);
        const crypto = require('crypto');
        const fileHash = crypto.createHash('sha256').update(buffer).digest('hex');
        const pdfParse = require('pdf-parse');

        // Capture per-page text for citation accuracy
        const pageTexts = [];
        const renderPage = async (pageData) => {
            const textContent = await pageData.getTextContent();
            let lastY = null;
            let text = '';
            for (const item of textContent.items) {
                if (lastY === item.transform[5] || lastY === null) {
                    text += item.str;
                } else {
                    text += '\n' + item.str;
                }
                lastY = item.transform[5];
            }
            pageTexts.push(text.trim());
            return text;
        };

        const pdfData = await pdfParse(buffer, { pagerender: renderPage });
        const numPages = pdfData.numpages;

        // ── Step 1b: OCR Fallback for Scanned Pages ───────────────────
        // Detect scanned pages (extracted text < 50 chars) and run local OCR
        const scannedPageIndices = [];
        for (let i = 0; i < pageTexts.length; i++) {
            if (pageTexts[i].trim().length < 50) {
                scannedPageIndices.push(i);
            }
        }

        if (scannedPageIndices.length > 0) {
            console.log(`[CivicVault] Detected ${scannedPageIndices.length} scanned page(s): ${scannedPageIndices.map(i => i + 1).join(', ')}. Running OCR...`);
            onProgress({
                status: 'ocr',
                message: `Detected ${scannedPageIndices.length} scanned page(s). Initializing Local OCR…`,
            });

            // Dynamically import ESM modules
            let convertToImages, Tesseract;
            try {
                const pdfImgModule = await import('pdf-to-image-generator');
                convertToImages = pdfImgModule.convertToImages;
            } catch (err) {
                console.error('[CivicVault] Failed to load pdf-to-image-generator:', err);
                throw new Error('Failed to load PDF-to-image library. Did you run npm install?');
            }
            try {
                Tesseract = require('tesseract.js');
            } catch (err) {
                console.error('[CivicVault] Failed to load tesseract.js:', err);
                throw new Error('Failed to load Tesseract OCR library. Did you run npm install?');
            }

            // Convert ONLY the scanned pages to images (0-indexed for pdf-to-image-generator)
            onProgress({
                status: 'ocr',
                message: `Converting ${scannedPageIndices.length} scanned page(s) to images…`,
            });

            let pageImages;
            try {
                const result = await convertToImages(filePath, {
                    pages: scannedPageIndices, // 0-indexed
                    scale: 2, // Higher resolution for better OCR accuracy
                    type: 'png',
                    includeBufferContent: true,
                });
                pageImages = result;
            } catch (err) {
                console.error('[CivicVault] PDF-to-image conversion failed:', err);
                throw new Error('Failed to convert scanned PDF pages to images for OCR.');
            }

            // Initialize a SINGLE Tesseract worker (performance optimization)
            onProgress({
                status: 'ocr',
                message: 'Starting Tesseract OCR engine (first run downloads ~4MB language data)…',
            });

            const worker = await Tesseract.createWorker('eng');

            // Run OCR on each scanned page image
            for (let idx = 0; idx < pageImages.length; idx++) {
                const img = pageImages[idx];
                const pageNum = scannedPageIndices[idx] + 1; // 1-indexed for display

                onProgress({
                    status: 'ocr',
                    message: `Running Local OCR on Page ${pageNum}… (${idx + 1}/${scannedPageIndices.length}) This may take a moment.`,
                    progress: idx + 1,
                    total: scannedPageIndices.length,
                });

                try {
                    const { data: { text } } = await worker.recognize(Buffer.from(img.content));
                    const ocrText = text.trim();
                    console.log(`[CivicVault] OCR Page ${pageNum}: extracted ${ocrText.length} chars`);

                    if (ocrText.length > 0) {
                        pageTexts[scannedPageIndices[idx]] = ocrText;
                    }
                } catch (ocrErr) {
                    console.error(`[CivicVault] OCR failed for page ${pageNum}:`, ocrErr.message);
                    // Leave the original (short) text — don't crash the pipeline
                }
            }

            // Terminate the worker to free RAM
            await worker.terminate();
            console.log('[CivicVault] Tesseract worker terminated. OCR complete.');

            onProgress({
                status: 'ocr',
                message: `OCR complete. Extracted text from ${scannedPageIndices.length} scanned page(s).`,
            });
        }

        // ── Step 2: Store each page as a single document ──────────────
        // Each page is 500-2000 chars — well within embedding model limits.
        // This preserves full page context and avoids splitting related content.
        onProgress({ status: 'splitting', message: 'Preparing pages…' });

        const documents = [];
        for (let pageIdx = 0; pageIdx < pageTexts.length; pageIdx++) {
            const pageText = pageTexts[pageIdx];
            if (!pageText || pageText.trim().length < 20) continue;

            documents.push({
                pageContent: pageText,
                metadata: {
                    source: fileName,
                    filePath,
                    page: pageIdx + 1,
                    pageLabel: `Page ${pageIdx + 1}`,
                    totalPages: numPages,
                    ocrExtracted: scannedPageIndices.length > 0 && scannedPageIndices.includes(pageIdx),
                    caseId: caseId || 'default',
                },
            });
        }

        // Number every chunk
        documents.forEach((doc, i) => {
            doc.metadata.chunkIndex = i;
        });

        const totalChunks = documents.length;
        onProgress({
            status: 'embedding',
            message: `Generating embeddings (0/${totalChunks})…`,
            progress: 0,
            total: totalChunks,
        });

        // ── Step 3: Embed & store in batches ──────────────────────────
        const BATCH_SIZE = 5;
        for (let i = 0; i < totalChunks; i += BATCH_SIZE) {
            const batch = documents.slice(i, i + BATCH_SIZE);
            const texts = batch.map((d) => d.pageContent);

            const embeddings = await ollamaEmbed(texts);
            await this.vectorStore.addDocuments(batch, embeddings);

            const done = Math.min(i + BATCH_SIZE, totalChunks);
            onProgress({
                status: 'embedding',
                message: `Generating embeddings (${done}/${totalChunks})…`,
                progress: done,
                total: totalChunks,
            });
        }

        // ── Done ────────────────────────────────────────────────────────
        const fileInfo = {
            name: fileName,
            path: filePath,
            numPages,
            numChunks: totalChunks,
            hash: fileHash,
            ocrPages: scannedPageIndices.length,
            ingestedAt: new Date().toISOString(),
        };

        this.ingestedFiles.push(fileInfo);

        // ── Step 4: Build/update MiniSearch keyword index ─────────────
        if (caseId) {
            onProgress({ status: 'indexing', message: 'Building keyword search index…' });

            let ms = this._getMiniSearch(caseId);
            if (!ms) {
                ms = new MiniSearch({
                    fields: ['text'],
                    storeFields: ['text', 'page', 'source', 'chunkIndex'],
                    searchOptions: {
                        boost: { text: 1 },
                        fuzzy: 0.2,
                        prefix: true,
                    },
                });
            }

            // Add documents to MiniSearch (using unique IDs)
            const msDocuments = documents.map((doc, idx) => ({
                id: `${caseId}_${fileName}_${idx}`,
                text: doc.pageContent,
                page: doc.metadata.page,
                source: doc.metadata.source,
                chunkIndex: doc.metadata.chunkIndex,
            }));

            // Filter out any docs with IDs that already exist
            const existingIds = new Set();
            try {
                msDocuments.forEach(d => {
                    if (!ms.has(d.id)) {
                        existingIds.add(d.id);
                    }
                });
            } catch (e) { /* ms.has may not exist in all versions */ }

            try {
                ms.addAll(msDocuments.filter(d => existingIds.has(d.id) || !existingIds.size));
            } catch (e) {
                // If duplicates, replace the whole index for this case
                ms = new MiniSearch({
                    fields: ['text'],
                    storeFields: ['text', 'page', 'source', 'chunkIndex'],
                    searchOptions: { boost: { text: 1 }, fuzzy: 0.2, prefix: true },
                });
                ms.addAll(msDocuments);
            }

            this._miniSearchInstances.set(caseId, ms);
            this._saveMiniSearch(caseId, ms);

            console.log(`[CivicVault] MiniSearch index: ${ms.documentCount} chunks for case ${caseId.substring(0, 8)}`);
        }

        onProgress({ status: 'done', message: 'Ingestion complete!', fileInfo });
        return fileInfo;
    }

    /**
     * HYBRID SEARCH — MiniSearch BM25 + Vector Cosine with Reciprocal Rank Fusion.
     *
     * Dual-query pipeline:
     *   A. Vector search (semantic similarity) → top 15
     *   B. MiniSearch BM25 (exact keyword matches) → top 15
     *   C. RRF fusion → merged, deduplicated, top-k results
     *
     * Each result is tagged with its retrieval method for UI transparency.
     */
    async search(query, k = 8, caseId = null) {
        if (this.vectorStore.size === 0) {
            return [];
        }

        const VECTOR_K = 15;
        const KEYWORD_K = 15;
        const RRF_K = 60;

        // ── Step A: Vector search (semantic similarity) ───────────────
        const [queryEmbedding] = await ollamaEmbed([query]);
        const vectorResults = await this.vectorStore.similaritySearch(queryEmbedding, VECTOR_K);

        // ── Step B: MiniSearch BM25 keyword search ───────────────────
        let miniSearchResults = [];
        const ms = caseId ? this._getMiniSearch(caseId) : null;

        if (ms) {
            try {
                const msHits = ms.search(query, { limit: KEYWORD_K });
                miniSearchResults = msHits.map(hit => ({
                    chunkIndex: hit.chunkIndex,
                    page: hit.page,
                    source: hit.source,
                    score: hit.score,
                    text: hit.text,
                }));
                console.log(`[CivicVault] MiniSearch BM25: ${miniSearchResults.length} keyword hits for "${query.substring(0, 50)}"`);
            } catch (err) {
                console.error('[CivicVault] MiniSearch query failed:', err.message);
            }
        }

        // Fallback to custom keyword search if MiniSearch not available
        const fallbackKeywordResults = !ms ? this.vectorStore.keywordSearch(query, KEYWORD_K) : [];

        // ── Step C: Reciprocal Rank Fusion ────────────────────────
        const fusedScores = new Map(); // chunkIndex -> { score, document, methods }

        // Vector results
        vectorResults.forEach((r, rank) => {
            const key = r.document.metadata.chunkIndex;
            if (!fusedScores.has(key)) {
                fusedScores.set(key, { score: 0, document: r.document, methods: [], vectorScore: r.score });
            }
            fusedScores.get(key).score += 1 / (RRF_K + rank + 1);
            if (!fusedScores.get(key).methods.includes('vector')) {
                fusedScores.get(key).methods.push('vector');
            }
        });

        // MiniSearch BM25 results (matched by chunkIndex back to vector store)
        if (miniSearchResults.length > 0) {
            miniSearchResults.forEach((hit, rank) => {
                const key = hit.chunkIndex;
                if (key === undefined) return;

                if (!fusedScores.has(key)) {
                    // Find the document from the vector store
                    const entry = this.vectorStore.entries.find(
                        e => e.document.metadata.chunkIndex === key
                    );
                    if (entry) {
                        fusedScores.set(key, { score: 0, document: entry.document, methods: [], vectorScore: 0 });
                    } else {
                        return; // Skip if not found
                    }
                }
                fusedScores.get(key).score += 3 / (RRF_K + rank + 1);
                if (!fusedScores.get(key).methods.includes('keyword')) {
                    fusedScores.get(key).methods.push('keyword');
                }
            });
        }

        // Fallback keyword results (when no MiniSearch)
        if (fallbackKeywordResults.length > 0) {
            fallbackKeywordResults.forEach((r, rank) => {
                const key = r.document.metadata.chunkIndex;
                if (!fusedScores.has(key)) {
                    fusedScores.set(key, { score: 0, document: r.document, methods: [], vectorScore: 0 });
                }
                fusedScores.get(key).score += 3 / (RRF_K + rank + 1);
                if (!fusedScores.get(key).methods.includes('keyword')) {
                    fusedScores.get(key).methods.push('keyword');
                }
            });
        }

        // 4. Sort by fused score, tag with retrieval method
        const fused = [...fusedScores.values()]
            .sort((a, b) => b.score - a.score)
            .slice(0, k)
            .map((r) => ({
                score: r.score,
                document: r.document,
                retrievalMethod: r.methods.length > 1 ? 'hybrid' : (r.methods[0] || 'vector'),
            }));

        // 5. SECTION EXPANSION — ensure consecutive pages from best keyword hit
        const topKeywordPage = miniSearchResults.length > 0
            ? miniSearchResults[0].page
            : (fallbackKeywordResults.length > 0 ? fallbackKeywordResults[0].document.metadata.page : null);

        if (topKeywordPage) {
            const resultPages = new Set(fused.map(r => r.document.metadata.page));
            const pagesToAdd = [];

            for (let delta = 0; delta <= 3; delta++) {
                const targetPage = topKeywordPage + delta;
                if (!resultPages.has(targetPage)) {
                    const pageEntry = this.vectorStore.entries.find(
                        e => e.document.metadata.page === targetPage
                    );
                    if (pageEntry) {
                        pagesToAdd.push({
                            score: 0.04,
                            document: pageEntry.document,
                            retrievalMethod: 'expansion',
                        });
                    }
                }
            }

            if (pagesToAdd.length > 0) {
                for (const page of pagesToAdd) {
                    fused.pop();
                    fused.push(page);
                }
                fused.sort((a, b) => a.document.metadata.page - b.document.metadata.page);
            }
        }

        console.log('[CivicVault] Hybrid RRF results:', fused.map(r =>
            `Page ${r.document.metadata.page} [${r.retrievalMethod}] (score: ${r.score.toFixed(4)})`
        ).join(', '));

        return fused;
    }

    /**
     * Find the contiguous section of pages for a specific subject.
     * Scans ALL pages for multi-word phrases from the query, then
     * distinguishes header pages (phrase near top) from index pages
     * (phrase buried in a list). Returns the header page + next 3 pages.
     *
     * @param {string} query
     * @returns {Array} - array of { document } from the vector store, or empty
     */
    findSubjectSection(query) {
        if (this.vectorStore.size === 0) return [];

        // AGGRESSIVE NORMALIZATION: strip ALL punctuation, hyphens, dashes, special chars
        // "Engineering Mathematics-II" → "engineering mathematics ii"
        // "Engineering Mathematics – 2" → "engineering mathematics 2"
        const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

        const queryNorm = normalize(query);

        // Extract subject name by removing question words
        const stopWords = new Set(['list', 'all', 'units', 'and', 'sub', 'topics', 'subtopics',
            'for', 'of', 'the', 'in', 'what', 'are', 'give', 'me', 'show', 'tell', 'about']);
        const subjectWords = queryNorm.split(' ').filter(w => !stopWords.has(w) && w.length > 0);

        // Separate base name from number: "engineering mathematics 2" → base="engineering mathematics", num="2"
        const arabicToRoman = { '1': 'i', '2': 'ii', '3': 'iii', '4': 'iv', '5': 'v', '6': 'vi' };
        const romanToArabic = Object.fromEntries(Object.entries(arabicToRoman).map(([a, r]) => [r, a]));

        let subjectNum = null;
        let subjectNumRoman = null;
        const baseWords = [];
        for (const w of subjectWords) {
            if (arabicToRoman[w]) {
                subjectNum = w;
                subjectNumRoman = arabicToRoman[w];
            } else if (romanToArabic[w]) {
                subjectNumRoman = w;
                subjectNum = romanToArabic[w];
            } else {
                baseWords.push(w);
            }
        }
        const baseName = baseWords.join(' '); // "engineering mathematics"

        console.log('[CivicVault] Subject detection:');
        console.log('  Base name:', baseName);
        console.log('  Number:', subjectNum, '/ Roman:', subjectNumRoman);

        // STRICT UNIT PATTERN: matches "Unit I", "Unit II", "Unit 1" etc.
        // Does NOT match "Unit Test" or "Unit No"
        const hasSyllabusUnits = (text) => /unit[\s-]*[ivx\d]+/i.test(text) && !/unit\s*(test|no)/i.test(text);

        // Score each page
        const pageScores = [];
        for (const entry of this.vectorStore.entries) {
            const rawText = entry.document.pageContent;
            const text = normalize(rawText);
            const page = entry.document.metadata.page;
            const headerZone = text.substring(0, 400);
            let score = 0;
            let tier = '';

            const hasBase = headerZone.includes(baseName);
            const hasNum = subjectNum
                ? (text.includes(subjectNum) || text.includes(subjectNumRoman))
                : true;

            // Check if number is ADJACENT to the base name (within 5 chars)
            // This prevents "Semester – II" from matching when we want "Mathematics-II"
            const hasCorrectNum = (() => {
                if (!subjectNum) return true;
                if (!hasBase) return false;
                const baseIdx = headerZone.indexOf(baseName);
                if (baseIdx < 0) return false;
                // Look at the 20 chars after the base name ends
                const afterBase = headerZone.substring(baseIdx + baseName.length, baseIdx + baseName.length + 20);
                return afterBase.includes(subjectNum) || afterBase.includes(subjectNumRoman);
            })();

            const hasUnits = hasSyllabusUnits(rawText);
            const hasCourseKeyword = /\bcourse\b/i.test(rawText.substring(0, 300));

            // Check if NEXT page has actual units (for intro/objectives pages)
            const nextEntry = this.vectorStore.entries.find(
                e => e.document.metadata.page === page + 1
            );
            const nextHasUnits = nextEntry ? hasSyllabusUnits(nextEntry.document.pageContent) : false;

            // TIER 1 (1000pts): Subject + correct number in header + actual unit content
            if (hasBase && hasCorrectNum && hasUnits) {
                score = 1000;
                tier = 'TIER1-syllabus';
            }
            // TIER 1b (800pts): Subject in header + correct number + NEXT page has units
            // This handles: page 39 = intro, page 40 = units
            else if (hasBase && hasCorrectNum && nextHasUnits) {
                score = 900;
                tier = 'TIER1b-intro+units-next';
            }
            // TIER 1c (800pts): Subject in header + number ANYwhere + unit content
            else if (hasBase && hasNum && hasUnits) {
                score = 800;
                tier = 'TIER1c-units';
            }
            // TIER 2 (100-300pts): Subject + number in header, no units nearby
            else if (hasBase && hasCorrectNum) {
                // Boost if this is a COURSE page (not a semester index table)
                score = hasCourseKeyword ? 300 : 100;
                tier = hasCourseKeyword ? 'TIER2-course' : 'TIER2-header';
            }
            // TIER 3 (1pt): Base name mentioned somewhere
            else if (text.includes(baseName) && hasNum) {
                score = 1;
                tier = 'TIER3-mention';
            }

            if (score > 0) {
                pageScores.push({ page, score, tier, document: entry.document });
                const preview = rawText.substring(0, 120).replace(/\n/g, ' ');
                console.log(`  Page ${page} [${tier}] score=${score}: "${preview}..."`);
            }
        }

        if (pageScores.length === 0) {
            console.log('[CivicVault] No subject section found, falling back to search');
            return [];
        }

        // Sort by score
        pageScores.sort((a, b) => b.score - a.score);
        const best = pageScores[0];

        // If best is only TIER 2 (header, no units), check if NEXT page has units
        // The subject intro/objectives page is often followed by the units page
        if (best.tier === 'TIER2-header') {
            const nextPage = this.vectorStore.entries.find(
                e => e.document.metadata.page === best.page + 1
            );
            if (nextPage && hasSyllabusUnits(nextPage.document.pageContent)) {
                console.log(`[CivicVault] Best is header-only, but Page ${best.page + 1} has units → shifting start`);
                // Keep the header page but ensure units page is first in context
            }
        }

        console.log(`[CivicVault] Best section: Page ${best.page} [${best.tier}]`);

        // Take 4 pages starting from best page
        const sectionPages = [];
        for (let p = best.page; p <= best.page + 3; p++) {
            const entry = this.vectorStore.entries.find(
                e => e.document.metadata.page === p
            );
            if (entry) {
                sectionPages.push({ score: 1, document: entry.document });
            }
        }

        console.log('[CivicVault] Section pages:', sectionPages.map(r =>
            `Page ${r.document.metadata.page}`
        ).join(', '));

        return sectionPages;
    }

    /**
     * RAG search with subject section detection.
     *   1. Try to find a contiguous subject section via direct page scanning
     *   2. Fall back to hybrid search if no section found
     *   3. Send pages to LLM for extraction
     *   4. Return answer + sources
     */
    async searchWithAnswer(query, chatHistory = [], llmModel = 'llama3', onToken = null) {
        // ── Cache check ───────────────────────────────────────────────
        const cacheKey = `${query.trim().toLowerCase()}|${llmModel}`;
        if (this._cache.has(cacheKey)) {
            const cached = this._cache.get(cacheKey);
            console.log('[CivicVault] Cache HIT:', cacheKey.substring(0, 50));

            // Replay the answer through the streaming callback for UI consistency
            if (onToken && cached.answer) {
                onToken(cached.answer);
            }

            // Move to end (most recently used)
            this._cache.delete(cacheKey);
            this._cache.set(cacheKey, cached);
            return cached;
        }

        // ── Step 1: Find subject section OR use hybrid search ──────────
        const results = await this.search(query, 8);

        if (results.length === 0) {
            return {
                answer: 'Information not found in the indexed document.',
                sources: [],
                chunks: [],
            };
        }

        // Skip expensive section detection for small docs (< 30 pages)
        // and when no multi-page syllabus structure is expected
        let sectionPages = [];
        if (this.vectorStore.size > 30) {
            sectionPages = this.findSubjectSection(query);
        }

        // Use section pages for LLM context if found, otherwise top 5 search results
        const llmChunks = sectionPages.length > 0
            ? sectionPages
            : results.slice(0, 5);

        console.log('[CivicVault] LLM context pages:', llmChunks.map(r =>
            `Page ${r.document.metadata.page}`
        ).join(', '));

        // ── Step 2: Format page content (compressed) ─────────────────
        const contextParts = llmChunks.map((r) => {
            const m = r.document.metadata;
            // Compress whitespace to reduce token count and LLM processing time
            const compressed = r.document.pageContent
                .replace(/\n{3,}/g, '\n\n')       // collapse triple+ newlines
                .replace(/[ \t]{2,}/g, ' ')       // collapse multiple spaces/tabs
                .replace(/^\s+$/gm, '')           // remove whitespace-only lines
                .trim();
            return `[Page ${m.page}]\n${compressed}`;
        });
        const context = contextParts.join('\n\n---\n\n');

        // ── Step 3: Short system prompt + content in user message ─────
        const systemPrompt = `You are a document assistant. Answer questions using ONLY the document pages provided by the user.

OUTPUT RULES:
- Include ALL items — list every unit, every topic. Do not stop early.
- Do not add notes, opinions, disclaimers, or meta-commentary.
- Format your answer in clean markdown:
  - Use ## for main sections (e.g., ## Unit I - Introduction to Data Structures)
  - Use **bold** for key terms
  - Use - bullet lists for sub-topics
  - Start with a > blockquote citing the source: > Source: "filename", Pages X-Y`;

        // ── Step 4: Build messages with conversation history ──────────
        const messages = [{ role: 'system', content: systemPrompt }];

        const recentHistory = chatHistory.slice(-6);
        for (const turn of recentHistory) {
            messages.push({ role: turn.role, content: turn.content });
        }

        const userMessage = `Here are the document pages:\n\n${context}\n\nQuestion: ${query}\n\nRemember: Use markdown formatting. List EVERY item from ALL pages.`;
        messages.push({ role: 'user', content: userMessage });

        // ── Step 5: Call Ollama LLM (VRAM-aware adaptive routing) ───
        // Estimate tokens: ~4 chars per token. Add buffer for system prompt + response.
        const estimatedInputTokens = Math.ceil(context.length / 4) + 300;
        const adaptiveNumPredict = Math.min(2048, Math.max(512, estimatedInputTokens));
        const adaptiveNumCtx = estimatedInputTokens + adaptiveNumPredict + 256;

        // ── Option 1: VRAM-Aware Preemptive CPU Routing ───────────────
        // Two layers of defense:
        //   A) Universal safety: if context > 2048 tokens → force CPU
        //      (GPUs under 8GB can't handle 7B model + large context)
        //   B) VRAM-based: if we know the VRAM, do an exact check
        const SAFE_GPU_CTX_LIMIT = 2048; // safe for most GPUs with 7B models
        const MODEL_FOOTPRINT_MB = 3800;
        const MB_PER_1K_TOKENS = 50;

        let forceCPU = false;
        let forceReason = '';

        // Layer A: Universal safety — large context always uses CPU
        if (adaptiveNumCtx > SAFE_GPU_CTX_LIMIT) {
            forceCPU = true;
            forceReason = `context ${adaptiveNumCtx} exceeds safe GPU limit ${SAFE_GPU_CTX_LIMIT}`;
        }

        // Layer B: VRAM-based check (when profile IS loaded)
        if (!forceCPU && this._vramMB > 0) {
            const requiredVRAM = MODEL_FOOTPRINT_MB + (adaptiveNumCtx / 1000) * MB_PER_1K_TOKENS;
            const isGPU = this._gpuBackend.includes('CUDA') || this._gpuBackend.includes('DirectML') || this._gpuBackend.includes('ROCm');
            if (isGPU && requiredVRAM >= this._vramMB) {
                forceCPU = true;
                forceReason = `need ~${Math.round(requiredVRAM)}MB VRAM, have ${this._vramMB}MB`;
            }
        }

        if (forceCPU) {
            console.log(`[CivicVault] ⚠️ CPU routing: ${forceReason}. Setting num_gpu=0.`);
        } else {
            console.log(`[CivicVault] Adaptive LLM: ~${estimatedInputTokens} input tokens, num_ctx=${adaptiveNumCtx}, num_predict=${adaptiveNumPredict} (GPU)`);
        }

        const llmOptions = {
            num_predict: adaptiveNumPredict,
            num_ctx: adaptiveNumCtx,
            temperature: 0,
        };

        // Force CPU: num_gpu=0 tells Ollama to offload 0 layers to GPU
        if (forceCPU) {
            llmOptions.num_gpu = 0;
        }

        let answer;
        try {
            answer = await ollamaChatStream(messages, llmModel, onToken, 'http://localhost:11434', llmOptions);
        } catch (err) {
            // ── Option 2: CUDA Error Auto-Retry on CPU ────────────────
            const errMsg = (err.message || '').toLowerCase();
            const isCudaError = errMsg.includes('cuda') || errMsg.includes('gpu') || errMsg.includes('out of memory') || errMsg.includes('oom');

            if (isCudaError && !forceCPU) {
                console.log(`[CivicVault] 🔄 CUDA error detected: "${err.message}". Retrying on CPU (num_gpu=0)...`);
                try {
                    answer = await ollamaChatStream(messages, llmModel, onToken, 'http://localhost:11434', {
                        ...llmOptions,
                        num_gpu: 0,
                    });
                } catch (retryErr) {
                    answer = 'LLM failed on GPU and CPU (' + retryErr.message + '). Showing raw search results below.';
                }
            } else {
                answer = 'LLM not available (' + err.message + '). Showing raw search results below.';
            }
        }

        // ── Step 6: Build sources ─────────────────────────────────────
        const sources = results.map((r) => ({
            source: r.document.metadata.source,
            page: r.document.metadata.page,
            score: Math.round(r.score * 100) / 100,
            excerpt: r.document.pageContent.slice(0, 200) + '…',
        }));

        const result = { answer, sources, chunks: results };

        // ── Cache the result ──────────────────────────────────────────
        if (answer && !answer.startsWith('LLM not available')) {
            // Evict oldest entry if cache is full
            if (this._cache.size >= this._cacheMax) {
                const oldest = this._cache.keys().next().value;
                this._cache.delete(oldest);
            }
            this._cache.set(cacheKey, result);
            console.log(`[CivicVault] Cached response (${this._cache.size}/${this._cacheMax})`);
        }

        return result;
    }

    /**
     * Helper to safely trim markdown from JSON string and parse it
     */
    stripJsonMarkdown(str) {
        if (!str) return [];

        // 1. Find the actual JSON block (ignores conversation text like "Here is the response:")
        let firstIndex = str.search(/[{[]/);
        let lastIndex = -1;
        for (let i = str.length - 1; i >= 0; i--) {
            if (str[i] === '}' || str[i] === ']') {
                lastIndex = i;
                break;
            }
        }

        if (firstIndex === -1 || lastIndex === -1 || lastIndex < firstIndex) {
            console.error('[CivicVault] No JSON brackets found in LLM response:\n', str);
            return [];
        }

        const cleanStr = str.substring(firstIndex, lastIndex + 1);

        try {
            let parsed = JSON.parse(cleanStr);
            let result = [];

            if (Array.isArray(parsed)) {
                result = parsed;
            } else if (parsed && typeof parsed === 'object') {
                // If it returned an object, find any arrays inside
                for (const key of Object.keys(parsed)) {
                    if (Array.isArray(parsed[key])) {
                        result = result.concat(parsed[key]);
                    }
                }

                // If no inner arrays, try to use the object itself
                if (result.length === 0) {
                    if (parsed.date || parsed.event || parsed.case_name || parsed.decision_date || parsed.outcomes) {
                        result = [parsed];
                    }
                }
            }

            // 2. Map whatever crazy JSON schema the LLM hallucinates into our required 'date/event/source' format
            let globalDate = (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
                ? (parsed.date || parsed.decision_date)
                : "Unknown Date";

            let mappedResult = [];
            for (const item of result) {
                if (item && typeof item === 'object') {
                    let date = item.date || item.time || globalDate;

                    // Construct a fallback event string if 'event' is missing
                    let eventStr = item.event || item.description || item.sentence_imposed || item.status || item.conviction_status || item.case_name;

                    if (!eventStr) {
                        // Fallback: stringify the object if we can't find an event description
                        const cleanObj = { ...item };
                        delete cleanObj.date;
                        delete cleanObj.decision_date;
                        delete cleanObj.source;
                        const vals = Object.values(cleanObj).filter(v => v);
                        eventStr = vals.map(v => typeof v === 'object' ? JSON.stringify(v) : v).join(" | ");
                    }

                    let source = item.source || item.offence_number || "LLM Extracted";

                    mappedResult.push({
                        date: String(date).substring(0, 50),
                        event: String(eventStr).substring(0, 600),
                        source: String(source).substring(0, 50)
                    });
                } else if (typeof item === 'string') {
                    // It just returned an array of strings
                    mappedResult.push({ date: "Unknown Date", event: item, source: "LLM Extracted" });
                }
            }

            // Ensure we don't return an empty array if the parsed root object had summary data
            if (mappedResult.length === 0 && parsed && typeof parsed === 'object') {
                if (parsed.case_name || parsed.decision || parsed.reasoning) {
                    mappedResult.push({
                        date: String(parsed.decision_date || "Unknown Date"),
                        event: `Case: ${parsed.case_name || 'Unknown'}. ${JSON.stringify(parsed.decision || parsed.outcomes || "Extracted details")}`,
                        source: "Document Summary"
                    });
                }
            }

            return mappedResult;
        } catch (err) {
            console.error('[CivicVault] Failed to parse timeline JSON:', err.message, '\nRaw extracted block:', cleanStr);
            return [];
        }
    }

    /**
     * Extracts a chronological timeline using a HYBRID approach:
     * Step 1: Regex scans ALL raw text to find every date pattern (deterministic, can't miss any).
     * Step 2: For each date found, extract surrounding context (the sentence/paragraph).
     * Step 3: Send ONE focused LLM call with the pre-found dates + context for event descriptions.
     * This bypasses small-model summarization bias.
     */
    async extractTimeline(llmModel = 'llama3') {
        if (this.vectorStore.size === 0) {
            return [];
        }

        // 1. Retrieve ALL chunks from the vector store to get the full document text
        const query = "dates, timeline, chronology, sequence of events, years, months, days, dates of arrest, hearings, occurrences";
        const k = Math.max(this.vectorStore.size, 20); // Get everything
        const results = await this.search(query, k);

        if (results.length === 0) {
            return [];
        }

        // Sort by page to preserve document order
        results.sort((a, b) => a.document.metadata.page - b.document.metadata.page);

        // Build the full document text
        const fullText = results
            .map((r) => r.document.pageContent)
            .join('\n');

        // 2. REGEX: Find ALL date patterns in the raw text
        const datePatterns = [
            // DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY
            /(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/g,
            // YYYY-MM-DD (ISO)
            /(\d{4})-(\d{1,2})-(\d{1,2})/g,
            // "January 15, 2020", "15 January 2020", "January 2020"
            /(\d{1,2}\s+)?(January|February|March|April|May|June|July|August|September|October|November|December)(\s+\d{1,2})?,?\s+\d{4}/gi,
            // "15th January 2020", "1st March 2019"
            /\d{1,2}(?:st|nd|rd|th)\s+(?:January|February|March|April|May|June|July|August|September|October|November|December),?\s+\d{4}/gi,
            // "Jan 2020", "Feb 15, 2020" (abbreviated months)
            /(\d{1,2}\s+)?(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+(\d{1,2},?\s+)?\d{4}/gi,
        ];

        const foundDates = new Map(); // date string -> { contexts: [], pages: [] }

        for (const r of results) {
            const text = r.document.pageContent;
            const page = r.document.metadata.page;

            for (const pattern of datePatterns) {
                pattern.lastIndex = 0; // Reset regex state
                let match;
                while ((match = pattern.exec(text)) !== null) {
                    const dateStr = match[0].trim();
                    // Get surrounding context (100 chars before and after)
                    const start = Math.max(0, match.index - 120);
                    const end = Math.min(text.length, match.index + match[0].length + 120);
                    const surroundingContext = text.substring(start, end).replace(/\s+/g, ' ').trim();

                    if (!foundDates.has(dateStr)) {
                        foundDates.set(dateStr, { contexts: [], pages: new Set() });
                    }
                    const entry = foundDates.get(dateStr);
                    entry.contexts.push(surroundingContext);
                    entry.pages.add(page);
                }
            }
        }

        console.log(`[CivicVault] Regex found ${foundDates.size} unique dates in document.`);

        // If regex found no dates at all, fall back to pure LLM approach
        if (foundDates.size === 0) {
            console.log('[CivicVault] No dates found by regex, falling back to pure LLM extraction...');
            return this._llmOnlyTimeline(llmModel, results);
        }

        // 3. Build a focused prompt with the pre-extracted dates + their contexts
        const dateEntries = [];
        for (const [dateStr, data] of foundDates) {
            const contextSnippet = data.contexts.slice(0, 2).join(' ... '); // Take up to 2 context snippets
            const pages = [...data.pages].sort((a, b) => a - b).join(', ');
            dateEntries.push(`DATE: "${dateStr}" | CONTEXT: "${contextSnippet}" | PAGES: ${pages}`);
        }

        const datesBlock = dateEntries.join('\n');

        // 2b. Setup LangChain ChatOllama
        let ChatOllama;
        try {
            const module = await import('@langchain/ollama');
            ChatOllama = module.ChatOllama;
        } catch (err) {
            console.error('[CivicVault] Failed to load @langchain/ollama:', err);
            throw new Error('Failed to load local AI model integration. Did you run npm install?');
        }

        const jsonSchema = {
            type: "object",
            properties: {
                timeline: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            date: { type: "string" },
                            event: { type: "string" },
                            source: { type: "string" }
                        },
                        required: ["date", "event", "source"]
                    }
                }
            },
            required: ["timeline"]
        };

        const llm = new ChatOllama({
            model: llmModel,
            format: jsonSchema,
            temperature: 0,
            baseUrl: "http://localhost:11434",
            numCtx: 4096,
            numPredict: 4096
        });

        // 4. Send ONE focused LLM call: "Here are the dates I found. Describe each event."
        const userMessage = `I found the following dates in a legal document. For EACH date below, write a one-sentence description of what happened on that date based on the surrounding context provided.

You MUST include ALL ${foundDates.size} dates in your response. Do NOT skip any.

${datesBlock}

Output a JSON object with a "timeline" array. Each element must have "date", "event", and "source" keys.`;

        console.log(`[CivicVault] Generating timeline with ${llmModel} (${foundDates.size} pre-extracted dates)...`);
        try {
            const response = await llm.invoke([
                ["user", userMessage]
            ]);

            console.log('\n[CivicVault] --- RAW OLLAMA TIMELINE OUTPUT ---');
            console.log(response.content);
            console.log('-------------------------------------------------\n');

            let events = this.stripJsonMarkdown(response.content);

            // 5. Safety net: if the LLM STILL didn't return all dates, manually inject the missing ones
            const llmDates = new Set(events.map(e => e.date));
            for (const [dateStr, data] of foundDates) {
                if (!llmDates.has(dateStr)) {
                    const contextSnippet = data.contexts[0] || '';
                    const pages = [...data.pages].sort((a, b) => a - b);
                    events.push({
                        date: dateStr,
                        event: contextSnippet.length > 200 ? contextSnippet.substring(0, 200) + '...' : contextSnippet,
                        source: `Page ${pages[0] || 'Unknown'}`
                    });
                }
            }

            return events;
        } catch (err) {
            console.error('[CivicVault] LLM timeline failed, falling back to regex-only:', err);

            // FALLBACK: If the LLM fails entirely, just return the regex-found dates with raw context
            if (err.message && err.message.includes('not found')) {
                throw new Error(`Model '${llmModel}' is not installed in Ollama. Please run: ollama run ${llmModel}`);
            }

            const fallbackEvents = [];
            for (const [dateStr, data] of foundDates) {
                const pages = [...data.pages].sort((a, b) => a - b);
                fallbackEvents.push({
                    date: dateStr,
                    event: data.contexts[0] || 'Event mentioned in document',
                    source: `Page ${pages[0] || 'Unknown'}`
                });
            }
            return fallbackEvents;
        }
    }

    /**
     * Pure LLM fallback for when regex finds no dates (unlikely).
     */
    async _llmOnlyTimeline(llmModel, results) {
        let ChatOllama;
        try {
            const module = await import('@langchain/ollama');
            ChatOllama = module.ChatOllama;
        } catch (err) {
            throw new Error('Failed to load local AI model integration.');
        }

        const context = results
            .slice(0, 10)
            .map((r) => `--- PAGE ${r.document.metadata.page} ---\n${r.document.pageContent}`)
            .join('\n\n');

        const jsonSchema = {
            type: "object",
            properties: {
                timeline: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            date: { type: "string" },
                            event: { type: "string" },
                            source: { type: "string" }
                        },
                        required: ["date", "event", "source"]
                    }
                }
            },
            required: ["timeline"]
        };

        const llm = new ChatOllama({
            model: llmModel,
            format: jsonSchema,
            temperature: 0,
            baseUrl: "http://localhost:11434",
            numCtx: 4096,
            numPredict: 4096
        });

        const userMessage = `Extract a chronological timeline from the document below. Find every event.\n\nDocument:\n---\n${context}\n---`;
        const response = await llm.invoke([["user", userMessage]]);
        return this.stripJsonMarkdown(response.content);
    }

    getVectorStore() {
        return this.vectorStore;
    }

    getIngestedFiles() {
        return [...this.ingestedFiles];
    }
}

// ═══════════════════════════════════════════════════════════════════════
// 5. OLLAMA CHAT — Streaming HTTP to localhost:11434/api/chat
// ═══════════════════════════════════════════════════════════════════════

/**
 * Stream chat completion from Ollama.
 * @param {Array} messages - chat messages
 * @param {string} model - model name
 * @param {Function} onToken - callback(tokenText) called for each generated token
 * @param {string} baseUrl - Ollama base URL
 * @returns {Promise<string>} - full concatenated answer
 */
function ollamaChatStream(messages, model = 'llama3', onToken = null, baseUrl = 'http://localhost:11434', llmOptions = {}) {
    return new Promise((resolve, reject) => {
        const url = new URL('/api/chat', baseUrl);
        const payload = JSON.stringify({
            model,
            messages,
            stream: true,
            options: {
                num_predict: 1024,
                num_ctx: 2048,
                temperature: 0,
                ...llmOptions,  // caller overrides take priority
            },
        });

        let fullAnswer = '';

        const req = http.request(
            {
                hostname: url.hostname,
                port: url.port,
                path: url.pathname,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(payload),
                },
            },
            (res) => {
                if (res.statusCode !== 200) {
                    let body = '';
                    res.on('data', (chunk) => (body += chunk));
                    res.on('end', () => reject(new Error(`Ollama chat returned ${res.statusCode}: ${body.slice(0, 200)}`)));
                    return;
                }

                let buffer = '';
                res.on('data', (chunk) => {
                    buffer += chunk.toString();
                    // Ollama streams NDJSON — one JSON object per line
                    const lines = buffer.split('\n');
                    buffer = lines.pop(); // keep incomplete last line in buffer

                    for (const line of lines) {
                        if (!line.trim()) continue;
                        try {
                            const data = JSON.parse(line);
                            const token = data.message?.content || '';
                            if (token) {
                                fullAnswer += token;
                                if (onToken) onToken(token);
                            }
                        } catch (e) {
                            // skip malformed lines
                        }
                    }
                });

                res.on('end', () => {
                    // Process any remaining buffer
                    if (buffer.trim()) {
                        try {
                            const data = JSON.parse(buffer);
                            const token = data.message?.content || '';
                            if (token) {
                                fullAnswer += token;
                                if (onToken) onToken(token);
                            }
                        } catch (e) {
                            // skip
                        }
                    }
                    resolve(fullAnswer || 'No response from model.');
                });
            }
        );

        req.on('error', (err) => {
            reject(new Error('Cannot connect to Ollama for chat: ' + err.message));
        });

        req.setTimeout(120000, () => {
            req.destroy();
            reject(new Error('Ollama chat timed out after 120 seconds.'));
        });

        req.write(payload);
        req.end();
    });
}

module.exports = { IngestionEngine };

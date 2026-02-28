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
const crypto = require('crypto'); // Added crypto module

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
    }

    /**
     * Full pipeline for one PDF.
     *
     * @param {string} filePath
     * @param {string} fileName
     * @param {function} onProgress – ({ status, message, progress?, total? })
     */
    async ingestPDF(filePath, fileName, onProgress) {
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

        // ── Done ──────────────────────────────────────────────────────
        const fileInfo = {
            name: fileName,
            path: filePath,
            numPages,
            numChunks: totalChunks,
            hash: fileHash,
            ingestedAt: new Date().toISOString(),
        };

        this.ingestedFiles.push(fileInfo);

        onProgress({ status: 'done', message: 'Ingestion complete!', fileInfo });
        return fileInfo;
    }

    /**
     * HYBRID SEARCH — combines keyword + vector using Reciprocal Rank Fusion.
     *
     * This solves the core problem: vector-only search can't distinguish between
     * different subjects that all have "units and topics" — keyword search can,
     * because it matches exact terms like "Linear Data Structures".
     */
    async search(query, k = 8) {
        if (this.vectorStore.size === 0) {
            return [];
        }

        // 1. Vector search — semantic similarity
        const [queryEmbedding] = await ollamaEmbed([query]);
        const vectorResults = await this.vectorStore.similaritySearch(queryEmbedding, k * 2);

        // 2. Keyword search — BM25-style term matching
        const keywordResults = this.vectorStore.keywordSearch(query, k * 2);

        // 3. Reciprocal Rank Fusion — merge both ranked lists
        const RRF_K = 60; // standard RRF constant
        const fusedScores = new Map(); // chunkIndex -> { score, document }

        // Vector results get 1x weight
        vectorResults.forEach((r, rank) => {
            const key = r.document.metadata.chunkIndex;
            if (!fusedScores.has(key)) {
                fusedScores.set(key, { score: 0, document: r.document, vectorScore: r.score });
            }
            fusedScores.get(key).score += 1 / (RRF_K + rank + 1);
        });

        // Keyword results get 3x weight (exact matches should dominate)
        keywordResults.forEach((r, rank) => {
            const key = r.document.metadata.chunkIndex;
            if (!fusedScores.has(key)) {
                fusedScores.set(key, { score: 0, document: r.document, vectorScore: 0 });
            }
            fusedScores.get(key).score += 3 / (RRF_K + rank + 1);
        });

        // 4. Sort by fused score
        const fused = [...fusedScores.values()]
            .sort((a, b) => b.score - a.score)
            .slice(0, k)
            .map((r) => ({ score: r.score, document: r.document }));

        // 5. SECTION EXPANSION — ensure consecutive pages from the best
        //    keyword match are included. Syllabus content always spans
        //    multiple consecutive pages (e.g., "Linear Data Structures" on
        //    page 56, Units I-IV on page 57, Units V-VI on page 58).
        const topKeywordPage = keywordResults.length > 0
            ? keywordResults[0].document.metadata.page
            : null;

        if (topKeywordPage) {
            const resultPages = new Set(fused.map(r => r.document.metadata.page));
            const pagesToAdd = [];

            // Include the next 3 pages after the top keyword match
            for (let delta = 0; delta <= 3; delta++) {
                const targetPage = topKeywordPage + delta;
                if (!resultPages.has(targetPage)) {
                    // Find this page in the vector store
                    const pageEntry = this.vectorStore.entries.find(
                        e => e.document.metadata.page === targetPage
                    );
                    if (pageEntry) {
                        pagesToAdd.push({
                            score: 0.04, // reasonable baseline score
                            document: pageEntry.document,
                        });
                    }
                }
            }

            // Replace lowest-scoring results with the missing section pages
            if (pagesToAdd.length > 0) {
                for (const page of pagesToAdd) {
                    fused.pop(); // remove lowest score
                    fused.push(page);
                }
                // Re-sort by page number for readability
                fused.sort((a, b) => a.document.metadata.page - b.document.metadata.page);
            }
        }

        console.log('[CivicVault] Final results after section expansion:', fused.map(r =>
            `Page ${r.document.metadata.page} (score: ${r.score.toFixed(4)})`
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

        // Try subject section detection first (handles multi-page syllabus content)
        const sectionPages = this.findSubjectSection(query);

        // Use section pages for LLM context if found, otherwise top 5 search results
        const llmChunks = sectionPages.length > 0
            ? sectionPages
            : results.slice(0, 5);

        console.log('[CivicVault] LLM context pages:', llmChunks.map(r =>
            `Page ${r.document.metadata.page}`
        ).join(', '));

        // ── Step 2: Format page content ───────────────────────────────
        const contextParts = llmChunks.map((r) => {
            const m = r.document.metadata;
            return `[Page ${m.page}]\n${r.document.pageContent}`;
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

        // ── Step 5: Call Ollama LLM ───────────────────────────────────
        let answer;
        try {
            answer = await ollamaChatStream(messages, llmModel, onToken);
        } catch (err) {
            answer = 'LLM not available (' + err.message + '). Showing raw search results below.';
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
function ollamaChatStream(messages, model = 'llama3', onToken = null, baseUrl = 'http://localhost:11434') {
    return new Promise((resolve, reject) => {
        const url = new URL('/api/chat', baseUrl);
        const payload = JSON.stringify({
            model,
            messages,
            stream: true,
            options: {
                num_predict: 4096,
                num_ctx: 4096,      // reduced from 8192 — prevents CUDA OOM
                temperature: 0,
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

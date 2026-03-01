const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { profileSystem } = require('./hardwareScanner.cjs');

// ── Catch-all error handlers (prevent silent exits) ──────────────────
process.on('uncaughtException', (err) => {
    console.error('[CivicVault] Uncaught exception:', err);
});
process.on('unhandledRejection', (reason) => {
    console.error('[CivicVault] Unhandled rejection:', reason);
});

// ── Lazy-load ingestion engine (avoids startup crashes) ──────────────
let ingestionEngine = null;
function getIngestionEngine() {
    if (!ingestionEngine) {
        const { IngestionEngine } = require('./ingestion.cjs');
        ingestionEngine = new IngestionEngine();
    }
    return ingestionEngine;
}

const isDev = !app.isPackaged;
let mainWindow = null;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1024,
        minHeight: 700,
        frame: false,
        titleBarStyle: 'hidden',
        backgroundColor: '#080812',
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
        },
        icon: path.join(__dirname, '..', 'public', 'icon.png'),
        show: false,
    });

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
    } else {
        mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    // ── Window Controls ───────────────────────────────────────────────
    ipcMain.on('window:minimize', () => mainWindow?.minimize());
    ipcMain.on('window:maximize', () => {
        if (!mainWindow) return;
        if (mainWindow.isMaximized()) mainWindow.unmaximize();
        else mainWindow.maximize();
    });
    ipcMain.on('window:close', () => mainWindow?.close());

    // ── File Dialog ───────────────────────────────────────────────────
    ipcMain.handle('dialog:open-pdf', async () => {
        if (!mainWindow) return [];
        const result = await dialog.showOpenDialog(mainWindow, {
            title: 'Select PDF Case Files',
            filters: [{ name: 'PDF Documents', extensions: ['pdf'] }],
            properties: ['openFile', 'multiSelections'],
        });
        if (result.canceled) return [];
        return result.filePaths;
    });

    // ── PDF Ingestion ─────────────────────────────────────────────────
    ipcMain.handle('ingest:process-pdf', async (event, fileInfo) => {
        const { filePath, fileName } = fileInfo;

        const sendProgress = (data) => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('ingestion:progress', {
                    ...data,
                    fileName,
                });
            }
        };

        try {
            const engine = getIngestionEngine();
            const result = await engine.ingestPDF(filePath, fileName, sendProgress);
            return { success: true, fileInfo: result };
        } catch (error) {
            console.error('[CivicVault] Ingestion error:', error);
            sendProgress({ status: 'error', message: error.message });
            return { success: false, error: error.message };
        }
    });

    // ── Generate Timeline ───────────────────────────────────────────────
    ipcMain.handle('vault:generate-timeline', async (event, { llmModel }) => {
        try {
            const engine = getIngestionEngine();
            const timeline = await engine.extractTimeline(llmModel || 'llama3.2');
            return { success: true, timeline };
        } catch (err) {
            console.error('[Main process] Timeline generation failed:', err);
            return { success: false, error: err.message };
        }
    });

    // ── Get Ingested Files ────────────────────────────────────────────
    ipcMain.handle('vault:get-files', () => {
        return getIngestionEngine().getIngestedFiles();
    });

    // ── Ollama Health Check ───────────────────────────────────────────
    ipcMain.handle('ollama:health', async () => {
        const http = require('http');
        return new Promise((resolve) => {
            const req = http.get('http://localhost:11434/api/tags', { timeout: 3000 }, (res) => {
                let body = '';
                res.on('data', (chunk) => (body += chunk));
                res.on('end', () => {
                    try {
                        const data = JSON.parse(body);
                        const models = (data.models || []).map((m) => m.name);
                        const hasEmbedModel = models.some((n) => n.includes('nomic-embed-text'));
                        resolve({
                            connected: true,
                            models,
                            hasEmbedModel,
                            message: hasEmbedModel
                                ? `Ollama connected. ${models.length} model(s) available.`
                                : 'Ollama connected but nomic-embed-text not found. Run: ollama pull nomic-embed-text',
                        });
                    } catch {
                        resolve({ connected: false, models: [], hasEmbedModel: false, message: 'Invalid response from Ollama.' });
                    }
                });
            });
            req.on('error', () => {
                resolve({
                    connected: false,
                    models: [],
                    hasEmbedModel: false,
                    message: 'Cannot reach Ollama at http://localhost:11434. Run: ollama serve',
                });
            });
            req.on('timeout', () => {
                req.destroy();
                resolve({ connected: false, models: [], hasEmbedModel: false, message: 'Ollama connection timed out.' });
            });
        });
    });

    // ── Search Query (with streaming) ───────────────────────────────────
    ipcMain.handle('search:query', async (event, { query, chatHistory, llmModel }) => {
        try {
            const engine = getIngestionEngine();

            // Stream tokens to the renderer as they arrive
            const onToken = (token) => {
                try {
                    event.sender.send('search:token', token);
                } catch (e) {
                    // window may have closed
                }
            };

            const result = await engine.searchWithAnswer(
                query, chatHistory || [], llmModel || 'llama3', onToken
            );

            // Signal streaming is done
            event.sender.send('search:done');

            return { success: true, ...result };
        } catch (error) {
            console.error('[CivicVault] Search error:', error);
            event.sender.send('search:done');
            return { success: false, error: error.message };
        }
    });
}

// ── App Lifecycle ───────────────────────────────────────────────────
// Request single instance lock to prevent multiple windows
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });

    app.whenReady().then(async () => {
        createWindow();

        // ── Hardware Profiling on Startup ──────────────────────────
        try {
            const profile = await profileSystem();
            console.log('[CivicVault] System profiled successfully.');
        } catch (err) {
            console.error('[CivicVault] Hardware profiling failed:', err.message);
        }

        // ── System Profile IPC Handler ─────────────────────────────
        ipcMain.handle('system:get-profile', async () => {
            try {
                return await profileSystem();
            } catch (err) {
                console.error('[CivicVault] Profile request failed:', err.message);
                return { backend: 'CPU (OpenBLAS)', tier: 'lite', tierLabel: 'Lite Tier (3.8B · 4-bit)', totalRamGB: 0, gpus: [], primaryGpu: 'Unknown', gpuVendor: 'Unknown', platform: process.platform };
            }
        });
    });

    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') app.quit();
    });

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
}

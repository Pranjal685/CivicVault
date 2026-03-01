const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // ── Window Controls ─────────────────────────────────────────
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),

    // ── Platform ────────────────────────────────────────────────
    platform: process.platform,

    // ── File Path (Electron 28+ requires webUtils) ─────────────
    getPathForFile: (file) => webUtils.getPathForFile(file),

    // ── File Dialog ─────────────────────────────────────────────
    openFileDialog: () => ipcRenderer.invoke('dialog:open-pdf'),

    // ── PDF Ingestion ───────────────────────────────────────────
    processPdf: (fileInfo) => ipcRenderer.invoke('ingest:process-pdf', fileInfo),

    // ── Ingestion Progress (event stream) ───────────────────────
    onIngestionProgress: (callback) => {
        const handler = (_event, data) => callback(data);
        ipcRenderer.on('ingestion:progress', handler);
        return () => ipcRenderer.removeListener('ingestion:progress', handler);
    },

    // ── Vault Queries ───────────────────────────────────────────
    getVaultFiles: () => ipcRenderer.invoke('vault:get-files'),
    generateTimeline: (llmModel) => ipcRenderer.invoke('vault:generate-timeline', { llmModel }),

    // ── Ollama Health Check ───────────────────────────────────────
    checkOllamaHealth: () => ipcRenderer.invoke('ollama:health'),

    // ── Hardware Profile ──────────────────────────────────────────
    getSystemProfile: () => ipcRenderer.invoke('system:get-profile'),

    // ── Search ────────────────────────────────────────────────────
    searchVault: (query, chatHistory, llmModel) => ipcRenderer.invoke('search:query', { query, chatHistory, llmModel }),

    // ── Search Streaming (token-by-token) ─────────────────────────
    onSearchToken: (callback) => {
        const handler = (_event, token) => callback(token);
        ipcRenderer.on('search:token', handler);
        return () => ipcRenderer.removeListener('search:token', handler);
    },
    onSearchDone: (callback) => {
        const handler = () => callback();
        ipcRenderer.on('search:done', handler);
        return () => ipcRenderer.removeListener('search:done', handler);
    },
});

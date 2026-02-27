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

    // ── Ollama Health Check ───────────────────────────────────────
    checkOllamaHealth: () => ipcRenderer.invoke('ollama:health'),

    // ── Search ────────────────────────────────────────────────────
    searchVault: (query, chatHistory, llmModel) => ipcRenderer.invoke('search:query', { query, chatHistory, llmModel }),
});

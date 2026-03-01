import React, { useState, useCallback, useEffect } from 'react';
import TitleBar from './components/TitleBar';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import SearchView from './components/SearchView';
import TimelineView from './components/TimelineView';

// Check if running inside Electron
const isElectron = Boolean(window.electronAPI);

export default function App() {
    const [activeView, setActiveView] = useState('vault');
    const [vaultFiles, setVaultFiles] = useState([]);
    const [processingFile, setProcessingFile] = useState(null);

    // ── Listen for ingestion progress from main process ───────────────
    useEffect(() => {
        if (!isElectron) return;

        const cleanup = window.electronAPI.onIngestionProgress((data) => {
            setProcessingFile((prev) => ({
                ...prev,
                ...data,
            }));

            if (data.status === 'done' && data.fileInfo) {
                setVaultFiles((prev) => [...prev, data.fileInfo]);
                setTimeout(() => setProcessingFile(null), 2000);
            }

            if (data.status === 'error') {
                setTimeout(() => setProcessingFile(null), 6000);
            }
        });

        return () => cleanup?.();
    }, []);

    // ── Handler: process a single PDF via IPC ─────────────────────────
    const handleProcessFile = useCallback(async (filePath, fileName, fileSize) => {
        if (!isElectron) {
            setProcessingFile({
                fileName,
                status: 'error',
                message: 'PDF ingestion requires the Electron desktop app. Please run "npm run dev" and use the Electron window, not a browser tab.',
            });
            setTimeout(() => setProcessingFile(null), 8000);
            return;
        }

        setProcessingFile({
            fileName,
            status: 'starting',
            message: 'Preparing ingestion…',
        });

        try {
            const result = await window.electronAPI.processPdf({ filePath, fileName, fileSize });
            if (result && !result.success) {
                console.error('Ingestion failed:', result.error);
            }
        } catch (err) {
            console.error('IPC error:', err);
            setProcessingFile({
                fileName,
                status: 'error',
                message: 'Failed to communicate with the processing engine.',
            });
            setTimeout(() => setProcessingFile(null), 6000);
        }
    }, []);

    // ── Handler: open native file dialog ──────────────────────────────
    const handleBrowseFiles = useCallback(async () => {
        if (!isElectron) {
            setProcessingFile({
                fileName: '',
                status: 'error',
                message: 'File dialog requires the Electron desktop app. Please use the Electron window instead of a browser tab.',
            });
            setTimeout(() => setProcessingFile(null), 6000);
            return;
        }

        try {
            const filePaths = await window.electronAPI.openFileDialog();
            if (filePaths && filePaths.length > 0) {
                for (const fp of filePaths) {
                    const fileName = fp.split(/[\\/]/).pop();
                    await handleProcessFile(fp, fileName, 0);
                }
            }
        } catch (err) {
            console.error('File dialog error:', err);
        }
    }, [handleProcessFile]);

    return (
        <div className="h-screen w-screen flex flex-col bg-dark-975 overflow-hidden">
            <TitleBar />

            {/* Browser mode warning banner */}
            {!isElectron && (
                <div className="shrink-0 px-4 py-2 bg-vault-500/10 border-b border-vault-500/20 text-center">
                    <p className="text-xs text-vault-400">
                        ⚠ Running in browser preview mode — PDF ingestion requires the Electron app window.
                    </p>
                </div>
            )}

            <div className="flex flex-1 overflow-hidden">
                <Sidebar
                    activeView={activeView}
                    onNavigate={setActiveView}
                    vaultFiles={vaultFiles}
                />

                <main className="flex-1 overflow-hidden">
                    {activeView === 'vault' && (
                        <Dashboard
                            vaultFiles={vaultFiles}
                            processingFile={processingFile}
                            onProcessFile={handleProcessFile}
                            onBrowseFiles={handleBrowseFiles}
                        />
                    )}
                    <div style={{ display: activeView === 'search' ? 'block' : 'none', height: '100%' }}>
                        <SearchView />
                    </div>
                    <div style={{ display: activeView === 'timeline' ? 'block' : 'none', height: '100%' }}>
                        <TimelineView vaultFiles={vaultFiles} />
                    </div>
                </main>
            </div>
        </div>
    );
}

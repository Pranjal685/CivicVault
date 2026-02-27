import React, { useState, useEffect } from 'react';
import { VscChromeMinimize, VscChromeMaximize, VscChromeClose } from 'react-icons/vsc';
import { HiShieldCheck } from 'react-icons/hi2';

const isElectron = Boolean(window.electronAPI);

export default function TitleBar() {
    const handleMinimize = () => window.electronAPI?.minimize();
    const handleMaximize = () => window.electronAPI?.maximize();
    const handleClose = () => window.electronAPI?.close();

    const [ollamaStatus, setOllamaStatus] = useState(null); // null = checking, object = result

    // Check Ollama health on mount and every 30s
    useEffect(() => {
        if (!isElectron) return;

        const check = async () => {
            try {
                const result = await window.electronAPI.checkOllamaHealth();
                setOllamaStatus(result);
            } catch {
                setOllamaStatus({ connected: false, message: 'Health check failed' });
            }
        };

        check();
        const interval = setInterval(check, 30000);
        return () => clearInterval(interval);
    }, []);

    const statusDot = ollamaStatus === null
        ? 'bg-yellow-500 animate-pulse'
        : ollamaStatus.connected && ollamaStatus.hasEmbedModel
            ? 'bg-emerald-500 animate-pulse-slow'
            : ollamaStatus.connected
                ? 'bg-yellow-500'
                : 'bg-red-500';

    const statusLabel = ollamaStatus === null
        ? 'Checking…'
        : ollamaStatus.connected && ollamaStatus.hasEmbedModel
            ? 'Ollama Connected'
            : ollamaStatus.connected
                ? 'Missing Model'
                : 'Ollama Offline';

    return (
        <header className="titlebar-drag h-11 flex items-center justify-between px-4 bg-dark-975 border-b border-dark-800/50 select-none shrink-0 z-50">
            {/* App Identity */}
            <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-vault-400 to-vault-600 flex items-center justify-center shadow-vault">
                    <HiShieldCheck className="w-4 h-4 text-dark-975" />
                </div>
                <span className="text-sm font-display font-semibold tracking-wide text-dark-200">
                    CivicVault
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-vault-500/10 text-vault-400 border border-vault-500/20">
                    v1.0
                </span>
            </div>

            {/* Status Indicators */}
            <div className="flex items-center gap-2 text-xs text-dark-400">
                <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse-slow"></span>
                    Air-Gapped
                </span>
                <span className="text-dark-700 mx-1">|</span>
                {isElectron ? (
                    <span className="flex items-center gap-1.5 titlebar-no-drag cursor-default" title={ollamaStatus?.message || 'Checking…'}>
                        <span className={`w-1.5 h-1.5 rounded-full ${statusDot}`}></span>
                        {statusLabel}
                    </span>
                ) : (
                    <span>Browser Preview</span>
                )}
            </div>

            {/* Window Controls */}
            <div className="titlebar-no-drag flex items-center gap-0.5">
                <button
                    onClick={handleMinimize}
                    className="w-8 h-7 flex items-center justify-center rounded hover:bg-dark-800 transition-colors duration-150"
                    aria-label="Minimize"
                >
                    <VscChromeMinimize className="w-3.5 h-3.5 text-dark-400" />
                </button>
                <button
                    onClick={handleMaximize}
                    className="w-8 h-7 flex items-center justify-center rounded hover:bg-dark-800 transition-colors duration-150"
                    aria-label="Maximize"
                >
                    <VscChromeMaximize className="w-3.5 h-3.5 text-dark-400" />
                </button>
                <button
                    onClick={handleClose}
                    className="w-8 h-7 flex items-center justify-center rounded hover:bg-red-500/80 transition-colors duration-150 group"
                    aria-label="Close"
                >
                    <VscChromeClose className="w-3.5 h-3.5 text-dark-400 group-hover:text-white" />
                </button>
            </div>
        </header>
    );
}

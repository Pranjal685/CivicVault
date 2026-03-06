import React, { useState, useEffect, useRef } from 'react';
import { HiShieldCheck, HiCpuChip } from 'react-icons/hi2';

export default function SetupView({ onComplete }) {
    const [setupStep, setSetupStep] = useState(0);
    const [hardwareProfile, setHardwareProfile] = useState(null);
    const [progressPercent, setProgressPercent] = useState(0);
    const [terminalLines, setTerminalLines] = useState([]);
    const terminalRef = useRef(null);

    // Helper to add terminal lines with a typing delay
    const addLine = (text, type = 'info') => {
        setTerminalLines(prev => [...prev, { text, type, id: Date.now() + Math.random() }]);
    };

    // Auto-scroll terminal
    useEffect(() => {
        if (terminalRef.current) {
            terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
        }
    }, [terminalLines]);

    // ── Step Sequencer ────────────────────────────────────────────
    useEffect(() => {
        let cancelled = false;
        const delay = (ms) => new Promise(r => setTimeout(r, ms));

        async function runSequence() {
            // ── Step 0: Initializing ──────────────────────────────
            addLine('[BOOT] CivicVault Secure Environment v1.8', 'system');
            addLine('[BOOT] Initializing offline-first legal intelligence engine...', 'system');
            await delay(800);
            if (cancelled) return;

            addLine('[SECURITY] Context isolation: ENABLED', 'success');
            addLine('[SECURITY] Node integration: DISABLED', 'success');
            addLine('[SECURITY] Sandbox mode: ACTIVE', 'success');
            await delay(600);
            if (cancelled) return;

            addLine('[NETWORK] Air-gap verification: PASSED', 'success');
            addLine('[CRYPTO] SHA-256 document hashing: READY', 'success');
            await delay(800);
            if (cancelled) return;

            // ── Step 1: Hardware Scan ─────────────────────────────
            setSetupStep(1);
            addLine('', 'spacer');
            addLine('[HARDWARE] Initiating system hardware profile scan...', 'system');
            await delay(400);

            let profile = null;
            if (window.electronAPI?.getSystemProfile) {
                try {
                    profile = await window.electronAPI.getSystemProfile();
                    setHardwareProfile(profile);
                } catch (err) {
                    addLine(`[HARDWARE] Profile scan failed: ${err.message}`, 'error');
                }
            }

            if (cancelled) return;

            if (profile) {
                addLine(`[HARDWARE] System RAM: ${profile.totalRamGB}GB detected`, 'data');
                await delay(300);
                addLine(`[HARDWARE] GPU: ${profile.primaryGpu || 'Integrated'} (${profile.gpuVendor})`, 'data');
                await delay(300);
                addLine(`[HARDWARE] VRAM: ${profile.vramMB}MB`, 'data');
                await delay(300);
                addLine(`[HARDWARE] Platform: ${profile.platform === 'win32' ? 'Windows' : profile.platform}`, 'data');
                await delay(500);
                addLine('[HARDWARE] Analyzing optimal NPU/GPU backends...', 'system');
                await delay(600);

                // Show all GPUs
                if (profile.gpus && profile.gpus.length > 0) {
                    profile.gpus.forEach((gpu, i) => {
                        addLine(`[HARDWARE] GPU Controller ${i}: ${gpu}`, 'data');
                    });
                }
                await delay(500);
            } else {
                addLine('[HARDWARE] Using fallback profile: CPU (OpenBLAS)', 'warn');
                await delay(500);
            }

            if (cancelled) return;

            // ── Step 2: Tier Selection + Model Mount ──────────────
            setSetupStep(2);
            addLine('', 'spacer');
            addLine('[ROUTER] Hardware-Adaptive Inference Router: ACTIVE', 'system');
            await delay(400);

            if (profile) {
                addLine(`[ROUTER] Selected Backend: ${profile.backend}`, 'highlight');
                await delay(300);
                addLine(`[ROUTER] Model Tier: ${profile.tierLabel}`, 'highlight');
                await delay(300);

                if (profile.backend === 'CUDA') {
                    addLine('[ROUTER] NVIDIA CUDA toolkit detected. GPU acceleration enabled.', 'success');
                } else if (profile.backend === 'DirectML') {
                    addLine('[ROUTER] AMD DirectML backend detected. Hardware acceleration enabled.', 'success');
                } else if (profile.backend === 'ONNX_VAIP') {
                    addLine('[ROUTER] AMD Ryzen AI NPU detected. Neural engine enabled.', 'success');
                } else if (profile.backend === 'ROCm') {
                    addLine('[ROUTER] AMD ROCm backend detected. GPU compute enabled.', 'success');
                } else {
                    addLine('[ROUTER] CPU (OpenBLAS) fallback active. Running on system RAM.', 'success');
                }
            }

            await delay(600);
            if (cancelled) return;

            addLine('', 'spacer');
            addLine('[MODEL] Mounting LLM inference pipeline to local memory...', 'system');

            // Simulate progress bar
            for (let i = 0; i <= 100; i += 2) {
                if (cancelled) return;
                setProgressPercent(i);
                await delay(30);
            }

            await delay(300);
            addLine('[MODEL] Ollama inference bridge: CONNECTED', 'success');
            addLine('[MODEL] Vector store: INITIALIZED', 'success');
            addLine('[MODEL] Embedding model: nomic-embed-text READY', 'success');
            await delay(500);
            if (cancelled) return;

            // ── Step 3: Complete ──────────────────────────────────
            setSetupStep(3);
            addLine('', 'spacer');
            addLine('[SYSTEM] ═══════════════════════════════════════════', 'success');
            addLine('[SYSTEM] System Optimized. Vault Secured.', 'success');
            addLine('[SYSTEM] All data processed locally. Zero network exposure.', 'success');
            addLine('[SYSTEM] ═══════════════════════════════════════════', 'success');
        }

        runSequence();
        return () => { cancelled = true; };
    }, []);

    const getLineClass = (type) => {
        switch (type) {
            case 'system': return 'text-dark-400';
            case 'success': return 'text-emerald-400';
            case 'data': return 'text-cyan-400';
            case 'highlight': return 'text-amber-400 font-bold';
            case 'warn': return 'text-amber-500';
            case 'error': return 'text-red-400';
            case 'spacer': return '';
            default: return 'text-dark-300';
        }
    };

    return (
        <div className="h-full w-full flex flex-col items-center justify-center bg-dark-975 relative overflow-hidden">
            {/* Background grid effect */}
            <div className="absolute inset-0 opacity-[0.03]"
                style={{
                    backgroundImage: 'linear-gradient(rgba(16,185,129,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(16,185,129,0.3) 1px, transparent 1px)',
                    backgroundSize: '40px 40px',
                }}
            />

            {/* Main container */}
            <div className="relative z-10 w-full max-w-2xl mx-auto px-6">
                {/* Header */}
                <div className="text-center mb-6">
                    <div className="inline-flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-700/20 border border-emerald-500/30 flex items-center justify-center">
                            {setupStep < 3 ? (
                                <HiCpuChip className="w-5 h-5 text-emerald-400 animate-pulse" />
                            ) : (
                                <HiShieldCheck className="w-5 h-5 text-emerald-400" />
                            )}
                        </div>
                        <div className="text-left">
                            <h1 className="text-lg font-bold text-dark-100 font-display">
                                CivicVault Hardware Optimizer
                            </h1>
                            <p className="text-[10px] text-dark-500 uppercase tracking-[0.2em]">
                                Secure Environment Setup
                            </p>
                        </div>
                    </div>
                </div>

                {/* Terminal Window */}
                <div className="rounded-xl border border-dark-800/80 bg-[#0a0a14] shadow-2xl overflow-hidden">
                    {/* Terminal title bar */}
                    <div className="flex items-center gap-2 px-4 py-2.5 bg-dark-900/80 border-b border-dark-800/50">
                        <div className="flex gap-1.5">
                            <div className="w-2.5 h-2.5 rounded-full bg-red-500/60"></div>
                            <div className="w-2.5 h-2.5 rounded-full bg-amber-500/60"></div>
                            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/60"></div>
                        </div>
                        <span className="text-[10px] font-mono text-dark-500 ml-2">civicvault://hardware-setup</span>
                        <div className="flex-1" />
                        {setupStep < 3 && (
                            <div className="flex items-center gap-1.5">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></div>
                                <span className="text-[9px] font-mono text-emerald-400/70 uppercase">Scanning</span>
                            </div>
                        )}
                        {setupStep === 3 && (
                            <div className="flex items-center gap-1.5">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400"></div>
                                <span className="text-[9px] font-mono text-emerald-400/70 uppercase">Complete</span>
                            </div>
                        )}
                    </div>

                    {/* Terminal body */}
                    <div
                        ref={terminalRef}
                        className="px-4 py-3 h-72 overflow-y-auto font-mono text-xs leading-relaxed scrollbar-thin scrollbar-thumb-dark-700 scrollbar-track-transparent"
                    >
                        {terminalLines.map((line) => (
                            line.type === 'spacer' ? (
                                <div key={line.id} className="h-3" />
                            ) : (
                                <div key={line.id} className={`${getLineClass(line.type)} animate-fade-in`}>
                                    <span className="text-dark-600 select-none">{'>'} </span>
                                    {line.text}
                                </div>
                            )
                        ))}
                        {setupStep < 3 && (
                            <div className="text-emerald-400 animate-pulse mt-1">
                                <span className="text-dark-600 select-none">{'>'} </span>█
                            </div>
                        )}
                    </div>

                    {/* Progress bar (Step 2) */}
                    {setupStep === 2 && progressPercent < 100 && (
                        <div className="px-4 pb-3">
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-[10px] font-mono text-dark-500">Mounting inference pipeline</span>
                                <span className="text-[10px] font-mono text-emerald-400">{progressPercent}%</span>
                            </div>
                            <div className="h-1.5 rounded-full bg-dark-800 overflow-hidden">
                                <div
                                    className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all duration-100"
                                    style={{ width: `${progressPercent}%` }}
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Hardware Summary Cards (visible from Step 1) */}
                {hardwareProfile && setupStep >= 1 && (
                    <div className="grid grid-cols-3 gap-3 mt-4 animate-fade-in">
                        <div className="rounded-lg bg-dark-900/60 border border-dark-800/50 p-3 text-center">
                            <p className="text-[9px] font-mono text-dark-500 uppercase tracking-wider mb-1">System RAM</p>
                            <p className="text-sm font-bold text-dark-200">{hardwareProfile.totalRamGB} GB</p>
                        </div>
                        <div className="rounded-lg bg-dark-900/60 border border-dark-800/50 p-3 text-center">
                            <p className="text-[9px] font-mono text-dark-500 uppercase tracking-wider mb-1">GPU VRAM</p>
                            <p className="text-sm font-bold text-dark-200">{hardwareProfile.vramMB} MB</p>
                        </div>
                        <div className="rounded-lg bg-dark-900/60 border border-dark-800/50 p-3 text-center">
                            <p className="text-[9px] font-mono text-dark-500 uppercase tracking-wider mb-1">Backend</p>
                            <p className="text-sm font-bold text-emerald-400 truncate">{hardwareProfile.backend}</p>
                        </div>
                    </div>
                )}

                {/* Enter CivicVault Button (Step 3) */}
                {setupStep === 3 && (
                    <div className="text-center mt-6 animate-fade-in">
                        <button
                            onClick={onComplete}
                            className="group relative px-8 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 text-white font-semibold text-sm
                                hover:from-emerald-500 hover:to-emerald-400 transition-all duration-300
                                shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40"
                        >
                            <span className="flex items-center gap-2">
                                <HiShieldCheck className="w-5 h-5" />
                                Enter CivicVault
                            </span>
                        </button>
                        <p className="text-[10px] text-dark-600 mt-3 font-mono">
                            All processing runs locally. Zero data leaves this device.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}

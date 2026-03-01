import React, { useState, useEffect } from 'react';
import {
    HiOutlineArchiveBox,
    HiOutlineMagnifyingGlass,
    HiOutlineCog6Tooth,
    HiOutlineShieldCheck,
    HiOutlineDocumentText,
    HiOutlineQuestionMarkCircle,
    HiOutlineClock,
    HiCpuChip,
} from 'react-icons/hi2';

const navItems = [
    {
        id: 'vault',
        label: 'My Vault',
        icon: HiOutlineArchiveBox,
        description: 'Upload & manage case files',
    },
    {
        id: 'search',
        label: 'Search',
        icon: HiOutlineMagnifyingGlass,
        description: 'Query your documents',
    },
    {
        id: 'timeline',
        label: 'Timeline',
        icon: HiOutlineClock,
        description: '1-Click Chronology',
    },
];

const bottomItems = [
    { id: 'settings', label: 'Settings', icon: HiOutlineCog6Tooth },
    { id: 'help', label: 'Help', icon: HiOutlineQuestionMarkCircle },
];

export default function Sidebar({ activeView, onNavigate, vaultFiles = [] }) {
    const fileCount = vaultFiles.length;
    // Progress bar: cap at 20 files for visual, or just show proportional
    const progressWidth = fileCount > 0 ? Math.min((fileCount / 20) * 100, 100) : 0;

    // ── Hardware Profile State ────────────────────────────────────────
    const [hwProfile, setHwProfile] = useState(null);

    useEffect(() => {
        if (window.electronAPI?.getSystemProfile) {
            window.electronAPI.getSystemProfile()
                .then(setHwProfile)
                .catch((err) => console.error('Hardware profile failed:', err));
        }
    }, []);

    return (
        <aside className="w-64 h-full flex flex-col bg-dark-950 border-r border-dark-800/50 shrink-0 animate-slide-in-left">
            {/* Vault Status Card */}
            <div className="px-4 pt-5 pb-3">
                <div className="glass-subtle rounded-xl p-3.5">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-vault-400/20 to-vault-600/20 vault-border flex items-center justify-center">
                            <HiOutlineShieldCheck className="w-5 h-5 text-vault-400" />
                        </div>
                        <div>
                            <p className="text-xs font-semibold text-dark-200">Secure Vault</p>
                            <p className="text-[10px] text-dark-500 mt-0.5">Fully Offline</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="flex-1 h-1 rounded-full bg-dark-800 overflow-hidden">
                            <div
                                className="h-full rounded-full bg-gradient-to-r from-vault-500 to-vault-400 transition-all duration-700"
                                style={{ width: `${progressWidth}%` }}
                            ></div>
                        </div>
                        <span className="text-[10px] font-mono text-dark-500">
                            {fileCount} file{fileCount !== 1 ? 's' : ''}
                        </span>
                    </div>
                </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-3 pt-2">
                <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-widest text-dark-600">
                    Navigation
                </p>
                <ul className="space-y-1">
                    {navItems.map((item) => {
                        const isActive = activeView === item.id;
                        const Icon = item.icon;
                        return (
                            <li key={item.id}>
                                <button
                                    onClick={() => onNavigate(item.id)}
                                    className={`
                    w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left
                    transition-all duration-200 group relative
                    ${isActive
                                            ? 'bg-vault-500/10 text-vault-300 vault-border shadow-vault'
                                            : 'text-dark-400 hover:text-dark-200 hover:bg-dark-900/60'
                                        }
                  `}
                                >
                                    {isActive && (
                                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r bg-vault-400"></div>
                                    )}
                                    <Icon className={`w-5 h-5 shrink-0 ${isActive ? 'text-vault-400' : 'text-dark-500 group-hover:text-dark-300'}`} />
                                    <div className="flex-1 min-w-0">
                                        <p className={`text-sm font-medium ${isActive ? 'text-vault-200' : ''}`}>
                                            {item.label}
                                        </p>
                                        <p className="text-[10px] text-dark-600 truncate mt-0.5">
                                            {item.description}
                                        </p>
                                    </div>
                                </button>
                            </li>
                        );
                    })}
                </ul>

                {/* Recent Files Section */}
                <div className="mt-6">
                    <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-widest text-dark-600">
                        Recent Files
                    </p>

                    {fileCount === 0 ? (
                        <div className="px-3 py-4">
                            <div className="flex flex-col items-center text-center">
                                <HiOutlineDocumentText className="w-8 h-8 text-dark-700 mb-2" />
                                <p className="text-xs text-dark-600">No files yet</p>
                                <p className="text-[10px] text-dark-700 mt-0.5">Upload PDFs to get started</p>
                            </div>
                        </div>
                    ) : (
                        <ul className="space-y-0.5 max-h-48 overflow-y-auto">
                            {vaultFiles.slice().reverse().map((file, i) => (
                                <li
                                    key={`${file.name}-${i}`}
                                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-dark-900/40 transition-colors duration-150 group animate-scale-in"
                                >
                                    <div className="w-6 h-6 rounded bg-red-500/10 flex items-center justify-center shrink-0">
                                        <HiOutlineDocumentText className="w-3.5 h-3.5 text-red-400" />
                                    </div>
                                    <div className="flex-1 min-w-0 pr-1">
                                        <div className="flex items-center justify-between gap-1 mb-0.5">
                                            <p className="text-xs text-dark-400 group-hover:text-dark-200 truncate transition-colors">
                                                {file.name}
                                            </p>
                                            {file.hash && (
                                                <div
                                                    className="shrink-0 flex items-center gap-1.5 rounded-md bg-dark-900/80 px-1.5 py-0.5 border border-emerald-500/20 cursor-help"
                                                    title={`Verified Immutable | SHA-256: ${file.hash}`}
                                                >
                                                    <HiOutlineShieldCheck className="w-3 h-3 text-emerald-400" />
                                                    <span className="text-[9px] font-mono text-emerald-400 uppercase tracking-wider">
                                                        {file.hash.substring(0, 8)}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                        <p className="text-[9px] text-dark-600">
                                            {file.numPages}p · {file.numChunks} chunks
                                        </p>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </nav>

            {/* Hardware Status Badge */}
            <div className="px-3 pb-2">
                {hwProfile ? (
                    <div
                        className="group relative glass-subtle rounded-xl p-2.5 cursor-help"
                        title={`Routed to: ${hwProfile.backend} | RAM: ${hwProfile.totalRamGB}GB | GPUs: ${hwProfile.gpus.join(', ') || 'None'}`}
                    >
                        <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/20 flex items-center justify-center shrink-0">
                                <HiCpuChip className="w-4 h-4 text-cyan-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-[10px] font-semibold text-dark-300 truncate">
                                    {hwProfile.primaryGpu || 'CPU Only'}
                                </p>
                                <p className="text-[9px] text-dark-500 truncate">
                                    {hwProfile.tierLabel}
                                </p>
                            </div>
                        </div>
                        {/* Tooltip on hover */}
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 rounded-lg bg-dark-900 border border-dark-700 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
                            <p className="text-[10px] text-cyan-400 font-semibold">Routed to: {hwProfile.backend}</p>
                            <p className="text-[9px] text-dark-400 mt-0.5">{hwProfile.totalRamGB}GB RAM · {hwProfile.gpuVendor}</p>
                            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-2 h-2 rotate-45 bg-dark-900 border-r border-b border-dark-700"></div>
                        </div>
                    </div>
                ) : (
                    <div className="glass-subtle rounded-xl p-2.5 animate-pulse">
                        <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-lg bg-dark-800"></div>
                            <div className="flex-1">
                                <div className="h-2.5 bg-dark-800 rounded w-3/4 mb-1.5"></div>
                                <div className="h-2 bg-dark-800 rounded w-1/2"></div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Bottom Actions */}
            <div className="px-3 pb-4 border-t border-dark-800/50 pt-3 space-y-0.5">
                {bottomItems.map((item) => {
                    const Icon = item.icon;
                    return (
                        <button
                            key={item.id}
                            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-dark-500 hover:text-dark-300 hover:bg-dark-900/60 transition-all duration-200 text-sm"
                        >
                            <Icon className="w-4.5 h-4.5" />
                            {item.label}
                        </button>
                    );
                })}
            </div>
        </aside>
    );
}

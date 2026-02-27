import React from 'react';
import {
    HiOutlineDocumentText,
    HiOutlineSparkles,
    HiOutlineLockClosed,
    HiOutlineServerStack,
    HiOutlineCheckBadge,
} from 'react-icons/hi2';
import DropZone from './DropZone';

const features = [
    {
        icon: HiOutlineLockClosed,
        title: 'Air-Gapped',
        description: 'No data ever leaves your machine',
    },
    {
        icon: HiOutlineServerStack,
        title: 'Local AI',
        description: 'Powered by Ollama on localhost',
    },
    {
        icon: HiOutlineSparkles,
        title: 'Exact Citations',
        description: 'Every answer cites the source page',
    },
];

export default function Dashboard({ vaultFiles, processingFile, onProcessFile, onBrowseFiles }) {
    return (
        <div className="h-full flex flex-col overflow-hidden">
            {/* Top Header */}
            <header className="shrink-0 px-8 py-5 border-b border-dark-800/30">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-xl font-display font-bold text-dark-100">
                            My Vault
                        </h1>
                        <p className="text-sm text-dark-500 mt-1">
                            Upload case files to begin building your local legal index
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="text-right">
                            <p className="text-xs font-medium text-dark-300">
                                {vaultFiles.length} document{vaultFiles.length !== 1 ? 's' : ''}
                            </p>
                            <p className="text-[10px] text-dark-600 mt-0.5">in vault</p>
                        </div>
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-vault-500/20 to-vault-700/20 vault-border flex items-center justify-center">
                            <HiOutlineDocumentText className="w-5 h-5 text-vault-400" />
                        </div>
                    </div>
                </div>
            </header>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto px-8 py-6">
                {/* Drop Zone */}
                <div className="animate-fade-in">
                    <DropZone
                        onProcessFile={onProcessFile}
                        onBrowseFiles={onBrowseFiles}
                        processingFile={processingFile}
                    />
                </div>

                {/* Indexed Documents List */}
                {vaultFiles.length > 0 && (
                    <div className="mt-6 animate-fade-in" style={{ animationDelay: '0.1s' }}>
                        <h2 className="text-sm font-semibold text-dark-300 mb-3 flex items-center gap-2">
                            <HiOutlineCheckBadge className="w-4 h-4 text-emerald-400" />
                            Indexed Documents
                        </h2>
                        <div className="space-y-2">
                            {vaultFiles.map((file, i) => (
                                <div
                                    key={`${file.name}-${i}`}
                                    className="glass-subtle rounded-xl px-4 py-3 flex items-center gap-3 animate-scale-in"
                                    style={{ animationDelay: `${i * 0.05}s` }}
                                >
                                    <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                                        <HiOutlineDocumentText className="w-5 h-5 text-emerald-400" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-dark-200 truncate">
                                            {file.name}
                                        </p>
                                        <p className="text-[10px] text-dark-600">
                                            {file.numPages} page{file.numPages !== 1 ? 's' : ''} · {file.numChunks} chunks
                                        </p>
                                    </div>
                                    <span className="text-[10px] font-mono px-2 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                        Indexed
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Feature Cards */}
                <div className="mt-8 grid grid-cols-3 gap-4 animate-fade-in" style={{ animationDelay: '0.2s' }}>
                    {features.map((feat) => {
                        const Icon = feat.icon;
                        return (
                            <div
                                key={feat.title}
                                className="glass-subtle rounded-xl p-5 hover:vault-border transition-all duration-300 group"
                            >
                                <div className="w-10 h-10 rounded-xl bg-dark-900 flex items-center justify-center mb-3 group-hover:bg-vault-500/10 transition-colors duration-300">
                                    <Icon className="w-5 h-5 text-dark-400 group-hover:text-vault-400 transition-colors duration-300" />
                                </div>
                                <h3 className="text-sm font-semibold text-dark-200 mb-1">{feat.title}</h3>
                                <p className="text-xs text-dark-500 leading-relaxed">{feat.description}</p>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

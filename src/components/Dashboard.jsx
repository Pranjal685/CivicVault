import React, { useState, useEffect } from 'react';
import {
    HiOutlineDocumentText,
    HiOutlineSparkles,
    HiOutlineLockClosed,
    HiOutlineServerStack,
    HiOutlineCheckBadge,
    HiOutlineShieldCheck,
    HiOutlineFolderPlus,
    HiOutlineFolder,
    HiOutlineArrowLeft,
    HiOutlinePlusCircle,
    HiOutlineXMark,
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

export default function Dashboard({ vaultFiles, processingFile, onProcessFile, onBrowseFiles, activeCaseId, onSelectCase }) {
    const [cases, setCases] = useState([]);
    const [isLoadingCases, setIsLoadingCases] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newCaseName, setNewCaseName] = useState('');
    const [caseDocuments, setCaseDocuments] = useState([]);

    const isElectron = Boolean(window.electronAPI);

    // Fetch all cases on mount
    useEffect(() => {
        if (!isElectron || !window.electronAPI.getAllCases) return;

        window.electronAPI.getAllCases().then((res) => {
            if (res.success) setCases(res.cases);
            setIsLoadingCases(false);
        }).catch(() => setIsLoadingCases(false));
    }, [isElectron]);

    // Fetch documents when a case is selected
    useEffect(() => {
        if (!activeCaseId || !isElectron || !window.electronAPI.getCaseDocuments) return;

        window.electronAPI.getCaseDocuments(activeCaseId).then((res) => {
            if (res.success) setCaseDocuments(res.documents);
        });
    }, [activeCaseId, isElectron, vaultFiles]);

    const handleCreateCase = async () => {
        const name = newCaseName.trim();
        if (!name || !isElectron) return;

        const res = await window.electronAPI.createCase(name);
        if (res.success) {
            setCases(prev => [res.caseData, ...prev]);
            setNewCaseName('');
            setShowCreateModal(false);
        }
    };

    const activeCase = cases.find(c => c.id === activeCaseId);

    // ── Case View (inside a specific case) ────────────────────────────
    if (activeCaseId && activeCase) {
        return (
            <div className="h-full flex flex-col overflow-hidden">
                {/* Case Header */}
                <header className="shrink-0 px-8 py-5 border-b border-dark-800/30">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => onSelectCase(null)}
                            className="p-2 rounded-lg hover:bg-dark-900 text-dark-400 hover:text-dark-200 transition-colors"
                        >
                            <HiOutlineArrowLeft className="w-5 h-5" />
                        </button>
                        <div className="flex-1">
                            <h1 className="text-xl font-display font-bold text-dark-100 flex items-center gap-2">
                                <HiOutlineFolder className="w-5 h-5 text-vault-400" />
                                {activeCase.name}
                            </h1>
                            <p className="text-[10px] text-dark-500 mt-0.5 font-mono uppercase tracking-wider">
                                Case ID: {activeCase.id.substring(0, 8)} · Created {new Date(activeCase.created_at).toLocaleDateString()}
                            </p>
                        </div>
                        <div className="text-right">
                            <p className="text-xs font-medium text-dark-300">
                                {caseDocuments.length} document{caseDocuments.length !== 1 ? 's' : ''}
                            </p>
                            <p className="text-[10px] text-dark-600 mt-0.5">in this case</p>
                        </div>
                    </div>
                </header>

                {/* Case Content */}
                <div className="flex-1 overflow-y-auto px-8 py-6">
                    {/* Drop Zone for this case */}
                    <div className="animate-fade-in">
                        <DropZone
                            onProcessFile={(filePath, fileName, fileSize) =>
                                onProcessFile(filePath, fileName, fileSize, activeCaseId)
                            }
                            onBrowseFiles={() => onBrowseFiles(activeCaseId)}
                            processingFile={processingFile}
                        />
                    </div>

                    {/* Case Documents */}
                    {caseDocuments.length > 0 && (
                        <div className="mt-6 animate-fade-in" style={{ animationDelay: '0.1s' }}>
                            <h2 className="text-sm font-semibold text-dark-300 mb-3 flex items-center gap-2">
                                <HiOutlineCheckBadge className="w-4 h-4 text-emerald-400" />
                                Case Documents
                            </h2>
                            <div className="space-y-2">
                                {caseDocuments.map((doc, i) => (
                                    <div
                                        key={doc.id}
                                        className="glass-subtle rounded-xl px-4 py-3 flex items-center gap-3 animate-scale-in"
                                        style={{ animationDelay: `${i * 0.05}s` }}
                                    >
                                        <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                                            <HiOutlineDocumentText className="w-5 h-5 text-emerald-400" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-3">
                                                <p className="text-sm font-medium text-dark-200 truncate">
                                                    {doc.filename}
                                                </p>
                                                {doc.file_hash && (
                                                    <div
                                                        className="flex items-center gap-1.5 shrink-0 bg-dark-900/60 px-2 py-0.5 rounded-md border border-emerald-500/20 cursor-help"
                                                        title={`SHA-256: ${doc.file_hash}`}
                                                    >
                                                        <HiOutlineShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                                                        <span className="text-[10px] font-mono text-emerald-400 uppercase tracking-wider">
                                                            {doc.file_hash.substring(0, 8)}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                            <p className="text-[10px] text-dark-600 mt-1">
                                                {doc.num_pages} page{doc.num_pages !== 1 ? 's' : ''} · {doc.num_chunks} chunks · {new Date(doc.uploaded_at).toLocaleDateString()}
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

    // ── Case List View (no case selected) ─────────────────────────────
    return (
        <div className="h-full flex flex-col overflow-hidden">
            {/* Header */}
            <header className="shrink-0 px-8 py-5 border-b border-dark-800/30">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-xl font-display font-bold text-dark-100">
                            Case Manager
                        </h1>
                        <p className="text-sm text-dark-500 mt-1">
                            Select a case to upload documents and run AI analysis
                        </p>
                    </div>
                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-vault-600 hover:bg-vault-500 text-white text-sm font-medium transition-all duration-300 shadow-lg shadow-vault-500/10 hover:shadow-vault-500/25"
                    >
                        <HiOutlineFolderPlus className="w-4 h-4" />
                        New Case
                    </button>
                </div>
            </header>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-8 py-6">
                {/* Create Case Modal */}
                {showCreateModal && (
                    <div className="mb-6 glass-subtle rounded-xl p-5 animate-scale-in border border-vault-500/20">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-semibold text-dark-200">Create New Case</h3>
                            <button onClick={() => setShowCreateModal(false)} className="text-dark-500 hover:text-dark-300">
                                <HiOutlineXMark className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="flex gap-3">
                            <input
                                type="text"
                                value={newCaseName}
                                onChange={(e) => setNewCaseName(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleCreateCase()}
                                placeholder="e.g., State v. Sharma 2024, IP Dispute #412..."
                                className="flex-1 bg-dark-900 border border-dark-700 rounded-lg px-4 py-2 text-sm text-dark-200 placeholder-dark-600 focus:outline-none focus:border-vault-500 transition-colors"
                                autoFocus
                            />
                            <button
                                onClick={handleCreateCase}
                                disabled={!newCaseName.trim()}
                                className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${newCaseName.trim()
                                        ? 'bg-vault-600 hover:bg-vault-500 text-white'
                                        : 'bg-dark-800 text-dark-600 cursor-not-allowed'
                                    }`}
                            >
                                Create
                            </button>
                        </div>
                    </div>
                )}

                {/* Loading */}
                {isLoadingCases && (
                    <div className="grid grid-cols-2 gap-4">
                        {[1, 2, 3, 4].map(i => (
                            <div key={i} className="glass-subtle rounded-xl p-5 animate-pulse">
                                <div className="h-4 bg-dark-800 rounded w-3/4 mb-3"></div>
                                <div className="h-3 bg-dark-900 rounded w-1/2"></div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Empty State */}
                {!isLoadingCases && cases.length === 0 && (
                    <div className="h-64 flex flex-col items-center justify-center text-center opacity-70">
                        <div className="w-16 h-16 rounded-2xl bg-dark-900 border border-dark-800 flex items-center justify-center mb-4">
                            <HiOutlineFolder className="w-8 h-8 text-dark-600" />
                        </div>
                        <h2 className="text-lg font-medium text-dark-300">No Cases Yet</h2>
                        <p className="text-sm text-dark-500 mt-2 max-w-sm">
                            Create your first case to start uploading legal documents and running AI analysis.
                        </p>
                        <button
                            onClick={() => setShowCreateModal(true)}
                            className="mt-4 flex items-center gap-2 px-4 py-2 rounded-xl bg-vault-600 hover:bg-vault-500 text-white text-sm font-medium transition-all"
                        >
                            <HiOutlinePlusCircle className="w-4 h-4" />
                            Create First Case
                        </button>
                    </div>
                )}

                {/* Case Cards Grid */}
                {!isLoadingCases && cases.length > 0 && (
                    <div className="grid grid-cols-2 gap-4">
                        {cases.map((c, i) => (
                            <button
                                key={c.id}
                                onClick={() => onSelectCase(c.id)}
                                className="glass-subtle rounded-xl p-5 text-left hover:border-vault-500/30 hover:bg-dark-900/40 transition-all duration-300 group animate-scale-in"
                                style={{ animationDelay: `${i * 0.05}s` }}
                            >
                                <div className="flex items-start gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-vault-500/10 border border-vault-500/20 flex items-center justify-center shrink-0 group-hover:bg-vault-500/20 transition-colors">
                                        <HiOutlineFolder className="w-5 h-5 text-vault-400" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="text-sm font-semibold text-dark-200 truncate group-hover:text-dark-100 transition-colors">
                                            {c.name}
                                        </h3>
                                        <p className="text-[10px] text-dark-600 mt-1 font-mono">
                                            {c.doc_count || 0} document{(c.doc_count || 0) !== 1 ? 's' : ''} · {new Date(c.created_at).toLocaleDateString()}
                                        </p>
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                )}

                {/* Feature Cards */}
                {!isLoadingCases && (
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
                )}
            </div>
        </div>
    );
}

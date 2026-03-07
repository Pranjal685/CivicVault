import React, { useState, useEffect, useCallback } from 'react';
import {
    HiOutlineShieldCheck,
    HiOutlineXMark,
    HiOutlineArrowDownTray,
    HiOutlineCheckBadge,
    HiOutlineExclamationTriangle,
    HiOutlineDocumentText,
    HiOutlineMagnifyingGlass,
    HiOutlineClock,
} from 'react-icons/hi2';

const ACTION_ICONS = {
    DOCUMENT_INGEST: HiOutlineDocumentText,
    TIMELINE_GENERATION: HiOutlineClock,
    SEARCH_QUERY: HiOutlineMagnifyingGlass,
};

const ACTION_COLORS = {
    DOCUMENT_INGEST: 'text-emerald-400',
    TIMELINE_GENERATION: 'text-blue-400',
    SEARCH_QUERY: 'text-amber-400',
};

function formatTimestamp(ts) {
    try {
        const d = new Date(ts);
        return d.toLocaleString('en-IN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
        });
    } catch {
        return ts;
    }
}

function parseDetails(detailsStr) {
    try {
        return JSON.parse(detailsStr);
    } catch {
        return {};
    }
}

function getDetailSummary(actionType, details) {
    const d = typeof details === 'string' ? parseDetails(details) : details;
    switch (actionType) {
        case 'DOCUMENT_INGEST':
            return d.filename || 'Unknown file';
        case 'TIMELINE_GENERATION':
            return `Model: ${d.model || 'unknown'} | ${d.document_count || 0} docs`;
        case 'SEARCH_QUERY':
            return `"${(d.query || '').substring(0, 50)}${(d.query || '').length > 50 ? '…' : ''}"`;
        default:
            return JSON.stringify(d).substring(0, 60);
    }
}

function exportToCSV(entries, caseName) {
    const headers = ['Timestamp', 'Action', 'Details', 'Previous Hash', 'Current Hash'];
    const rows = entries.map((e) => {
        const details = getDetailSummary(e.action_type, e.details);
        return [
            formatTimestamp(e.timestamp),
            e.action_type,
            `"${details.replace(/"/g, '""')}"`,
            e.previous_hash,
            e.current_hash,
        ].join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `CivicVault_Audit_Trail_${caseName || 'case'}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

export default function AuditTrailModal({ isOpen, onClose, caseId, caseName }) {
    const [entries, setEntries] = useState([]);
    const [loading, setLoading] = useState(false);
    const [chainStatus, setChainStatus] = useState(null); // { valid, entries, brokenAt }
    const [verifying, setVerifying] = useState(false);

    const fetchAuditTrail = useCallback(async () => {
        if (!caseId || !window.electronAPI?.getAuditTrail) return;
        setLoading(true);
        try {
            const res = await window.electronAPI.getAuditTrail(caseId);
            if (res.success) {
                setEntries(res.entries || []);
            }
        } catch (err) {
            console.error('Failed to fetch audit trail:', err);
        } finally {
            setLoading(false);
        }
    }, [caseId]);

    const handleVerify = useCallback(async () => {
        if (!caseId || !window.electronAPI?.verifyChain) return;
        setVerifying(true);
        try {
            const res = await window.electronAPI.verifyChain(caseId);
            if (res.success !== undefined) {
                setChainStatus(res);
            }
        } catch (err) {
            console.error('Chain verification failed:', err);
        } finally {
            setVerifying(false);
        }
    }, [caseId]);

    useEffect(() => {
        if (isOpen && caseId) {
            fetchAuditTrail();
            handleVerify();
        }
    }, [isOpen, caseId, fetchAuditTrail, handleVerify]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative w-full max-w-4xl max-h-[85vh] mx-4 rounded-2xl bg-dark-900 border border-dark-700/50 shadow-2xl flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-dark-700/50 bg-dark-900/80">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                            <HiOutlineShieldCheck className="w-5 h-5 text-emerald-400" />
                        </div>
                        <div>
                            <h2 className="text-base font-semibold text-dark-100">
                                Cryptographic Audit Trail
                            </h2>
                            <p className="text-xs text-dark-500">
                                {caseName || 'Case'} • {entries.length} entries • SHA-256 chain
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Chain Integrity Badge */}
                        {chainStatus && (
                            <div
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${chainStatus.valid
                                        ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                                        : 'bg-red-500/10 border border-red-500/20 text-red-400'
                                    }`}
                            >
                                {chainStatus.valid ? (
                                    <>
                                        <HiOutlineCheckBadge className="w-4 h-4" />
                                        Chain Verified
                                    </>
                                ) : (
                                    <>
                                        <HiOutlineExclamationTriangle className="w-4 h-4" />
                                        Chain Broken at #{chainStatus.brokenAt}
                                    </>
                                )}
                            </div>
                        )}

                        {/* Export CSV */}
                        <button
                            onClick={() => exportToCSV(entries, caseName)}
                            disabled={entries.length === 0}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-dark-800 border border-dark-700/50 text-dark-300 hover:text-dark-100 hover:bg-dark-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            <HiOutlineArrowDownTray className="w-3.5 h-3.5" />
                            Export CSV
                        </button>

                        {/* Close */}
                        <button
                            onClick={onClose}
                            className="p-1.5 rounded-lg text-dark-500 hover:text-dark-200 hover:bg-dark-800 transition-colors"
                        >
                            <HiOutlineXMark className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Ledger Entries */}
                <div className="flex-1 overflow-y-auto p-4">
                    {loading ? (
                        <div className="flex items-center justify-center py-16">
                            <div className="animate-spin w-6 h-6 border-2 border-dark-600 border-t-vault-400 rounded-full" />
                        </div>
                    ) : entries.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-dark-500">
                            <HiOutlineShieldCheck className="w-12 h-12 mb-3 opacity-30" />
                            <p className="text-sm">No audit entries yet</p>
                            <p className="text-xs mt-1">Actions will be recorded when you ingest documents or run queries</p>
                        </div>
                    ) : (
                        <div className="space-y-1 font-mono text-[11px]">
                            {/* Column header */}
                            <div className="flex items-center gap-3 px-3 py-2 mb-2 border-b border-dark-700/30 text-dark-600 uppercase tracking-wider text-[10px]">
                                <span className="w-40 shrink-0">Timestamp</span>
                                <span className="w-36 shrink-0">Action</span>
                                <span className="flex-1">Details</span>
                                <span className="w-24 shrink-0 text-right">Hash</span>
                            </div>

                            {entries.map((entry, index) => {
                                const Icon = ACTION_ICONS[entry.action_type] || HiOutlineShieldCheck;
                                const colorClass = ACTION_COLORS[entry.action_type] || 'text-dark-400';
                                const details = getDetailSummary(entry.action_type, entry.details);

                                return (
                                    <div
                                        key={entry.id}
                                        className="group flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-dark-800/60 transition-colors border border-transparent hover:border-dark-700/30"
                                    >
                                        {/* Timestamp */}
                                        <span className="w-40 shrink-0 text-dark-500">
                                            {formatTimestamp(entry.timestamp)}
                                        </span>

                                        {/* Action Type */}
                                        <span className={`w-36 shrink-0 flex items-center gap-1.5 ${colorClass}`}>
                                            <Icon className="w-3.5 h-3.5" />
                                            {entry.action_type}
                                        </span>

                                        {/* Details */}
                                        <span className="flex-1 text-dark-300 truncate" title={details}>
                                            {details}
                                        </span>

                                        {/* Hash (truncated) */}
                                        <span
                                            className="w-24 shrink-0 text-right text-dark-600 group-hover:text-vault-400 transition-colors cursor-default"
                                            title={`Current: ${entry.current_hash}\nPrevious: ${entry.previous_hash}`}
                                        >
                                            {entry.current_hash.substring(0, 8)}…
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Footer — Chain Info */}
                <div className="px-6 py-3 border-t border-dark-700/50 bg-dark-900/80">
                    <div className="flex items-center justify-between text-[10px] text-dark-600 font-mono">
                        <span>Genesis: 00000000…</span>
                        {entries.length > 0 && (
                            <span>
                                Latest: {entries[entries.length - 1].current_hash.substring(0, 16)}…
                            </span>
                        )}
                        <span>
                            {verifying ? 'Verifying…' : chainStatus ? `${chainStatus.entries} entries verified` : ''}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}

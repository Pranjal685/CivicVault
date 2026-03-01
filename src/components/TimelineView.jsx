import React, { useState } from 'react';
import { HiOutlineClock, HiOutlineDocumentText, HiOutlineExclamationTriangle } from 'react-icons/hi2';

export default function TimelineView({ vaultFiles }) {
    const [timelineEvents, setTimelineEvents] = useState(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState(null);
    const [selectedModel, setSelectedModel] = useState('llama3.2'); // default model

    const isElectron = Boolean(window.electronAPI);

    const handleGenerate = async () => {
        if (!isElectron) {
            setError('Timeline generation requires the Electron desktop app.');
            return;
        }

        if (vaultFiles.length === 0) {
            setError('Your vault is empty. Please upload some case files first.');
            return;
        }

        setIsGenerating(true);
        setError(null);

        try {
            const result = await window.electronAPI.generateTimeline(selectedModel);

            if (result.success && Array.isArray(result.timeline)) {
                setTimelineEvents(result.timeline);
            } else {
                setError(result.error || 'Failed to generate timeline. LLM returned invalid format.');
            }
        } catch (err) {
            console.error('Timeline generation error:', err);
            setError('An error occurred while communicating with the local AI.');
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div className="h-full flex flex-col overflow-hidden bg-dark-950">
            {/* Header */}
            <header className="shrink-0 px-8 py-5 border-b border-dark-800/30 bg-dark-950/80 backdrop-blur-md sticky top-0 z-10">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-xl font-display font-bold text-dark-100 flex items-center gap-2">
                            <HiOutlineClock className="w-6 h-6 text-vault-400" />
                            Case Chronology
                        </h1>
                        <p className="text-sm text-dark-500 mt-1">
                            1-Click automated timeline extraction using local AI
                        </p>
                    </div>
                    <div className="flex items-center gap-4">
                        <select
                            value={selectedModel}
                            onChange={(e) => setSelectedModel(e.target.value)}
                            disabled={isGenerating}
                            className={`
                                bg-dark-900 text-sm text-dark-200 border border-dark-700 rounded-lg px-3 py-1.5 focus:outline-none focus:border-vault-500
                                ${isGenerating ? 'opacity-50 cursor-not-allowed' : ''}
                            `}
                        >
                            <option value="llama3.2">LLaMA 3.2</option>
                            <option value="llama3">LLaMA 3</option>
                            <option value="mistral">Mistral</option>
                        </select>
                        <button
                            onClick={handleGenerate}
                            disabled={isGenerating || vaultFiles.length === 0}
                            className={`
                                px-6 py-2 rounded-xl text-sm font-medium transition-all duration-300 shadow-lg shadow-vault-500/10
                                ${isGenerating || vaultFiles.length === 0
                                    ? 'bg-dark-800 text-dark-500 cursor-not-allowed'
                                    : 'bg-vault-600 hover:bg-vault-500 text-white hover:shadow-vault-500/25'
                                }
                            `}
                        >
                            {isGenerating ? 'Extracting Chronology...' : 'Generate Case Timeline'}
                        </button>
                    </div>
                </div>
            </header>

            {/* Error Toast */}
            {error && (
                <div className="mx-8 mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center gap-3 animate-fade-in shrink-0">
                    <HiOutlineExclamationTriangle className="w-5 h-5 text-red-400 shrink-0" />
                    <p className="text-sm text-red-200">{error}</p>
                </div>
            )}

            {/* Main Content Area */}
            <div className="flex-1 overflow-y-auto px-8 py-6 relative">
                {/* Empty State */}
                {(!timelineEvents || timelineEvents.length === 0) && !isGenerating && (
                    <div className="h-full flex flex-col items-center justify-center text-center opacity-70">
                        <div className="w-16 h-16 rounded-2xl bg-dark-900 border border-dark-800 flex items-center justify-center mb-4">
                            <HiOutlineClock className="w-8 h-8 text-dark-600" />
                        </div>
                        <h2 className="text-lg font-medium text-dark-300">No Timeline Generated</h2>
                        <p className="text-sm text-dark-500 mt-2 max-w-sm">
                            Click the "Generate Case Timeline" button above to extract dates and events from your legal documents.
                        </p>
                    </div>
                )}

                {/* Loading Skeleton */}
                {isGenerating && (
                    <div className="max-w-3xl mx-auto py-8">
                        <div className="text-center mb-10 animate-pulse">
                            <p className="text-vault-400 font-medium">Analyzing documents...</p>
                            <p className="text-xs text-dark-500 mt-1">This may take a minute depending on your hardware.</p>
                        </div>
                        <div className="relative pl-8 border-l-2 border-dark-800 space-y-8">
                            {[1, 2, 3].map((i) => (
                                <div key={i} className="relative">
                                    <div className="absolute -left-[41px] top-1 w-4 h-4 rounded-full border-4 border-dark-950 bg-vault-700/50 animate-pulse"></div>
                                    <div className="glass-subtle rounded-xl p-5 animate-pulse">
                                        <div className="h-5 bg-dark-800 rounded w-1/4 mb-3"></div>
                                        <div className="h-4 bg-dark-900 rounded w-full mb-2"></div>
                                        <div className="h-4 bg-dark-900 rounded w-5/6 mb-4"></div>
                                        <div className="h-6 bg-dark-800/50 rounded-md w-1/3"></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Vertical Timeline UI */}
                {timelineEvents && timelineEvents.length > 0 && !isGenerating && (
                    <div className="max-w-3xl mx-auto py-4 animate-fade-in relative pl-8 border-l-2 border-dark-800">
                        {timelineEvents.map((evt, idx) => (
                            <div key={idx} className="relative mb-8 last:mb-0 group animate-slide-in-bottom" style={{ animationDelay: `${idx * 0.1}s` }}>
                                {/* Timeline Dot */}
                                <div className="absolute -left-[41px] top-[14px] w-4 h-4 rounded-full border-[3px] border-dark-950 bg-vault-500 group-hover:bg-vault-400 group-hover:scale-125 transition-all duration-300 ease-out shadow-[0_0_10px_rgba(20,184,166,0.5)]"></div>

                                {/* Event Card */}
                                <div className="glass-subtle p-5 rounded-xl hover:border-vault-500/30 transition-colors duration-300">
                                    <h3 className="text-lg font-bold text-vault-300 mb-1 tracking-tight">
                                        {evt.date}
                                    </h3>
                                    <p className="text-sm text-dark-200 leading-relaxed mb-4">
                                        {evt.event}
                                    </p>

                                    {/* Source Citation */}
                                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-dark-900/60 border border-dark-700 shrink-0">
                                        <HiOutlineDocumentText className="w-3.5 h-3.5 text-dark-400" />
                                        <span className="text-[10px] font-mono text-dark-400 uppercase tracking-widest truncate max-w-xs">
                                            {evt.source}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div >
    );
}

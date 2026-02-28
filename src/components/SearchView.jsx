import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
    HiOutlineMagnifyingGlass,
    HiOutlineDocumentText,
    HiOutlineBolt,
    HiOutlineExclamationTriangle,
    HiOutlineBookOpen,
    HiOutlineArrowPath,
    HiOutlineTrash,
} from 'react-icons/hi2';

const isElectron = Boolean(window.electronAPI);

export default function SearchView() {
    const [query, setQuery] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [conversation, setConversation] = useState([]);
    const [streamingText, setStreamingText] = useState('');
    const chatEndRef = useRef(null);
    const streamingRef = useRef('');

    // Auto-scroll to bottom on new messages and during streaming
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [conversation, isSearching, streamingText]);

    // Build chat history for the API
    const buildChatHistory = () => {
        return conversation
            .filter((msg) => msg.role === 'user' || msg.role === 'assistant')
            .map((msg) => ({ role: msg.role, content: msg.content }));
    };

    const handleSearch = useCallback(async () => {
        const q = query.trim();
        if (!q || isSearching) return;

        if (!isElectron) {
            setConversation((prev) => [
                ...prev,
                { role: 'user', content: q },
                { role: 'error', content: 'Search requires the Electron desktop app.' },
            ]);
            setQuery('');
            return;
        }

        // Add user message and start streaming
        setConversation((prev) => [...prev, { role: 'user', content: q }]);
        setQuery('');
        setIsSearching(true);
        setStreamingText('');
        streamingRef.current = '';
        const start = Date.now();

        // Subscribe to streaming tokens
        let unsubToken = null;
        if (window.electronAPI.onSearchToken) {
            unsubToken = window.electronAPI.onSearchToken((token) => {
                streamingRef.current += token;
                setStreamingText(streamingRef.current);
            });
        }

        try {
            const chatHistory = buildChatHistory();
            const res = await window.electronAPI.searchVault(q, chatHistory);
            const elapsed = ((Date.now() - start) / 1000).toFixed(1);

            // Clean up streaming listener
            if (unsubToken) unsubToken();

            if (!res.success) {
                setStreamingText('');
                setConversation((prev) => [
                    ...prev,
                    { role: 'error', content: res.error },
                ]);
            } else {
                // Finalize — use the full answer from the response
                setStreamingText('');
                setConversation((prev) => [
                    ...prev,
                    {
                        role: 'assistant',
                        content: res.answer,
                        sources: res.sources || [],
                        searchTime: elapsed,
                    },
                ]);
            }
        } catch (err) {
            if (unsubToken) unsubToken();
            setStreamingText('');
            setConversation((prev) => [
                ...prev,
                { role: 'error', content: 'Search failed: ' + err.message },
            ]);
        } finally {
            setIsSearching(false);
        }
    }, [query, isSearching, conversation]);

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSearch();
        }
    };

    const handleNewChat = () => {
        setConversation([]);
        setQuery('');
    };

    const hasConversation = conversation.length > 0;

    return (
        <div className="h-full flex flex-col overflow-hidden">
            {/* Top Header */}
            <header className="shrink-0 px-8 py-5 border-b border-dark-800/30">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-xl font-display font-bold text-dark-100">
                            Deterministic Search
                        </h1>
                        <p className="text-sm text-dark-500 mt-1">
                            Query your indexed documents with exact citations
                        </p>
                    </div>
                    {hasConversation && (
                        <button
                            onClick={handleNewChat}
                            className="flex items-center gap-2 px-3.5 py-2 rounded-xl glass-subtle text-sm text-dark-400 hover:text-dark-200 transition-colors duration-200"
                        >
                            <HiOutlineTrash className="w-4 h-4" />
                            New Chat
                        </button>
                    )}
                </div>
            </header>

            {/* Chat Area */}
            <div className="flex-1 overflow-y-auto px-8 py-6">
                {/* Empty State */}
                {!hasConversation && !isSearching && (
                    <div className="mt-12 flex flex-col items-center text-center animate-fade-in">
                        <div className="w-20 h-20 rounded-2xl bg-dark-900/50 flex items-center justify-center mb-5">
                            <HiOutlineBolt className="w-10 h-10 text-dark-700" />
                        </div>
                        <h2 className="text-lg font-display font-semibold text-dark-400 mb-2">
                            Ready to Search
                        </h2>
                        <p className="text-sm text-dark-600 max-w-md leading-relaxed">
                            Ask questions about your indexed documents. You can ask follow-up
                            questions to refine answers — the AI remembers the conversation.
                        </p>

                        <div className="mt-8 space-y-2 w-full max-w-lg">
                            <p className="text-[10px] font-semibold uppercase tracking-widest text-dark-600 mb-3">
                                Try asking
                            </p>
                            {[
                                'What are the key topics covered in this document?',
                                'Summarize the main sections',
                                'List all the important terms or definitions',
                            ].map((example) => (
                                <button
                                    key={example}
                                    onClick={() => setQuery(example)}
                                    className="w-full text-left px-4 py-3 rounded-xl glass-subtle text-sm text-dark-400 hover:text-dark-200 hover:bg-dark-800/60 transition-all duration-200 flex items-center gap-3"
                                >
                                    <HiOutlineDocumentText className="w-4 h-4 text-dark-600 shrink-0" />
                                    <span className="truncate">{example}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Conversation Messages */}
                {conversation.map((msg, i) => (
                    <div key={i} className="mb-4 animate-fade-in">
                        {/* User Message */}
                        {msg.role === 'user' && (
                            <div className="flex justify-end mb-4">
                                <div className="max-w-2xl px-4 py-3 rounded-2xl rounded-br-md bg-vault-500/15 border border-vault-500/20">
                                    <p className="text-sm text-dark-200">{msg.content}</p>
                                </div>
                            </div>
                        )}

                        {/* Assistant Answer */}
                        {msg.role === 'assistant' && (
                            <div className="space-y-4">
                                {/* Answer Card */}
                                <div className="glass rounded-2xl p-5">
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                            <div className="w-7 h-7 rounded-lg bg-vault-500/10 flex items-center justify-center">
                                                <HiOutlineBolt className="w-3.5 h-3.5 text-vault-400" />
                                            </div>
                                            <span className="text-xs font-semibold text-dark-400">AI Answer</span>
                                        </div>
                                        {msg.searchTime && (
                                            <span className="text-[10px] font-mono text-dark-600">{msg.searchTime}s</span>
                                        )}
                                    </div>
                                    <div className="text-sm text-dark-300 leading-relaxed">
                                        <MarkdownText text={msg.content} />
                                    </div>
                                </div>

                                {/* Sources (collapsible) */}
                                {msg.sources && msg.sources.length > 0 && (
                                    <SourcesList sources={msg.sources} />
                                )}
                            </div>
                        )}

                        {/* Error Message */}
                        {msg.role === 'error' && (
                            <div className="flex items-start gap-3 p-4 rounded-xl bg-red-500/5 border border-red-500/20">
                                <HiOutlineExclamationTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                                <p className="text-sm text-red-400/80">{msg.content}</p>
                            </div>
                        )}
                    </div>
                ))}

                {/* Streaming / Typing Indicator */}
                {isSearching && (
                    <div className="mb-4 animate-fade-in">
                        <div className="glass rounded-2xl p-5">
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <div className="w-7 h-7 rounded-lg bg-vault-500/10 flex items-center justify-center animate-pulse">
                                        <HiOutlineBolt className="w-3.5 h-3.5 text-vault-400" />
                                    </div>
                                    <span className="text-xs font-semibold text-dark-400">
                                        {streamingText ? 'Generating…' : 'Searching & retrieving pages…'}
                                    </span>
                                </div>
                            </div>

                            {streamingText ? (
                                <div className="text-sm text-dark-300 leading-relaxed">
                                    <MarkdownText text={streamingText} />
                                    <span className="inline-block w-1.5 h-4 bg-vault-400 animate-pulse ml-0.5 align-text-bottom rounded-sm" />
                                </div>
                            ) : (
                                <div className="flex items-center gap-1.5">
                                    <span className="text-xs text-dark-500">Analyzing documents</span>
                                    <span className="flex gap-0.5">
                                        <span className="w-1 h-1 rounded-full bg-vault-400 animate-bounce" style={{ animationDelay: '0ms' }}></span>
                                        <span className="w-1 h-1 rounded-full bg-vault-400 animate-bounce" style={{ animationDelay: '150ms' }}></span>
                                        <span className="w-1 h-1 rounded-full bg-vault-400 animate-bounce" style={{ animationDelay: '300ms' }}></span>
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                <div ref={chatEndRef} />
            </div>

            {/* Chat Input — fixed at bottom */}
            <div className="shrink-0 px-8 py-4 border-t border-dark-800/30 bg-dark-975">
                <div className="glass rounded-2xl p-1.5 vault-glow">
                    <div className="flex items-center gap-3 bg-dark-950 rounded-xl px-4 py-3">
                        <HiOutlineMagnifyingGlass className="w-5 h-5 text-dark-500 shrink-0" />
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder={hasConversation ? 'Ask a follow-up question…' : 'Ask a question about your documents…'}
                            className="flex-1 bg-transparent text-sm text-dark-100 placeholder:text-dark-600 outline-none"
                            disabled={isSearching}
                        />
                        <button
                            onClick={handleSearch}
                            disabled={!query.trim() || isSearching}
                            className={`
                px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300
                ${query.trim() && !isSearching
                                    ? 'bg-vault-500 text-dark-975 hover:bg-vault-400 shadow-vault'
                                    : 'bg-dark-800 text-dark-600 cursor-not-allowed'
                                }
              `}
                        >
                            {isSearching ? (
                                <HiOutlineArrowPath className="w-4 h-4 animate-spin" />
                            ) : (
                                'Send'
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ── Sources List Component ─────────────────────────────────────────────
function SourcesList({ sources }) {
    const [expanded, setExpanded] = useState(false);
    const visibleSources = expanded ? sources : sources.slice(0, 2);

    return (
        <div>
            <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-2 mb-2 text-xs font-semibold uppercase tracking-widest text-dark-500 hover:text-dark-300 transition-colors"
            >
                <HiOutlineBookOpen className="w-3.5 h-3.5" />
                Sources ({sources.length})
                <span className="text-[10px] normal-case font-normal">
                    {expanded ? '▲ collapse' : '▼ expand'}
                </span>
            </button>
            <div className="space-y-1.5">
                {visibleSources.map((src, i) => (
                    <div
                        key={i}
                        className="glass-subtle rounded-lg px-3 py-2.5 flex items-center justify-between gap-3"
                    >
                        <div className="flex items-center gap-2 min-w-0">
                            <HiOutlineDocumentText className="w-3.5 h-3.5 text-vault-400 shrink-0" />
                            <span className="text-xs text-dark-300 truncate">{src.source}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-vault-500/10 text-vault-400 border border-vault-500/20">
                                Page {src.page}
                            </span>
                            <span className="text-[10px] font-mono text-dark-600">
                                {Math.round(src.score * 100)}%
                            </span>
                        </div>
                    </div>
                ))}
            </div>
            {!expanded && sources.length > 2 && (
                <button
                    onClick={() => setExpanded(true)}
                    className="mt-1.5 text-[10px] text-dark-600 hover:text-dark-400 transition-colors"
                >
                    + {sources.length - 2} more sources
                </button>
            )}
        </div>
    );
}

// ── Lightweight Markdown Renderer ──────────────────────────────────────
function MarkdownText({ text }) {
    if (!text) return null;

    const lines = text.split('\n');
    const elements = [];
    let listItems = [];
    let blockquoteLines = [];

    const flushList = () => {
        if (listItems.length > 0) {
            elements.push(
                <ul key={`ul-${elements.length}`} className="ml-4 space-y-1 my-2">
                    {listItems}
                </ul>
            );
            listItems = [];
        }
    };

    const flushBlockquote = () => {
        if (blockquoteLines.length > 0) {
            elements.push(
                <blockquote
                    key={`bq-${elements.length}`}
                    className="border-l-2 border-vault-500/40 pl-3 py-1 my-3 text-xs text-dark-400 italic"
                >
                    {blockquoteLines.map((l, i) => (
                        <span key={i}>{formatInline(l)}{i < blockquoteLines.length - 1 && <br />}</span>
                    ))}
                </blockquote>
            );
            blockquoteLines = [];
        }
    };

    // Inline formatting: **bold**
    const formatInline = (str) => {
        const parts = [];
        let remaining = str;
        let key = 0;
        while (remaining.length > 0) {
            const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
            if (boldMatch) {
                const idx = remaining.indexOf(boldMatch[0]);
                if (idx > 0) parts.push(<span key={key++}>{remaining.slice(0, idx)}</span>);
                parts.push(<strong key={key++} className="text-dark-100 font-semibold">{boldMatch[1]}</strong>);
                remaining = remaining.slice(idx + boldMatch[0].length);
            } else {
                parts.push(<span key={key++}>{remaining}</span>);
                break;
            }
        }
        return parts;
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        // Blockquote
        if (trimmed.startsWith('> ')) {
            flushList();
            blockquoteLines.push(trimmed.slice(2));
            continue;
        } else if (blockquoteLines.length > 0) {
            flushBlockquote();
        }

        // ## Heading
        if (trimmed.startsWith('## ')) {
            flushList();
            elements.push(
                <h3 key={`h-${i}`} className="text-base font-display font-semibold text-dark-100 mt-4 mb-1.5 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-vault-400 shrink-0" />
                    {formatInline(trimmed.slice(3))}
                </h3>
            );
            continue;
        }

        // # Heading
        if (trimmed.startsWith('# ') && !trimmed.startsWith('## ')) {
            flushList();
            elements.push(
                <h2 key={`h1-${i}`} className="text-lg font-display font-bold text-dark-50 mt-3 mb-2">
                    {formatInline(trimmed.slice(2))}
                </h2>
            );
            continue;
        }

        // Bullet list: - text, * text, + text
        const listMatch = trimmed.match(/^[-*+]\s+(.+)$/);
        const indentLevel = line.search(/\S/) >= 4 ? 1 : 0;
        if (listMatch) {
            listItems.push(
                <li key={`li-${i}`} className={`text-dark-300 ${indentLevel > 0 ? 'ml-4' : ''}`}>
                    <span className="text-vault-400 mr-1.5">•</span>
                    {formatInline(listMatch[1])}
                </li>
            );
            continue;
        }

        // Numbered list: 1. text
        const numMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
        if (numMatch) {
            listItems.push(
                <li key={`li-${i}`} className={`text-dark-300 ${indentLevel > 0 ? 'ml-4' : ''}`}>
                    <span className="text-vault-400 mr-1.5 font-mono text-xs">{numMatch[1]}.</span>
                    {formatInline(numMatch[2])}
                </li>
            );
            continue;
        }

        // Empty line
        if (trimmed === '') {
            flushList();
            continue;
        }

        // Regular paragraph
        flushList();
        elements.push(
            <p key={`p-${i}`} className="text-dark-300 my-1">
                {formatInline(trimmed)}
            </p>
        );
    }

    flushList();
    flushBlockquote();

    return <div className="space-y-0.5">{elements}</div>;
}

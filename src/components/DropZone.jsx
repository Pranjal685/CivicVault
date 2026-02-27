import React, { useState, useCallback, useRef } from 'react';
import {
    HiOutlineCloudArrowUp,
    HiOutlineDocumentArrowUp,
    HiOutlineDocumentText,
    HiOutlineCog6Tooth,
    HiOutlineCheckCircle,
    HiOutlineExclamationTriangle,
} from 'react-icons/hi2';

export default function DropZone({ onProcessFile, onBrowseFiles, processingFile }) {
    const [isDragging, setIsDragging] = useState(false);
    const dragCounter = useRef(0);

    const isProcessing = processingFile &&
        !['done', 'error'].includes(processingFile.status) &&
        processingFile.status != null;

    const isDone = processingFile?.status === 'done';
    const isError = processingFile?.status === 'error';

    // ── Drag handlers ──────────────────────────────────────────────
    const handleDragEnter = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current++;
        if (!isProcessing) setIsDragging(true);
    }, [isProcessing]);

    const handleDragLeave = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current--;
        if (dragCounter.current === 0) setIsDragging(false);
    }, []);

    const handleDragOver = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
    }, []);

    const handleDrop = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        dragCounter.current = 0;

        if (isProcessing) return;

        const files = Array.from(e.dataTransfer.files).filter(
            (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
        );

        if (files.length > 0 && onProcessFile) {
            const file = files[0];
            // Electron 28+: use webUtils.getPathForFile() for the absolute path
            const filePath = window.electronAPI?.getPathForFile
                ? window.electronAPI.getPathForFile(file)
                : file.name;
            onProcessFile(filePath, file.name, file.size);
        }
    }, [isProcessing, onProcessFile]);

    // ── Browse click ───────────────────────────────────────────────
    const handleBrowseClick = useCallback((e) => {
        e.stopPropagation();
        if (isProcessing) return;
        onBrowseFiles?.();
    }, [isProcessing, onBrowseFiles]);

    // ── Progress percentage ────────────────────────────────────────
    const progressPercent = processingFile?.total
        ? Math.round((processingFile.progress / processingFile.total) * 100)
        : 0;

    // ── Render ─────────────────────────────────────────────────────
    return (
        <div
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            className={`
        relative rounded-2xl p-8 min-h-[280px]
        flex flex-col items-center justify-center text-center
        transition-all duration-300 ease-out
        ${isProcessing
                    ? 'drop-zone-dashed cursor-wait'
                    : isDragging
                        ? 'drop-zone-dashed-active drop-zone-active cursor-copy'
                        : 'drop-zone-dashed hover:border-dark-600 cursor-pointer'
                }
      `}
            onClick={!isProcessing ? handleBrowseClick : undefined}
        >
            {/* ── Processing Overlay ─────────────────────────────────── */}
            {(isProcessing || isDone || isError) && (
                <div className="flex flex-col items-center animate-fade-in">
                    {/* Spinner / check / error icon */}
                    {isProcessing && (
                        <div className="w-16 h-16 rounded-2xl bg-vault-500/10 flex items-center justify-center mb-5 animate-pulse-slow">
                            <HiOutlineCog6Tooth className="w-8 h-8 text-vault-400 animate-spin" style={{ animationDuration: '2s' }} />
                        </div>
                    )}
                    {isDone && (
                        <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center mb-5 animate-scale-in">
                            <HiOutlineCheckCircle className="w-8 h-8 text-emerald-400" />
                        </div>
                    )}
                    {isError && (
                        <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center mb-5 animate-scale-in">
                            <HiOutlineExclamationTriangle className="w-8 h-8 text-red-400" />
                        </div>
                    )}

                    {/* File name */}
                    <p className="text-sm font-medium text-dark-200 mb-1">
                        {processingFile.fileName}
                    </p>

                    {/* Status message */}
                    <p className={`text-xs mb-4 ${isError ? 'text-red-400' : isDone ? 'text-emerald-400' : 'text-vault-400'
                        }`}>
                        {processingFile.message}
                    </p>

                    {/* Progress bar (during embedding) */}
                    {isProcessing && processingFile.total > 0 && (
                        <div className="w-64">
                            <div className="h-1.5 rounded-full bg-dark-800 overflow-hidden">
                                <div
                                    className="h-full rounded-full bg-gradient-to-r from-vault-500 to-vault-400 transition-all duration-500 ease-out"
                                    style={{ width: `${progressPercent}%` }}
                                ></div>
                            </div>
                            <p className="text-[10px] font-mono text-dark-500 mt-2">
                                {processingFile.progress} / {processingFile.total} chunks · {progressPercent}%
                            </p>
                        </div>
                    )}
                </div>
            )}

            {/* ── Default Drop Zone UI (hidden during processing) ──── */}
            {!isProcessing && !isDone && !isError && (
                <>
                    <div
                        className={`
              w-16 h-16 rounded-2xl flex items-center justify-center mb-5
              transition-all duration-300
              ${isDragging ? 'bg-vault-500/15 scale-110' : 'bg-dark-900/80'}
            `}
                    >
                        {isDragging ? (
                            <HiOutlineDocumentArrowUp className="w-8 h-8 text-vault-400 animate-float" />
                        ) : (
                            <HiOutlineCloudArrowUp className="w-8 h-8 text-dark-500" />
                        )}
                    </div>

                    <h3
                        className={`
              text-base font-semibold mb-2 transition-colors duration-300
              ${isDragging ? 'text-vault-300' : 'text-dark-300'}
            `}
                    >
                        {isDragging ? 'Drop your case files here' : 'Drag & drop PDF case files'}
                    </h3>
                    <p className="text-sm text-dark-500 mb-4 max-w-sm">
                        Upload legal documents, case files, and evidence. All files are processed
                        and stored entirely on your local machine.
                    </p>

                    <button
                        onClick={handleBrowseClick}
                        className={`
              px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-300
              ${isDragging
                                ? 'bg-vault-500 text-dark-975 shadow-vault'
                                : 'bg-dark-800 text-dark-300 hover:bg-dark-700 hover:text-dark-100 border border-dark-700'
                            }
            `}
                    >
                        Browse Files
                    </button>

                    <div className="flex items-center gap-1.5 mt-4 text-dark-600">
                        <HiOutlineDocumentText className="w-3.5 h-3.5" />
                        <span className="text-[10px] font-mono">PDF files only · Unlimited size</span>
                    </div>
                </>
            )}

            {/* Decorative corner dots */}
            <div className="absolute top-4 left-4 w-1.5 h-1.5 rounded-full bg-dark-700/50"></div>
            <div className="absolute top-4 right-4 w-1.5 h-1.5 rounded-full bg-dark-700/50"></div>
            <div className="absolute bottom-4 left-4 w-1.5 h-1.5 rounded-full bg-dark-700/50"></div>
            <div className="absolute bottom-4 right-4 w-1.5 h-1.5 rounded-full bg-dark-700/50"></div>
        </div>
    );
}

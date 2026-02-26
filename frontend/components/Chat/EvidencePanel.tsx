"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BookOpen, ChevronDown, ChevronUp, ExternalLink, FlaskConical, GitCompare, Target } from "lucide-react";
import type { MoAContext, CompareContext, Track2Data } from "@/types";

interface EvidencePanelProps {
    track2: Track2Data;
}

export function EvidencePanel({ track2 }: EvidencePanelProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const { moa, compare } = track2;

    // Nothing to show
    if (!moa && !compare) {
        return null;
    }

    const hasContent = (moa?.mechanism || moa?.drug_class) || (compare?.alternatives && compare.alternatives.length > 0);
    if (!hasContent) {
        return null;
    }

    return (
        <div className="my-3">
            {/* Toggle Button */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center justify-between px-4 py-2.5 rounded-lg bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200/50 dark:border-indigo-800/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors"
            >
                <div className="flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    <span className="text-sm font-medium text-indigo-700 dark:text-indigo-300">
                        View Evidence & Sources
                    </span>
                </div>
                {isExpanded ? (
                    <ChevronUp className="w-4 h-4 text-indigo-500" />
                ) : (
                    <ChevronDown className="w-4 h-4 text-indigo-500" />
                )}
            </button>

            {/* Expandable Content */}
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                    >
                        <div className="mt-2 rounded-xl border border-indigo-200/50 dark:border-indigo-800/40 bg-gradient-to-br from-indigo-50/50 to-violet-50/40 dark:from-indigo-950/30 dark:to-violet-950/20 overflow-hidden">
                            {/* MoA Section */}
                            {moa && (moa.mechanism || moa.drug_class) && (
                                <div className="p-4 border-b border-indigo-100 dark:border-indigo-800/30">
                                    <div className="flex items-center gap-2 mb-3">
                                        <FlaskConical className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                                        <span className="font-semibold text-sm text-violet-800 dark:text-violet-300">
                                            Mechanism of Action
                                        </span>
                                        <span className="text-xs text-gray-500 dark:text-gray-400">
                                            ({moa.drug_name})
                                        </span>
                                    </div>

                                    {moa.drug_class && (
                                        <div className="mb-2">
                                            <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-400">
                                                {moa.drug_class}
                                            </span>
                                        </div>
                                    )}

                                    {moa.mechanism && (
                                        <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                                            {moa.mechanism}
                                        </p>
                                    )}

                                    {moa.pathway_equation && (
                                        <div className="mt-3">
                                            <p className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
                                                Pathway Equation
                                            </p>
                                            <div className="text-xs font-mono leading-relaxed text-gray-700 dark:text-gray-200 bg-white/70 dark:bg-gray-900/40 border border-indigo-100/60 dark:border-indigo-800/30 rounded-lg px-3 py-2 overflow-x-auto">
                                                {moa.pathway_equation}
                                            </div>
                                        </div>
                                    )}

                                    {moa.targets && moa.targets.length > 0 && (
                                        <div className="mt-3 flex items-start gap-2">
                                            <Target className="w-3.5 h-3.5 text-gray-400 mt-0.5" />
                                            <div className="flex flex-wrap gap-1">
                                                {moa.targets.map((target, idx) => (
                                                    <span key={idx} className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                                                        {target}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {moa.sources && moa.sources.length > 0 && (
                                        <div className="mt-3 pt-2 border-t border-indigo-100 dark:border-indigo-800/30">
                                            <p className="text-[10px] text-gray-400 dark:text-gray-500">
                                                Sources: {moa.sources.join(", ")}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Compare Section */}
                            {compare && compare.alternatives && compare.alternatives.length > 0 && (
                                <div className="p-4">
                                    <div className="flex items-center gap-2 mb-3">
                                        <GitCompare className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                                        <span className="font-semibold text-sm text-cyan-800 dark:text-cyan-300">
                                            Therapeutic Alternatives
                                        </span>
                                        {compare.therapeutic_class && (
                                            <span className="text-xs text-gray-500 dark:text-gray-400">
                                                ({compare.therapeutic_class})
                                            </span>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {compare.alternatives.slice(0, 4).map((alt, idx) => (
                                            <div
                                                key={idx}
                                                className="flex items-center justify-between p-2 rounded-lg bg-white/60 dark:bg-gray-800/40 border border-cyan-100/50 dark:border-cyan-800/30"
                                            >
                                                <div className="min-w-0">
                                                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                                                        {alt.name}
                                                    </p>
                                                    {alt.generic_name && (
                                                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                                            {alt.generic_name}
                                                        </p>
                                                    )}
                                                </div>
                                                {alt.price_raw && (
                                                    <span className="text-xs text-cyan-600 dark:text-cyan-400 shrink-0 ml-2">
                                                        {alt.price_raw}
                                                    </span>
                                                )}
                                            </div>
                                        ))}
                                    </div>

                                    {compare.sources && compare.sources.length > 0 && (
                                        <div className="mt-3 pt-2 border-t border-cyan-100 dark:border-cyan-800/30">
                                            <p className="text-[10px] text-gray-400 dark:text-gray-500">
                                                Sources: {compare.sources.join(", ")}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

"use client";

import React from "react";
import { Building2, X } from "lucide-react";
import type { RepModeContext } from "@/types";

interface RepModeBadgeProps {
    repMode: RepModeContext;
    onExit?: () => void;
}

export function RepModeBadge({ repMode, onExit }: RepModeBadgeProps) {
    if (!repMode.active || !repMode.company_name) {
        return null;
    }

    return (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-r from-purple-100 to-indigo-100 dark:from-purple-900/50 dark:to-indigo-900/40 border border-purple-200/60 dark:border-purple-700/50 shadow-sm">
            <Building2 className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
            <span className="text-xs font-medium text-purple-700 dark:text-purple-300">
                Representing {repMode.company_name}
            </span>
            {onExit && (
                <button
                    onClick={onExit}
                    className="ml-1 p-0.5 rounded-full hover:bg-purple-200 dark:hover:bg-purple-800/50 transition-colors"
                    title="Exit Rep Mode"
                >
                    <X className="w-3 h-3 text-purple-500 dark:text-purple-400" />
                </button>
            )}
        </div>
    );
}

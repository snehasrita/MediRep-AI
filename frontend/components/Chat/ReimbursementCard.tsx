"use client";

import React from "react";
import { motion } from "framer-motion";
import { CreditCard, ExternalLink, IndianRupee, Building2, FileCheck } from "lucide-react";
import type { InsuranceContext } from "@/types";

interface ReimbursementCardProps {
    data: InsuranceContext;
}

export function ReimbursementCard({ data }: ReimbursementCardProps) {
    const { scheme, matched_procedure, other_matches, no_match_reason, note } = data;

    // No insurance data to display
    if (!matched_procedure && !no_match_reason) {
        return null;
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="my-3 rounded-xl border border-emerald-200/50 bg-gradient-to-br from-emerald-50/90 to-teal-50/80 dark:from-emerald-950/40 dark:to-teal-950/30 dark:border-emerald-800/40 overflow-hidden shadow-sm"
        >
            {/* Header */}
            <div className="px-4 py-3 bg-emerald-100/60 dark:bg-emerald-900/30 border-b border-emerald-200/40 dark:border-emerald-800/30 flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-emerald-500/20 dark:bg-emerald-500/30">
                    <CreditCard className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                </div>
                <span className="font-semibold text-emerald-800 dark:text-emerald-300 text-sm">
                    PM-JAY Coverage
                </span>
                {scheme?.source_url && (
                    <a
                        href={scheme.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-auto flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 hover:underline"
                    >
                        <span>View Source</span>
                        <ExternalLink className="w-3 h-3" />
                    </a>
                )}
            </div>

            {/* Content */}
            <div className="p-4">
                {matched_procedure ? (
                    <div className="space-y-3">
                        {/* Main Procedure Match */}
                        <div className="flex items-start gap-3">
                            <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-800/50 shrink-0">
                                <FileCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="font-medium text-gray-900 dark:text-white text-sm leading-tight">
                                    {matched_procedure.procedure_name}
                                </p>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                    Code: {matched_procedure.package_code}
                                    {matched_procedure.category && ` • ${matched_procedure.category}`}
                                </p>
                            </div>
                        </div>

                        {/* Rate Display */}
                        <div className="flex items-center justify-between p-3 rounded-lg bg-white/80 dark:bg-gray-800/60 border border-emerald-100 dark:border-emerald-800/40">
                            <div className="flex items-center gap-2">
                                <IndianRupee className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                                <span className="text-xs text-gray-600 dark:text-gray-400">Package Rate</span>
                            </div>
                            <span className="text-lg font-bold text-emerald-700 dark:text-emerald-400">
                                {matched_procedure.rate_display || `₹${matched_procedure.rate_inr.toLocaleString("en-IN")}`}
                            </span>
                        </div>

                        {/* Additional Info */}
                        {(matched_procedure.includes_implants || matched_procedure.special_conditions) && (
                            <div className="flex flex-wrap gap-2 text-xs">
                                {matched_procedure.includes_implants && (
                                    <span className="px-2 py-1 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400">
                                        Includes Implants
                                    </span>
                                )}
                                {matched_procedure.special_conditions && (
                                    <span className="px-2 py-1 rounded-full bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400">
                                        {matched_procedure.special_conditions}
                                    </span>
                                )}
                            </div>
                        )}

                        {/* Other Matches */}
                        {other_matches && other_matches.length > 0 && (
                            <div className="pt-2 border-t border-emerald-100 dark:border-emerald-800/40">
                                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Other related packages:</p>
                                <div className="space-y-1">
                                    {other_matches.slice(0, 2).map((match, idx) => (
                                        <div key={idx} className="flex items-center justify-between text-xs">
                                            <span className="text-gray-600 dark:text-gray-400 truncate max-w-[60%]">
                                                {match.procedure_name}
                                            </span>
                                            <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                                                {match.rate_display || `₹${match.rate_inr.toLocaleString("en-IN")}`}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    /* No Match State */
                    <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/30">
                        <Building2 className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                        <div>
                            <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                                No exact package match found
                            </p>
                            {no_match_reason && (
                                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                                    {no_match_reason}
                                </p>
                            )}
                        </div>
                    </div>
                )}

                {/* Note */}
                {note && (
                    <p className="mt-3 text-xs text-gray-500 dark:text-gray-400 italic">
                        {note}
                    </p>
                )}

                {/* Data Source */}
                {matched_procedure?.data_source && (
                    <p className="mt-2 text-[10px] text-gray-400 dark:text-gray-500">
                        Source: {matched_procedure.data_source}
                    </p>
                )}
            </div>
        </motion.div>
    );
}

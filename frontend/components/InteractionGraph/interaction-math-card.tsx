"use client";

import * as React from "react";
import { X, FlaskConical, ArrowRight, AlertTriangle, ImageIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { EnhancedInteraction } from "@/types";
import { motion } from "framer-motion";

const severityConfig = {
    major: {
        color: "text-red-500",
        bgColor: "bg-red-500/10",
        borderColor: "border-red-500/50",
        label: "Major",
    },
    moderate: {
        color: "text-yellow-500",
        bgColor: "bg-yellow-500/10",
        borderColor: "border-yellow-500/50",
        label: "Moderate",
    },
    minor: {
        color: "text-blue-500",
        bgColor: "bg-blue-500/10",
        borderColor: "border-blue-500/50",
        label: "Minor",
    },
    none: {
        color: "text-green-500",
        bgColor: "bg-green-500/10",
        borderColor: "border-green-500/50",
        label: "None",
    },
};

export interface InteractionMathCardProps {
    interaction: EnhancedInteraction;
    onClose?: () => void;
    className?: string;
}

export function InteractionMathCard({
    interaction,
    onClose,
    className,
}: InteractionMathCardProps) {
    const { victim_drug, perpetrator_drug, interaction_mathematics, metabolic_pathway, clinical_impact } = interaction;
    const config = severityConfig[interaction_mathematics.severity] || severityConfig.moderate;

    return (
        <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className={cn(
                "bg-slate-900/95 backdrop-blur-xl border border-slate-700 rounded-xl shadow-2xl overflow-hidden",
                className
            )}
        >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-700/50 bg-gradient-to-r from-slate-800/50 to-transparent">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-cyan-500/20">
                        <FlaskConical className="h-5 w-5 text-cyan-400" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-white">Interaction Mathematics</h3>
                        <p className="text-xs text-slate-400">Pharmacokinetic Analysis</p>
                    </div>
                </div>
                {onClose && (
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-white" onClick={onClose}>
                        <X className="h-4 w-4" />
                    </Button>
                )}
            </div>

            <div className="p-4 space-y-4">
                {/* Drug Formulas */}
                <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center">
                    <div className="bg-slate-800/80 p-3 rounded-lg text-center">
                        <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Perpetrator</div>
                        <div className="font-mono text-orange-400 text-lg tracking-wide">{perpetrator_drug.formula_display}</div>
                        <div className="text-sm text-white font-medium mt-1">{perpetrator_drug.name}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">{perpetrator_drug.molecular_weight} g/mol</div>
                    </div>

                    <div className="flex flex-col items-center gap-1">
                        <ArrowRight className="h-5 w-5 text-slate-500" />
                        <span className="text-[10px] text-slate-500">inhibits</span>
                    </div>

                    <div className="bg-slate-800/80 p-3 rounded-lg text-center">
                        <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Victim</div>
                        <div className="font-mono text-cyan-400 text-lg tracking-wide">{victim_drug.formula_display}</div>
                        <div className="text-sm text-white font-medium mt-1">{victim_drug.name}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">{victim_drug.molecular_weight} g/mol</div>
                    </div>
                </div>

                {/* AUC Calculation Box */}
                <div className={cn(
                    "p-4 rounded-lg border",
                    config.bgColor,
                    config.borderColor
                )}>
                    <div className="text-xs text-slate-300 mb-2 font-medium">AUC Ratio Formula</div>
                    <div className="font-mono text-white text-center text-xl mb-2 tracking-wide">
                        {interaction_mathematics.formula}
                    </div>
                    <div className="text-sm text-slate-400 text-center font-mono">
                        {interaction_mathematics.calculation}
                    </div>
                    <div className="mt-3 flex justify-center">
                        <Badge className={cn("text-sm px-4 py-1", config.color, config.bgColor, config.borderColor)}>
                            R = {interaction_mathematics.auc_ratio_r} ({config.label})
                        </Badge>
                    </div>
                </div>

                {/* Metabolic Pathway */}
                <div className="bg-slate-800/60 p-3 rounded-lg space-y-2">
                    <div className="text-xs font-semibold text-white uppercase tracking-wider">Metabolic Pathway</div>
                    <div className="space-y-1.5">
                        <div className="flex items-start gap-2 text-xs">
                            <span className="text-green-400 font-mono">✓</span>
                            <span className="text-slate-300">{metabolic_pathway.victim_normal}</span>
                        </div>
                        <div className="flex items-start gap-2 text-xs">
                            <span className="text-red-400 font-mono">✗</span>
                            <span className="text-slate-300">{metabolic_pathway.victim_inhibited}</span>
                        </div>
                        <div className="flex items-start gap-2 text-xs mt-2 pt-2 border-t border-slate-700/50">
                            <ArrowRight className="h-3 w-3 text-yellow-400 mt-0.5" />
                            <span className="text-yellow-400 font-medium">{metabolic_pathway.result}</span>
                        </div>
                    </div>
                </div>

                {/* Resulting Metabolite (New) */}
                {metabolic_pathway.affected_metabolite_name && (
                    <div className="bg-slate-800/60 p-3 rounded-lg border border-slate-700/50">
                        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                            Affected Metabolite Formula
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-white font-medium">{metabolic_pathway.affected_metabolite_name}</span>
                            <span className="font-mono text-cyan-400 bg-cyan-950/30 px-2 py-1 rounded text-sm">
                                {metabolic_pathway.affected_metabolite_formula}
                            </span>
                        </div>
                        <div className="text-[10px] text-red-400 mt-1 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                            Production Inhibited / Altered
                        </div>

                        {/* Metabolite Structure Image */}
                        {metabolic_pathway.affected_metabolite_smiles && (
                            <div className="mt-3 flex justify-center bg-white/5 p-2 rounded border border-white/5">
                                <img
                                    src={`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/smiles/${encodeURIComponent(metabolic_pathway.affected_metabolite_smiles)}/PNG?record_type=2d&image_size=300x300`}
                                    alt="Metabolite Structure"
                                    className="w-40 h-40 object-contain invert opacity-90"
                                />
                            </div>
                        )}
                    </div>
                )}

                {/* Clinical Parameters */}
                <div className="grid grid-cols-3 gap-2">
                    <div className="bg-slate-800/60 p-2 rounded text-center">
                        <div className="text-[10px] text-slate-500 uppercase">[I] Inhibitor</div>
                        <div className="text-white font-mono text-sm">{interaction_mathematics.inhibitor_concentration_um} μM</div>
                    </div>
                    <div className="bg-slate-800/60 p-2 rounded text-center">
                        <div className="text-[10px] text-slate-500 uppercase">Ki</div>
                        <div className="text-white font-mono text-sm">{interaction_mathematics.ki_value_um} μM</div>
                    </div>
                    <div className="bg-slate-800/60 p-2 rounded text-center">
                        <div className="text-[10px] text-slate-500 uppercase">Enzyme</div>
                        <div className="text-white font-mono text-sm">{interaction_mathematics.affected_enzyme}</div>
                    </div>
                </div>

                {/* Chemical Reaction Visualization */}
                {interaction.reaction_image && (
                    <div className="bg-slate-800/60 p-3 rounded-lg border border-slate-700/50">
                        <div className="text-xs font-semibold text-white uppercase tracking-wider mb-2 flex items-center gap-2">
                            <ImageIcon className="h-3.5 w-3.5 text-purple-400" />
                            Chemical Reaction Visualization
                        </div>
                        <div className="relative group">
                            <img
                                src={interaction.reaction_image.url}
                                alt={`Chemical reaction between ${perpetrator_drug.name} and ${victim_drug.name}`}
                                className="w-full h-auto rounded-lg object-cover max-h-64"
                                loading="lazy"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-lg" />
                        </div>
                        <p className="text-[10px] text-slate-500 mt-2 italic">
                            AI-generated visualization of molecular interaction
                        </p>
                    </div>
                )}

                {/* Clinical Recommendation */}
                <div className="bg-amber-500/10 border border-amber-500/30 p-3 rounded-lg">
                    <div className="flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
                        <div>
                            <div className="text-xs font-semibold text-amber-400 mb-1">Clinical Recommendation</div>
                            <p className="text-xs text-slate-300">{clinical_impact.recommendation}</p>
                        </div>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}

"use client";

import * as React from "react";
import { AlertTriangle, AlertCircle, Info, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { DrugInteraction } from "@/types";
import { motion } from "framer-motion";

const severityConfig = {
  major: {
    color: "text-red-500",
    bgColor: "bg-red-500/10",
    borderColor: "border-red-500/50",
    icon: AlertTriangle,
  },
  moderate: {
    color: "text-yellow-500",
    bgColor: "bg-yellow-500/10",
    borderColor: "border-yellow-500/50",
    icon: AlertCircle,
  },
  minor: {
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/50",
    icon: Info,
  },
};

export interface InteractionListProps {
  interactions: DrugInteraction[];
  onSelect: (interaction: DrugInteraction) => void;
  selectedInteraction?: DrugInteraction | null;
  className?: string;
}

export function InteractionList({ interactions, onSelect, selectedInteraction, className }: InteractionListProps) {
  if (interactions.length === 0) {
    return (
      <div className={cn("flex flex-col items-center justify-center py-8 text-center", className)}>
        <div className="rounded-full bg-green-500/10 p-4 mb-3">
          <Info className="h-6 w-6 text-green-500" />
        </div>
        <p className="text-sm font-medium">No interactions found</p>
        <p className="text-xs text-muted-foreground mt-1">These drugs appear safe to use together</p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      {interactions.map((interaction, index) => {
        const config = severityConfig[interaction.severity];
        const Icon = config.icon;
        const isSelected = selectedInteraction?.drug1 === interaction.drug1 &&
          selectedInteraction?.drug2 === interaction.drug2;

        return (
          <motion.div
            key={`${interaction.drug1}-${interaction.drug2}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className={cn(
              "group p-3 border rounded-lg cursor-pointer transition-all duration-200",
              "hover:shadow-lg hover:scale-[1.01] hover:border-opacity-80",
              config.borderColor,
              config.bgColor,
              isSelected && "ring-2 ring-primary shadow-lg"
            )}
            onClick={() => onSelect(interaction)}
          >
            <div className="flex items-start gap-3">
              {/* Icon */}
              <div className={cn(
                "mt-0.5 p-1.5 rounded-md shrink-0",
                config.bgColor
              )}>
                <Icon className={cn("h-4 w-4", config.color)} />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground leading-tight">
                  {interaction.drug1} + {interaction.drug2}
                </p>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                  {interaction.description}
                </p>
              </div>

              {/* Badge & Arrow */}
              <div className="flex items-center gap-2 shrink-0 ml-2">
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px] font-semibold px-2 py-0.5",
                    config.color,
                    config.borderColor,
                    "bg-background/50"
                  )}
                >
                  {interaction.severity}
                </Badge>
                <ChevronRight className={cn(
                  "h-5 w-5 text-muted-foreground/50",
                  "group-hover:text-foreground group-hover:translate-x-0.5 transition-all"
                )} />
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

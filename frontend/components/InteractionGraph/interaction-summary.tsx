"use client";

import * as React from "react";
import { AlertTriangle, AlertCircle, Info, Shield } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { DrugInteraction } from "@/types";

export interface InteractionSummaryProps {
  interactions: DrugInteraction[];
  className?: string;
}

export function InteractionSummary({ interactions, className }: InteractionSummaryProps) {
  const counts = {
    major: interactions.filter(i => i.severity === "major").length,
    moderate: interactions.filter(i => i.severity === "moderate").length,
    minor: interactions.filter(i => i.severity === "minor").length,
  };

  const total = interactions.length;

  const summaryItems = [
    {
      label: "Major",
      count: counts.major,
      color: "text-red-500",
      bgColor: "bg-red-500/10",
      icon: AlertTriangle,
    },
    {
      label: "Moderate",
      count: counts.moderate,
      color: "text-yellow-500",
      bgColor: "bg-yellow-500/10",
      icon: AlertCircle,
    },
    {
      label: "Minor",
      count: counts.minor,
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
      icon: Info,
    },
  ];

  return (
    <div className={cn("grid grid-cols-3 gap-3", className)}>
      {summaryItems.map((item) => {
        const Icon = item.icon;
        return (
          <Card key={item.label} className={cn("border", item.bgColor)}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className={cn("rounded-lg p-1.5", item.bgColor)}>
                  <Icon className={cn("h-4 w-4", item.color)} />
                </div>
                <span className="text-xs font-medium text-muted-foreground">{item.label}</span>
              </div>
              <p className={cn("text-2xl font-bold", item.color)}>{item.count}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

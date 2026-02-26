"use client";

import * as React from "react";
import { AlertTriangle, AlertCircle, Info, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DrugInteraction } from "@/types";

const severityConfig = {
  major: {
    color: "text-red-500",
    bgColor: "bg-red-500/10",
    borderColor: "border-red-500/50",
    icon: AlertTriangle,
    label: "Major",
  },
  moderate: {
    color: "text-yellow-500",
    bgColor: "bg-yellow-500/10",
    borderColor: "border-yellow-500/50",
    icon: AlertCircle,
    label: "Moderate",
  },
  minor: {
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/50",
    icon: Info,
    label: "Minor",
  },
};

export interface InteractionCardProps {
  interaction: DrugInteraction;
  onClose?: () => void;
  className?: string;
}

export function InteractionCard({ interaction, onClose, className }: InteractionCardProps) {
  const config = severityConfig[interaction.severity];
  const Icon = config.icon;

  return (
    <Card className={cn("border-2", config.borderColor, config.bgColor, className)}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={cn("rounded-lg p-2", config.bgColor)}>
              <Icon className={cn("h-5 w-5", config.color)} />
            </div>
            <div>
              <CardTitle className="text-lg">
                {interaction.drug1} + {interaction.drug2}
              </CardTitle>
              <Badge variant="outline" className={cn("mt-1", config.color, config.borderColor)}>
                {config.label} Interaction
              </Badge>
            </div>
          </div>
          {onClose && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <h4 className="text-sm font-semibold mb-1">Description</h4>
          <p className="text-sm text-muted-foreground">{interaction.description}</p>
        </div>
        {interaction.recommendation && (
          <div>
            <h4 className="text-sm font-semibold mb-1">Recommendation</h4>
            <p className="text-sm text-muted-foreground">{interaction.recommendation}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

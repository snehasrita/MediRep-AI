"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Pill, AlertTriangle, Shield, Database } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ExportStatsProps {
  drugCount: number;
  interactionCount: number;
  savedDrugCount: number;
  className?: string;
}

export function ExportStats({
  drugCount,
  interactionCount,
  savedDrugCount,
  className
}: ExportStatsProps) {
  const stats = [
    {
      label: "Drugs",
      value: drugCount,
      icon: Pill,
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
    },
    {
      label: "Interactions",
      value: interactionCount,
      icon: AlertTriangle,
      color: "text-yellow-500",
      bgColor: "bg-yellow-500/10",
    },
    {
      label: "Saved",
      value: savedDrugCount,
      icon: Database,
      color: "text-green-500",
      bgColor: "bg-green-500/10",
    },
  ];

  return (
    <div className={cn("grid grid-cols-2 md:grid-cols-4 gap-4", className)}>
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <Card key={stat.label}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={cn("rounded-lg p-2", stat.bgColor)}>
                  <Icon className={cn("h-5 w-5", stat.color)} />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stat.value}</p>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

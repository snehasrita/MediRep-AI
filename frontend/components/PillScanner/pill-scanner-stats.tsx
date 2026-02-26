"use client";

import { Card } from "@/components/ui/card";
import { Database, Search, CheckCircle, Clock } from "lucide-react";

interface StatItem {
  label: string;
  value: string;
  icon: React.ReactNode;
  description: string;
}

export default function PillScannerStats() {
  const stats: StatItem[] = [
    {
      label: "Database Size",
      value: "250K+",
      icon: <Database className="h-5 w-5" />,
      description: "Indian drug records",
    },
    {
      label: "Search Methods",
      value: "2",
      icon: <Search className="h-5 w-5" />,
      description: "Text + Vector search",
    },
    {
      label: "Accuracy",
      value: "85%+",
      icon: <CheckCircle className="h-5 w-5" />,
      description: "For clear images",
    },
    {
      label: "Scan Time",
      value: "<5s",
      icon: <Clock className="h-5 w-5" />,
      description: "Average processing",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat) => (
        <Card key={stat.label} className="p-4 hover:shadow-md transition-shadow">
          <div className="flex items-start gap-3">
            <div className="text-primary mt-1">{stat.icon}</div>
            <div className="flex-1 min-w-0">
              <p className="text-2xl font-bold mb-1">{stat.value}</p>
              <p className="text-sm font-medium mb-0.5">{stat.label}</p>
              <p className="text-xs text-muted-foreground">{stat.description}</p>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Clock, Upload } from "lucide-react";
import { PatientContext } from "@/types";

interface PatientHistoryProps {
  onLoad: (context: PatientContext) => void;
}

interface HistoryItem {
  id: string;
  timestamp: string;
  context: PatientContext;
}

export function PatientHistory({ onLoad }: PatientHistoryProps) {
  const [history, setHistory] = useState<HistoryItem[]>([]);

  useEffect(() => {
    // Load from localStorage
    const saved = localStorage.getItem("patientContextHistory");
    if (saved) {
      try {
        setHistory(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load history:", e);
      }
    }
  }, []);

  const handleLoad = (item: HistoryItem) => {
    onLoad(item.context);
  };

  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  if (history.length === 0) {
    return (
      <div className="text-center py-8">
        <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-50" />
        <p className="text-sm text-muted-foreground">No recent contexts</p>
        <p className="text-xs text-muted-foreground mt-1">
          Saved contexts will appear here
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[300px]">
      <div className="space-y-2">
        {history.slice(0, 5).map((item) => (
          <div
            key={item.id}
            className="p-3 border rounded-lg hover:bg-accent cursor-pointer transition-colors"
            onClick={() => handleLoad(item)}
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  {formatDate(item.timestamp)}
                </span>
              </div>
              <Button size="sm" variant="ghost" className="h-6 px-2">
                <Upload className="h-3 w-3" />
              </Button>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">
                {item.context.age} years, {item.context.sex}
              </p>
              <div className="flex flex-wrap gap-1">
                {item.context.preExistingDiseases && item.context.preExistingDiseases.length > 0 && (
                  <Badge variant="secondary" className="text-xs bg-orange-100 text-orange-800">
                    {item.context.preExistingDiseases.length} diseases
                  </Badge>
                )}
                {item.context.currentMeds && item.context.currentMeds.length > 0 && (
                  <Badge variant="default" className="text-xs">
                    {item.context.currentMeds.length} meds
                  </Badge>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, Trash2, Eye } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface ScanHistoryItem {
  id: string;
  timestamp: Date;
  pillName: string;
  confidence: number;
  imprint?: string;
  color?: string;
  shape?: string;
}

export default function PillScanHistory() {
  const [history, setHistory] = useState<ScanHistoryItem[]>([]);

  useEffect(() => {
    // Load history from localStorage
    const stored = localStorage.getItem("pill-scan-history");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setHistory(
          parsed.map((item: any) => ({
            ...item,
            timestamp: new Date(item.timestamp),
          }))
        );
      } catch (e) {
        console.error("Failed to parse scan history", e);
      }
    }
  }, []);

  const clearHistory = () => {
    localStorage.removeItem("pill-scan-history");
    setHistory([]);
  };

  const removeItem = (id: string) => {
    const updated = history.filter((item) => item.id !== id);
    setHistory(updated);
    localStorage.setItem("pill-scan-history", JSON.stringify(updated));
  };

  if (history.length === 0) {
    return (
      <Card className="p-6 text-center">
        <Clock className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
        <p className="text-muted-foreground">No scan history yet</p>
        <p className="text-sm text-muted-foreground mt-1">
          Your recent pill scans will appear here
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">Recent Scans</h3>
        </div>
        <Button variant="ghost" size="sm" onClick={clearHistory}>
          <Trash2 className="h-4 w-4 mr-2" />
          Clear All
        </Button>
      </div>

      <div className="space-y-3">
        {history.slice(0, 10).map((item) => (
          <Card key={item.id} className="p-4 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <h4 className="font-semibold truncate">{item.pillName}</h4>
                  <Badge
                    variant="outline"
                    className={
                      item.confidence >= 0.8
                        ? "bg-green-500/10 text-green-700 dark:text-green-400"
                        : item.confidence >= 0.6
                        ? "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400"
                        : "bg-orange-500/10 text-orange-700 dark:text-orange-400"
                    }
                  >
                    {Math.round(item.confidence * 100)}%
                  </Badge>
                </div>

                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground mb-2">
                  {item.imprint && (
                    <span className="flex items-center gap-1">
                      <span className="font-medium">Imprint:</span> {item.imprint}
                    </span>
                  )}
                  {item.color && (
                    <span className="flex items-center gap-1">
                      <span className="font-medium">Color:</span> {item.color}
                    </span>
                  )}
                  {item.shape && (
                    <span className="flex items-center gap-1">
                      <span className="font-medium">Shape:</span> {item.shape}
                    </span>
                  )}
                </div>

                <p className="text-xs text-muted-foreground">
                  {formatDistanceToNow(item.timestamp, { addSuffix: true })}
                </p>
              </div>

              <div className="flex gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={() => removeItem(item.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </Card>
  );
}

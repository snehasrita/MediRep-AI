"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, Trash2, FileJson, FileText, FileSpreadsheet, FileCode, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { ExportFormat } from "./export-format-selector";

export interface ExportHistoryItem {
  id: string;
  format: ExportFormat;
  timestamp: string;
  size: string;
  itemCount: number;
}

export interface ExportHistoryProps {
  history: ExportHistoryItem[];
  onDownload: (id: string) => void;
  onDelete: (id: string) => void;
  className?: string;
}

const formatIcons = {
  json: FileJson,
  pdf: FileText,
  csv: FileSpreadsheet,
  xml: FileCode,
};

const formatColors = {
  json: "text-blue-500",
  pdf: "text-red-500",
  csv: "text-green-500",
  xml: "text-purple-500",
};

export function ExportHistory({ history, onDownload, onDelete, className }: ExportHistoryProps) {
  if (history.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>Export History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="rounded-full bg-muted p-4 mb-3">
              <Clock className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">No exports yet</p>
            <p className="text-xs text-muted-foreground mt-1">Your export history will appear here</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Export History ({history.length})</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <AnimatePresence mode="popLayout">
            {history.map((item) => {
              const Icon = formatIcons[item.format];
              const color = formatColors[item.format];

              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.2 }}
                  className="flex items-center justify-between p-3 border rounded-lg hover:border-primary/50 transition-colors group"
                >
                  <div className="flex items-center gap-3 flex-1">
                    <Icon className={cn("h-5 w-5", color)} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">Export</p>
                        <Badge variant="outline" className="text-xs">
                          {item.format.toUpperCase()}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{new Date(item.timestamp).toLocaleString()}</span>
                        <span>•</span>
                        <span>{item.size}</span>
                        <span>•</span>
                        <span>{item.itemCount} items</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => onDownload(item.id)}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => onDelete(item.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </CardContent>
    </Card>
  );
}

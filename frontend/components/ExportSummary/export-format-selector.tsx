"use client";

import * as React from "react";
import { FileJson, FileText, FileSpreadsheet, FileCode } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

export type ExportFormat = "json" | "pdf" | "csv" | "xml";

export interface ExportFormatSelectorProps {
  selectedFormat: ExportFormat;
  onFormatChange: (format: ExportFormat) => void;
  className?: string;
}

const formats = [
  {
    id: "json" as ExportFormat,
    label: "JSON",
    description: "Machine-readable format",
    icon: FileJson,
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
  },
  {
    id: "pdf" as ExportFormat,
    label: "PDF",
    description: "Printable document",
    icon: FileText,
    color: "text-red-500",
    bgColor: "bg-red-500/10",
  },
  {
    id: "csv" as ExportFormat,
    label: "CSV",
    description: "Spreadsheet format",
    icon: FileSpreadsheet,
    color: "text-green-500",
    bgColor: "bg-green-500/10",
  },
  {
    id: "xml" as ExportFormat,
    label: "XML",
    description: "Structured data",
    icon: FileCode,
    color: "text-purple-500",
    bgColor: "bg-purple-500/10",
  },
];

export function ExportFormatSelector({ selectedFormat, onFormatChange, className }: ExportFormatSelectorProps) {
  return (
    <div className={cn("grid grid-cols-2 md:grid-cols-4 gap-3", className)}>
      {formats.map((format) => {
        const Icon = format.icon;
        const isSelected = selectedFormat === format.id;

        return (
          <motion.div
            key={format.id}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <Card
              className={cn(
                "cursor-pointer transition-all hover:shadow-md",
                isSelected && "ring-2 ring-primary border-primary"
              )}
              onClick={() => onFormatChange(format.id)}
            >
              <CardContent className="p-4">
                <div className="flex flex-col items-center text-center gap-2">
                  <div className={cn("rounded-lg p-3", format.bgColor)}>
                    <Icon className={cn("h-6 w-6", format.color)} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{format.label}</p>
                    <p className="text-xs text-muted-foreground">{format.description}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        );
      })}
    </div>
  );
}

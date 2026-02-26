"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { ExportFormat } from "./export-format-selector";
import { ExportOptionsData } from "./export-options";

export interface ExportPreviewProps {
  format: ExportFormat;
  options: ExportOptionsData;
  data: any;
  className?: string;
}

export function ExportPreview({ format, options, data, className }: ExportPreviewProps) {
  const generatePreview = () => {
    const filteredData: any = {};

    if (options.includeDrugInfo && data.drugs) {
      filteredData.drugs = data.drugs;
    }
    if (options.includeInteractions && data.interactions) {
      filteredData.interactions = data.interactions;
    }
    if (options.includeAlerts && data.alerts) {
      filteredData.alerts = data.alerts;
    }
    if (options.includeSavedDrugs && data.savedDrugs) {
      filteredData.savedDrugs = data.savedDrugs;
    }
    if (options.includeTimestamp) {
      filteredData.timestamp = new Date().toISOString();
    }
    if (options.includeMetadata) {
      filteredData.metadata = {
        totalDrugs: data.drugs?.length || 0,
        totalInteractions: data.interactions?.length || 0,
        totalAlerts: data.alerts?.length || 0,
      };
    }

    switch (format) {
      case "json":
        return JSON.stringify(filteredData, null, 2);
      case "csv":
        return generateCSV(filteredData);
      case "xml":
        return generateXML(filteredData);
      case "pdf":
        return "PDF preview not available. Download to view.";
      default:
        return "";
    }
  };

  const generateCSV = (data: any) => {
    let csv = "";
    
    if (data.drugs) {
      csv += "Drug Name,Generic Name,Manufacturer\n";
      data.drugs.forEach((drug: any) => {
        csv += `"${drug.name || ""}","${drug.generic_name || ""}","${drug.manufacturer || ""}"\n`;
      });
      csv += "\n";
    }

    if (data.interactions) {
      csv += "Drug 1,Drug 2,Severity,Description\n";
      data.interactions.forEach((interaction: any) => {
        csv += `"${interaction.drug1}","${interaction.drug2}","${interaction.severity}","${interaction.description}"\n`;
      });
    }

    return csv;
  };

  const generateXML = (data: any) => {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<export>\n';
    
    if (data.drugs) {
      xml += '  <drugs>\n';
      data.drugs.forEach((drug: any) => {
        xml += `    <drug>\n`;
        xml += `      <name>${drug.name || ""}</name>\n`;
        xml += `      <generic_name>${drug.generic_name || ""}</generic_name>\n`;
        xml += `    </drug>\n`;
      });
      xml += '  </drugs>\n';
    }

    if (data.timestamp) {
      xml += `  <timestamp>${data.timestamp}</timestamp>\n`;
    }

    xml += '</export>';
    return xml;
  };

  const preview = generatePreview();
  const lineCount = preview.split('\n').length;

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Preview</CardTitle>
          <Badge variant="outline">{lineCount} lines</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px] w-full rounded-md border bg-muted/50">
          <pre className="p-4 text-xs font-mono">
            <code>{preview}</code>
          </pre>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

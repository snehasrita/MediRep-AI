"use client";

import * as React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export interface ExportOptionsData {
  includeDrugInfo: boolean;
  includeInteractions: boolean;
  includeAlerts: boolean;
  includeSavedDrugs: boolean;
  includeTimestamp: boolean;
  includeMetadata: boolean;
}

export interface ExportOptionsProps {
  options: ExportOptionsData;
  onOptionsChange: (options: ExportOptionsData) => void;
  className?: string;
}

export function ExportOptions({ options, onOptionsChange, className }: ExportOptionsProps) {
  const handleChange = (key: keyof ExportOptionsData, value: boolean) => {
    onOptionsChange({ ...options, [key]: value });
  };

  const dataOptions = [
    { key: "includeDrugInfo" as keyof ExportOptionsData, label: "Drug Information", description: "Include detailed drug data" },
    { key: "includeInteractions" as keyof ExportOptionsData, label: "Drug Interactions", description: "Include interaction analysis" },
    { key: "includeAlerts" as keyof ExportOptionsData, label: "FDA Alerts", description: "Include safety alerts and recalls" },
    { key: "includeSavedDrugs" as keyof ExportOptionsData, label: "Saved Drugs", description: "Include user's saved medications" },
  ];

  const metadataOptions = [
    { key: "includeTimestamp" as keyof ExportOptionsData, label: "Timestamp", description: "Add export date and time" },
    { key: "includeMetadata" as keyof ExportOptionsData, label: "Metadata", description: "Include summary statistics" },
  ];

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Export Options</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          <p className="text-sm font-medium">Data to Include</p>
          {dataOptions.map((option) => (
            <div key={option.key} className="flex items-start space-x-3">
              <Checkbox
                id={option.key}
                checked={options[option.key]}
                onCheckedChange={(checked) => handleChange(option.key, checked as boolean)}
              />
              <div className="grid gap-1 leading-none">
                <Label
                  htmlFor={option.key}
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  {option.label}
                </Label>
                <p className="text-xs text-muted-foreground">{option.description}</p>
              </div>
            </div>
          ))}
        </div>

        <Separator />

        <div className="space-y-3">
          <p className="text-sm font-medium">Additional Information</p>
          {metadataOptions.map((option) => (
            <div key={option.key} className="flex items-start space-x-3">
              <Checkbox
                id={option.key}
                checked={options[option.key]}
                onCheckedChange={(checked) => handleChange(option.key, checked as boolean)}
              />
              <div className="grid gap-1 leading-none">
                <Label
                  htmlFor={option.key}
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  {option.label}
                </Label>
                <p className="text-xs text-muted-foreground">{option.description}</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

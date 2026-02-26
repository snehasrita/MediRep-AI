"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Pill, Palette, Shapes, Type, Sparkles } from "lucide-react";

interface PillFeature {
  label: string;
  value: string;
  icon: React.ReactNode;
}

interface PillFeatureDisplayProps {
  imprint?: string;
  color?: string;
  shape?: string;
  confidence?: number;
}

export default function PillFeatureDisplay({
  imprint,
  color,
  shape,
  confidence,
}: PillFeatureDisplayProps) {
  const features: PillFeature[] = [
    {
      label: "Imprint",
      value: imprint || "Not visible",
      icon: <Type className="h-4 w-4" />,
    },
    {
      label: "Color",
      value: color || "Unknown",
      icon: <Palette className="h-4 w-4" />,
    },
    {
      label: "Shape",
      value: shape || "Unknown",
      icon: <Shapes className="h-4 w-4" />,
    },
  ];

  return (
    <Card className="p-4 bg-muted/30">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Pill className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Extracted Features</h3>
        </div>
        {confidence !== undefined && (
          <Badge variant="secondary" className="gap-1">
            <Sparkles className="h-3 w-3" />
            {Math.round(confidence * 100)}% OCR
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {features.map((feature) => (
          <div
            key={feature.label}
            className="flex items-start gap-3 p-3 rounded-lg bg-background/50"
          >
            <div className="text-muted-foreground mt-0.5">{feature.icon}</div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground mb-1">{feature.label}</p>
              <p className="font-medium truncate">{feature.value}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

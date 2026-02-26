"use client";

import { useState } from "react";
import Image from "next/image";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { X, ZoomIn, ZoomOut, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface PillImagePreviewProps {
  preview: string;
  onRemove: () => void;
  className?: string;
}

export default function PillImagePreview({
  preview,
  onRemove,
  className,
}: PillImagePreviewProps) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 0.25, 0.5));
  const handleRotate = () => setRotation((prev) => (prev + 90) % 360);

  return (
    <Card className={cn("relative overflow-hidden", className)}>
      {/* Image Container */}
      <div className="relative aspect-video bg-muted/30 flex items-center justify-center overflow-hidden">
        <div
          style={{
            transform: `scale(${zoom}) rotate(${rotation}deg)`,
            transition: "transform 0.3s ease",
          }}
          className="relative w-full h-full"
        >
          <Image
            src={preview}
            alt="Pill preview"
            fill
            className="object-contain"
            priority
          />
        </div>

        {/* Remove Button */}
        <Button
          size="icon"
          variant="destructive"
          className="absolute top-2 right-2 h-8 w-8"
          onClick={onRemove}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Image Controls */}
      <div className="flex items-center justify-center gap-2 p-3 bg-muted/30 border-t">
        <Button
          size="sm"
          variant="ghost"
          onClick={handleZoomOut}
          disabled={zoom <= 0.5}
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <span className="text-xs text-muted-foreground min-w-[3rem] text-center">
          {Math.round(zoom * 100)}%
        </span>
        <Button
          size="sm"
          variant="ghost"
          onClick={handleZoomIn}
          disabled={zoom >= 3}
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
        <div className="w-px h-4 bg-border mx-1" />
        <Button size="sm" variant="ghost" onClick={handleRotate}>
          <RotateCw className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  );
}

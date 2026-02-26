"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Camera, Upload, Loader2, ArrowRight } from "lucide-react";
import { identifyPill } from "@/lib/api";
import Link from "next/link";

interface PillIdentificationResult {
  name: string;
  confidence: number;
  description: string;
  color?: string;
  shape?: string;
  imprint?: string;
}

export default function PillScannerCompact() {
  const [image, setImage] = useState<File | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [result, setResult] = useState<PillIdentificationResult | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && ["image/jpeg", "image/png"].includes(file.type)) {
      setImage(file);
      setResult(null);
      handleScan(file);
    }
  };

  const handleScan = async (file: File) => {
    setIsScanning(true);
    try {
      const response = await identifyPill(file) as PillIdentificationResult;
      setResult(response);
    } catch (error) {
      console.error("Error scanning pill:", error);
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Camera className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Pill Scanner</h3>
        </div>
        <Link href="/dashboard/PillScanner">
          <Button variant="ghost" size="sm">
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </div>

      {!result ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Upload a pill image for instant identification
          </p>
          <input
            id="compact-pill-input"
            type="file"
            accept="image/jpeg,image/png"
            onChange={handleFileSelect}
            className="hidden"
            disabled={isScanning}
          />
          <Button
            onClick={() => document.getElementById("compact-pill-input")?.click()}
            disabled={isScanning}
            className="w-full"
            size="sm"
          >
            {isScanning ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Scanning...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Upload Image
              </>
            )}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">{result.name}</p>
              <p className="text-xs text-muted-foreground">
                {result.imprint || result.color || "Identified"}
              </p>
            </div>
            <Badge
              variant="outline"
              className={
                result.confidence >= 0.8
                  ? "bg-green-500/10 text-green-700 dark:text-green-400"
                  : result.confidence >= 0.6
                  ? "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400"
                  : "bg-orange-500/10 text-orange-700 dark:text-orange-400"
              }
            >
              {Math.round(result.confidence * 100)}%
            </Badge>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => {
                setResult(null);
                setImage(null);
              }}
              variant="outline"
              size="sm"
              className="flex-1"
            >
              Scan Another
            </Button>
            <Link href="/dashboard/PillScanner" className="flex-1">
              <Button size="sm" className="w-full">
                View Details
              </Button>
            </Link>
          </div>
        </div>
      )}
    </Card>
  );
}

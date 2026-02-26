"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertCircle } from "lucide-react";
import { identifyPill } from "@/lib/api";
import PillUploadZone from "./pill-upload-zone";
import PillImagePreview from "./pill-image-preview";
import PillFeatureDisplay from "./pill-feature-display";
import PillResultsPanel from "./pill-results-panel";
import type { DrugInfo } from "@/types";

interface DrugMatch {
  name: string;
  genericName?: string;
  manufacturer?: string;
  price?: string;
  matchScore: number;
  matchReason: string;
  description?: string;
}

interface PillScanMatch {
  name: string;
  generic_name?: string;
  manufacturer?: string;
  price_raw?: string;
  description?: string;
  match_score: number;
  match_reason: string;
}

interface PillScanResponse {
  name: string;
  confidence: number;
  description: string;
  color?: string;
  shape?: string;
  imprint?: string;
  ocr_confidence?: number;
  matches?: PillScanMatch[];
  drug_info?: DrugInfo;
  drug_info_source?: "database" | "llm";
  drug_info_disclaimer?: string;
}

export default function PillScanner() {
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [result, setResult] = useState<PillScanResponse | null>(null);
  const [matches, setMatches] = useState<DrugMatch[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = (file: File) => {
    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      setError("File size must be less than 10MB");
      return;
    }

    // Validate file type
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      setError("Only JPEG and PNG images are supported");
      return;
    }

    setImage(file);
    setPreview(URL.createObjectURL(file));
    setResult(null);
    setMatches([]);
    setError(null);
  };

  const parseMatches = (description: string): DrugMatch[] => {
    const matches: DrugMatch[] = [];
    const lines = description.split("\n");

    let currentMatch: Partial<DrugMatch> | null = null;

    for (const line of lines) {
      const trimmed = line.trim();

      // Match drug name (e.g., "1. **Dolo 650**")
      const nameMatch = trimmed.match(/^\d+\.\s+\*\*(.+?)\*\*/);
      if (nameMatch) {
        if (currentMatch && currentMatch.name) {
          matches.push(currentMatch as DrugMatch);
        }
        currentMatch = {
          name: nameMatch[1],
          matchScore: 0.7,
          matchReason: "Database match",
        };
        continue;
      }

      if (currentMatch) {
        // Extract generic name
        if (trimmed.startsWith("Generic:")) {
          currentMatch.genericName = trimmed.replace("Generic:", "").trim();
        }
        // Extract manufacturer
        else if (trimmed.startsWith("Manufacturer:")) {
          currentMatch.manufacturer = trimmed.replace("Manufacturer:", "").trim();
        }
        // Extract price
        else if (trimmed.startsWith("Price:")) {
          currentMatch.price = trimmed.replace("Price:", "").trim();
        }
        // Extract match score
        else if (trimmed.startsWith("Match:")) {
          const scoreMatch = trimmed.match(/(\d+)%\s*\((.+?)\)/);
          if (scoreMatch) {
            currentMatch.matchScore = parseInt(scoreMatch[1]) / 100;
            currentMatch.matchReason = scoreMatch[2];
          }
        }
      }
    }

    // Add last match
    if (currentMatch && currentMatch.name) {
      matches.push(currentMatch as DrugMatch);
    }

    return matches;
  };

  const handleScan = async () => {
    if (!image) return;

    setIsScanning(true);
    setError(null);

    try {
      const response = await identifyPill(image) as PillScanResponse;
      setResult(response);

      // Prefer structured matches returned by the backend.
      if (Array.isArray(response.matches) && response.matches.length > 0) {
        const best = response.matches[0];
        setMatches([
          {
            name: best.name,
            genericName: best.generic_name,
            manufacturer: best.manufacturer,
            price: best.price_raw,
            matchScore: best.match_score,
            matchReason: best.match_reason,
            description: best.description,
          },
        ]);
      } else {
        // Backwards compatibility for older backend responses.
        const parsed = parseMatches(response.description);
        setMatches(parsed.length > 0 ? [parsed[0]] : []);
      }
      /*
      // If you ever want to show multiple matches again, revert to:
      setMatches(response.matches.map((m) => ({
            name: m.name,
            genericName: m.generic_name,
            manufacturer: m.manufacturer,
            price: m.price_raw,
            matchScore: m.match_score,
            matchReason: m.match_reason,
            description: m.description,
          })));
      */

      // Save to history
      try {
        const historyItem = {
          id: Date.now().toString(),
          timestamp: new Date().toISOString(),
          pillName: response.name,
          confidence: response.confidence,
          imprint: response.imprint,
          color: response.color,
          shape: response.shape,
        };

        const stored = localStorage.getItem("pill-scan-history");
        const history = stored ? JSON.parse(stored) : [];
        history.unshift(historyItem);

        // Keep only last 50 scans
        if (history.length > 50) {
          history.splice(50);
        }

        localStorage.setItem("pill-scan-history", JSON.stringify(history));
      } catch (e) {
        console.error("Failed to save scan history", e);
      }
    } catch (err: any) {
      console.error("Error scanning pill:", err);
      setError(err.message || "Failed to identify pill. Please try again.");
    } finally {
      setIsScanning(false);
    }
  };

  const handleReset = () => {
    setImage(null);
    setPreview(null);
    setResult(null);
    setMatches([]);
    setError(null);
  };

  return (
    <Card className="glass-card p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2">Pill Scanner</h2>
        <p className="text-sm text-muted-foreground">
          Upload a clear image of your pill to identify it using AI-powered visual recognition
        </p>
      </div>

      <div className="space-y-6">
        {/* Upload Zone or Preview */}
        {!preview ? (
          <PillUploadZone onFileSelect={handleFileSelect} disabled={isScanning} />
        ) : (
          <PillImagePreview preview={preview} onRemove={handleReset} />
        )}

        {/* Error Alert */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Scan Button */}
        {preview && !result && (
          <Button
            onClick={handleScan}
            disabled={isScanning}
            className="w-full"
            size="lg"
          >
            {isScanning ? (
              <>
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                Analyzing Image...
              </>
            ) : (
              "Identify Pill"
            )}
          </Button>
        )}

        {/* Loading State */}
        {isScanning && (
          <Card className="p-6 bg-muted/30">
            <div className="flex flex-col items-center gap-4 text-center">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <div>
                <p className="font-semibold mb-1">Analyzing your pill...</p>
                <p className="text-sm text-muted-foreground">
                  Extracting features and searching database
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* Feature Display */}
        {result && (result.imprint || result.color || result.shape) && (
          <PillFeatureDisplay
            imprint={result.imprint}
            color={result.color}
            shape={result.shape}
            confidence={result.ocr_confidence ?? result.confidence}
          />
        )}

        {/* Results Panel */}
        {result && (
          <PillResultsPanel
            matches={matches}
            confidence={result.confidence}
            drugInfo={result.drug_info}
            drugInfoSource={result.drug_info_source}
            drugInfoDisclaimer={result.drug_info_disclaimer}
            imprint={result.imprint}
            onReset={handleReset}
          />
        )}
      </div>
    </Card>
  );
}

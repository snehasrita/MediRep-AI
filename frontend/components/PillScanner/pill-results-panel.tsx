"use client";

import { Card } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RotateCcw } from "lucide-react";
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

interface PillResultsPanelProps {
  matches: DrugMatch[];
  confidence: number;
  drugInfo?: DrugInfo;
  drugInfoSource?: "database" | "llm";
  drugInfoDisclaimer?: string;
  imprint?: string;
  onReset: () => void;
}

export default function PillResultsPanel({
  matches,
  drugInfo,
  drugInfoSource,
  drugInfoDisclaimer,
  imprint,
  onReset,
}: PillResultsPanelProps) {
  const hasMatches = matches.length > 0;
  const bestMatch = matches[0];
  const hasDrugInfo = !!drugInfo;
  const drugName = drugInfo?.name || bestMatch?.name || "";
  const imprintTitle = (imprint || "").trim();
  const displayTitle = imprintTitle ? imprintTitle.toUpperCase() : drugName;
  const shouldRenderDrugCard = Boolean(displayTitle);

  const normalizedTherapeuticClass = (drugInfo?.therapeutic_class || "").trim();
  const normalizedActionClass = (drugInfo?.action_class || "").trim();
  const isMeaninglessClass = (value: string) => {
    const v = value.toLowerCase();
    return !v || ["allopathy", "allopathic", "na", "n/a", "none", "unknown"].includes(v);
  };

  return (
    <div className="space-y-4">
      {/* Status section intentionally hidden (keep results focused). */}
      {!hasMatches && (
        <div className="text-center py-6 text-muted-foreground">
          <p className="font-medium">No matches found in database</p>
          <p className="text-sm mt-1">
            {hasDrugInfo
              ? "Showing best-effort drug information from extracted imprint/features."
              : "Try searching manually on 1mg.com"}
          </p>
        </div>
      )}

      {/* Drug Info (DB-first, LLM fallback) */}
      {shouldRenderDrugCard && (
        <Card className="p-4 border-border/60 bg-background/50">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-muted-foreground mb-1">
                DRUG INFORMATION
              </h3>
              <p className="font-semibold text-lg truncate">{displayTitle}</p>
              {imprintTitle && drugName && imprintTitle.toLowerCase() !== drugName.toLowerCase() && (
                <p className="text-sm text-muted-foreground truncate">
                  Matched: {drugName}
                </p>
              )}
              {drugInfo?.generic_name && (
                <p className="text-sm text-muted-foreground truncate">
                  Generic: {drugInfo.generic_name}
                </p>
              )}
              {(drugInfo?.manufacturer || bestMatch?.manufacturer) && (
                <p className="text-sm text-muted-foreground truncate">
                  Manufacturer: {drugInfo?.manufacturer || bestMatch?.manufacturer}
                </p>
              )}
              {((normalizedTherapeuticClass && !isMeaninglessClass(normalizedTherapeuticClass)) ||
                (normalizedActionClass && !isMeaninglessClass(normalizedActionClass))) && (
                <p className="text-sm text-muted-foreground truncate">
                  {!isMeaninglessClass(normalizedTherapeuticClass)
                    ? `Class: ${normalizedTherapeuticClass}`
                    : ""}
                  {!isMeaninglessClass(normalizedTherapeuticClass) &&
                  !isMeaninglessClass(normalizedActionClass)
                    ? " • "
                    : ""}
                  {!isMeaninglessClass(normalizedActionClass) ? `Action: ${normalizedActionClass}` : ""}
                </p>
              )}
            </div>

            {drugInfoSource && (
              <Badge variant="outline" className="shrink-0">
                {drugInfoSource === "database" ? "Database + AI" : "AI Summary"}
              </Badge>
            )}
          </div>

          {drugInfoDisclaimer && (
            <Alert className="mb-4 border-orange-500/40 bg-orange-500/10">
              <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
              <AlertDescription className="text-sm">
                {drugInfoDisclaimer}
              </AlertDescription>
            </Alert>
          )}

          {!hasDrugInfo && (
            <div className="text-sm text-muted-foreground">
              We couldn’t reliably identify this pill from our database. If you can, verify using
              the original strip/packaging or consult a pharmacist.
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            {drugInfo?.indications && drugInfo.indications.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1">
                  INDICATIONS
                </p>
                <ul className="list-disc list-inside text-sm space-y-1">
                  {drugInfo.indications.slice(0, 4).map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>
            )}

            {drugInfo?.dosage && drugInfo.dosage.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1">
                  DOSAGE (GENERAL)
                </p>
                <ul className="list-disc list-inside text-sm space-y-1">
                  {drugInfo.dosage.slice(0, 3).map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>
            )}

            {drugInfo?.warnings && drugInfo.warnings.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1">
                  WARNINGS
                </p>
                <ul className="list-disc list-inside text-sm space-y-1">
                  {drugInfo.warnings.slice(0, 4).map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>
            )}

            {drugInfo?.contraindications && drugInfo.contraindications.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1">
                  CONTRAINDICATIONS
                </p>
                <ul className="list-disc list-inside text-sm space-y-1">
                  {drugInfo.contraindications.slice(0, 4).map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>
            )}

            {drugInfo?.side_effects && drugInfo.side_effects.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1">
                  COMMON SIDE EFFECTS
                </p>
                <ul className="list-disc list-inside text-sm space-y-1">
                  {drugInfo.side_effects.slice(0, 6).map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>
            )}

            {drugInfo?.interactions && drugInfo.interactions.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1">
                  INTERACTIONS
                </p>
                <ul className="list-disc list-inside text-sm space-y-1">
                  {drugInfo.interactions.slice(0, 5).map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Other Matches */}
      {/* Other possible matches intentionally hidden to avoid confusion. */}

      {/* Safety Warning REMOVED */}

      {/* Action Buttons */}
      <div className="flex gap-2">
        <Button onClick={onReset} variant="outline" className="flex-1">
          <RotateCcw className="h-4 w-4 mr-2" />
          Scan Another Pill
        </Button>
      </div>
    </div>
  );
}

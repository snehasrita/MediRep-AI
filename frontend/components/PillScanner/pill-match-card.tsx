"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pill, Building2, DollarSign, Info, ExternalLink } from "lucide-react";

interface DrugMatch {
  name: string;
  genericName?: string;
  manufacturer?: string;
  price?: string;
  matchScore: number;
  matchReason: string;
  description?: string;
}

interface PillMatchCardProps {
  match: DrugMatch;
  rank: number;
  onViewDetails?: () => void;
}

export default function PillMatchCard({ match, rank, onViewDetails }: PillMatchCardProps) {
  const confidenceColor =
    match.matchScore >= 0.8
      ? "bg-green-500/10 text-green-700 dark:text-green-400"
      : match.matchScore >= 0.6
      ? "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400"
      : "bg-orange-500/10 text-orange-700 dark:text-orange-400";

  return (
    <Card className="p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-start gap-3 flex-1">
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-sm shrink-0">
            {rank}
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-lg mb-1 flex items-center gap-2">
              <Pill className="h-4 w-4 text-primary shrink-0" />
              <span className="truncate">{match.name}</span>
            </h4>
            {match.genericName && (
              <p className="text-sm text-muted-foreground mb-2">
                Generic: {match.genericName}
              </p>
            )}
          </div>
        </div>
        <Badge className={confidenceColor}>
          {Math.round(match.matchScore * 100)}%
        </Badge>
      </div>

      <div className="space-y-2 mb-3">
        {match.manufacturer && (
          <div className="flex items-center gap-2 text-sm">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Manufacturer:</span>
            <span className="font-medium">{match.manufacturer}</span>
          </div>
        )}
        {match.price && (
          <div className="flex items-center gap-2 text-sm">
            <DollarSign className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Price:</span>
            <span className="font-medium">{match.price}</span>
          </div>
        )}
        <div className="flex items-center gap-2 text-sm">
          <Info className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">Match Type:</span>
          <Badge variant="outline" className="text-xs">
            {match.matchReason}
          </Badge>
        </div>
      </div>

      {onViewDetails && (
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={onViewDetails}
        >
          <ExternalLink className="h-3 w-3 mr-2" />
          View Details
        </Button>
      )}
    </Card>
  );
}

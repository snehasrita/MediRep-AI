"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Info } from "lucide-react";

interface PillExample {
  name: string;
  imprint: string;
  color: string;
  shape: string;
  description: string;
}

export default function PillExamples() {
  const examples: PillExample[] = [
    {
      name: "Dolo 650",
      imprint: "DOLO 650",
      color: "White",
      shape: "Oblong",
      description: "Common paracetamol tablet for fever and pain",
    },
    {
      name: "Pan 40",
      imprint: "PAN 40",
      color: "Yellow",
      shape: "Capsule",
      description: "Pantoprazole for acid reflux and GERD",
    },
    {
      name: "Azithral 500",
      imprint: "AZITHRAL 500",
      color: "Pink",
      shape: "Oblong",
      description: "Azithromycin antibiotic",
    },
    {
      name: "Crocin",
      imprint: "CROCIN",
      color: "White",
      shape: "Round",
      description: "Paracetamol for fever and headache",
    },
  ];

  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <Info className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold">Common Indian Pills</h3>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Examples of pills that can be identified by our system
      </p>

      <div className="grid sm:grid-cols-2 gap-4">
        {examples.map((example) => (
          <Card key={example.name} className="p-4 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-2">
              <h4 className="font-semibold">{example.name}</h4>
              <Badge variant="outline" className="text-xs">
                {example.shape}
              </Badge>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Imprint:</span>
                <span className="font-medium">{example.imprint}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Color:</span>
                <span className="font-medium">{example.color}</span>
              </div>
              <p className="text-xs text-muted-foreground pt-2">
                {example.description}
              </p>
            </div>
          </Card>
        ))}
      </div>
    </Card>
  );
}

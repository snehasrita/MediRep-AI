"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Scan, BarChart3, HelpCircle, History } from "lucide-react";
import PillScanner from "./index";
import PillScannerStats from "./pill-scanner-stats";
import PillScannerHelp from "./pill-scanner-help";
import PillExamples from "./pill-examples";
import PillScanHistory from "./pill-scan-history";

export default function PillScannerFull() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Pill Scanner</h1>
        <p className="text-muted-foreground">
          AI-powered pill identification using visual recognition and database matching
        </p>
      </div>

      <Tabs defaultValue="scanner" className="w-full">
        <TabsList className="grid w-full grid-cols-2 lg:w-auto">
          <TabsTrigger value="scanner" className="gap-2">
            <Scan className="h-4 w-4" />
            Scanner
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2">
            <History className="h-4 w-4" />
            History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="scanner" className="mt-6">
          <PillScanner />
        </TabsContent>

        <TabsContent value="history" className="mt-6">
          <PillScanHistory />
        </TabsContent>
      </Tabs>
    </div >
  );
}

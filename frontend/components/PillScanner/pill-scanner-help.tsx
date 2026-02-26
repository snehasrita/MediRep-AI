"use client";

import { Card } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { HelpCircle, Lightbulb, AlertTriangle, Info } from "lucide-react";

export default function PillScannerHelp() {
  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <HelpCircle className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold">How It Works</h3>
      </div>

      <Accordion type="single" collapsible className="w-full">
        <AccordionItem value="how-it-works">
          <AccordionTrigger>
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4" />
              How does pill identification work?
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-3 text-sm">
              <p>Our AI-powered system uses a two-step approach:</p>
              <ol className="list-decimal list-inside space-y-2 ml-2">
                <li>
                  <strong>Feature Extraction:</strong> Gemini Vision AI analyzes your
                  image to extract visual features like imprint text, color, shape, and
                  coating.
                </li>
                <li>
                  <strong>Database Search:</strong> We search our 250K+ Indian drug
                  database using both text matching (for imprints) and vector similarity
                  (for visual features).
                </li>
              </ol>
              <p className="text-muted-foreground">
                The system returns multiple possible matches with confidence scores to
                help you identify your medication.
              </p>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="best-practices">
          <AccordionTrigger>
            <div className="flex items-center gap-2">
              <Lightbulb className="h-4 w-4" />
              Tips for best results
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-2 text-sm">
              <p className="font-medium mb-2">Photo Guidelines:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Use natural daylight or bright white light</li>
                <li>Place pill on a plain white or light-colored surface</li>
                <li>Take photo from directly above (90° angle)</li>
                <li>Ensure imprint text is in focus and readable</li>
                <li>Avoid shadows, glare, and reflections</li>
                <li>Fill the frame with the pill (get close)</li>
              </ul>
              <p className="text-muted-foreground mt-3">
                Clear, well-lit photos with visible imprints give the best results.
              </p>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="safety">
          <AccordionTrigger>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Safety & Limitations
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-3 text-sm">
              <Alert className="border-red-500/50 bg-red-500/10">
                <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
                <AlertDescription>
                  <p className="font-semibold mb-2">Important Safety Information:</p>
                  <ul className="list-disc list-inside space-y-1 text-xs">
                    <li>This tool provides visual matching only - NOT medical advice</li>
                    <li>Many pills look similar but contain different medications</li>
                    <li>Always verify with a licensed pharmacist or doctor</li>
                    <li>Never take medication based solely on visual identification</li>
                    <li>If unsure, consult a healthcare professional immediately</li>
                  </ul>
                </AlertDescription>
              </Alert>
              <p className="text-muted-foreground">
                This tool is designed to assist in pill identification but should never
                replace professional medical advice or verification.
              </p>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="troubleshooting">
          <AccordionTrigger>
            <div className="flex items-center gap-2">
              <HelpCircle className="h-4 w-4" />
              Troubleshooting
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-3 text-sm">
              <div>
                <p className="font-medium mb-1">No matches found?</p>
                <ul className="list-disc list-inside space-y-1 ml-2 text-muted-foreground">
                  <li>Try retaking the photo with better lighting</li>
                  <li>Ensure the imprint is clearly visible</li>
                  <li>Search manually on 1mg.com or pharmeasy.in</li>
                  <li>The pill might not be in our Indian drug database</li>
                </ul>
              </div>
              <div>
                <p className="font-medium mb-1">Low confidence score?</p>
                <ul className="list-disc list-inside space-y-1 ml-2 text-muted-foreground">
                  <li>Review all suggested matches carefully</li>
                  <li>Compare with your pill's physical characteristics</li>
                  <li>Verify with a pharmacist before use</li>
                </ul>
              </div>
              <div>
                <p className="font-medium mb-1">Upload failed?</p>
                <ul className="list-disc list-inside space-y-1 ml-2 text-muted-foreground">
                  <li>Ensure file is JPEG or PNG format</li>
                  <li>Check file size is under 10MB</li>
                  <li>Try compressing the image</li>
                </ul>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </Card>
  );
}

"use client";

import { Button } from "@/components/ui/button";
import { Download, FileText, File } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PatientContext } from "@/types";
import { jsPDF } from "jspdf";

interface PatientExportProps {
  patientContext: PatientContext | null;
}

export function PatientExport({ patientContext }: PatientExportProps) {
  const exportAsText = () => {
    if (!patientContext) return;

    const lines = [
      "PATIENT CONTEXT SUMMARY",
      "=".repeat(50),
      "",
      "Demographics:",
      `  Age: ${patientContext.age} years`,
      `  Sex: ${patientContext.sex}`,
      `  Weight: ${patientContext.weight ? patientContext.weight + " kg" : "N/A"}`,
      "",
      "Pre-Existing Diseases:",
      patientContext.preExistingDiseases.length > 0
        ? patientContext.preExistingDiseases.map((d: string) => `  - ${d}`).join("\n")
        : "  None recorded",
      "",
      "Current Medications:",
      patientContext.currentMeds.length > 0
        ? patientContext.currentMeds.map((m: string) => `  - ${m}`).join("\n")
        : "  None recorded",
      "",
      "=".repeat(50),
      `Exported: ${new Date().toLocaleString()}`,
    ];

    const text = lines.join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `patient-context-${new Date().toISOString().split("T")[0]}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const exportAsPDF = () => {
    if (!patientContext) return;

    const doc = new jsPDF();
    const dateStr = new Date().toLocaleDateString();

    // Title
    doc.setFontSize(18);
    doc.text("Patient Context Summary", 20, 20);

    doc.setFontSize(10);
    doc.text(`Generated on: ${dateStr}`, 20, 28);
    doc.line(20, 32, 190, 32);

    // Demographics
    doc.setFontSize(14);
    doc.text("Demographics", 20, 45);

    doc.setFontSize(12);
    doc.text(`Age: ${patientContext.age} years`, 25, 55);
    doc.text(`Sex: ${patientContext.sex}`, 25, 62);
    doc.text(`Weight: ${patientContext.weight ? patientContext.weight + " kg" : "N/A"}`, 25, 69);

    // Pre-Existing Diseases
    let yPos = 85;
    doc.setFontSize(14);
    doc.text("Pre-Existing Diseases", 20, yPos);
    yPos += 10;
    doc.setFontSize(12);
    if (patientContext.preExistingDiseases.length > 0) {
      patientContext.preExistingDiseases.forEach((d: string) => {
        doc.setTextColor(234, 88, 12); // Orange color for diseases
        doc.text(`• ${d}`, 25, yPos);
        doc.setTextColor(0, 0, 0); // Reset
        yPos += 7;
      });
    } else {
      doc.text("None recorded", 25, yPos);
      yPos += 7;
    }

    // Meds
    yPos += 10;
    doc.setFontSize(14);
    doc.text("Current Medications", 20, yPos);
    yPos += 10;
    doc.setFontSize(12);
    if (patientContext.currentMeds.length > 0) {
      patientContext.currentMeds.forEach((m: string) => {
        doc.text(`• ${m}`, 25, yPos);
        yPos += 7;
      });
    } else {
      doc.text("None recorded", 25, yPos);
      yPos += 7;
    }

    doc.save(`patient-context-${new Date().toISOString().split("T")[0]}.pdf`);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={!patientContext}>
          <Download className="h-4 w-4 mr-2" />
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={exportAsText}>
          <FileText className="h-4 w-4 mr-2" />
          Export as Text
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportAsPDF}>
          <File className="h-4 w-4 mr-2" />
          Export as PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

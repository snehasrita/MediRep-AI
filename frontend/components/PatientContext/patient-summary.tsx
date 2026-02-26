"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { User, Activity, Pill } from "lucide-react";
import { PatientContext } from "@/types";

interface PatientSummaryProps {
  patientContext: PatientContext;
}

export function PatientSummary({ patientContext }: PatientSummaryProps) {
  return (
    <div className="space-y-6">
      {/* Demographics */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 border-blue-200 dark:border-blue-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500 rounded-lg">
              <User className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-sm text-blue-700 dark:text-blue-300 font-medium">Age</p>
              <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">
                {patientContext.age} years
              </p>
            </div>
          </div>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950 dark:to-purple-900 border-purple-200 dark:border-purple-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500 rounded-lg">
              <User className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-sm text-purple-700 dark:text-purple-300 font-medium">Sex</p>
              <p className="text-2xl font-bold text-purple-900 dark:text-purple-100 capitalize">
                {patientContext.sex}
              </p>
            </div>
          </div>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-teal-50 to-teal-100 dark:from-teal-950 dark:to-teal-900 border-teal-200 dark:border-teal-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-teal-500 rounded-lg">
              <Activity className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-sm text-teal-700 dark:text-teal-300 font-medium">Weight</p>
              <p className="text-2xl font-bold text-teal-900 dark:text-teal-100">
                {patientContext.weight ? `${patientContext.weight} kg` : "N/A"}
              </p>
            </div>
          </div>
        </Card>
      </div>

      <Separator />

      {/* Pre-Existing Diseases */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Activity className="h-5 w-5 text-orange-600" />
          <h3 className="font-semibold text-lg">Pre-Existing Diseases</h3>
          <Badge variant="secondary" className="bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300">
            {patientContext.preExistingDiseases.length}
          </Badge>
        </div>
        {patientContext.preExistingDiseases.length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            {patientContext.preExistingDiseases.map((disease, index) => (
              <Card key={index} className="p-3 bg-orange-50 dark:bg-orange-950 border-orange-200 dark:border-orange-800">
                <p className="text-sm font-medium text-orange-900 dark:text-orange-100">
                  {disease}
                </p>
              </Card>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">No pre-existing diseases recorded</p>
        )}
      </div>

      <Separator />

      {/* Current Medications */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Pill className="h-5 w-5 text-green-600" />
          <h3 className="font-semibold text-lg">Current Medications</h3>
          <Badge variant="secondary">{patientContext.currentMeds.length}</Badge>
        </div>
        {patientContext.currentMeds.length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            {patientContext.currentMeds.map((med, index) => (
              <Card key={index} className="p-3 bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800">
                <p className="text-sm font-medium text-green-900 dark:text-green-100">
                  {med}
                </p>
              </Card>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">No current medications</p>
        )}
      </div>
    </div>
  );
}

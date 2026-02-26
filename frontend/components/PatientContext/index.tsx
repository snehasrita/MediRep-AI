"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Save, X, FileText, History, User } from "lucide-react";
import { usePatientContext } from "@/lib/context/PatientContext";
import { PatientContext as PatientContextType } from "@/types";
import { PatientForm } from "./patient-form";
import { PatientSummary } from "./patient-summary";
import { PatientHistory } from "./patient-history";
import { PatientStats } from "./patient-stats";
import { PatientExport } from "./patient-export";

export default function PatientContextComponent() {
  const { patientContext, setPatientContext, isActive } = usePatientContext();
  const [isEditing, setIsEditing] = useState(!isActive);
  const [formData, setFormData] = useState<PatientContextType>(
    patientContext || {
      age: 0,
      sex: "male",
      weight: undefined,
      preExistingDiseases: [],
      currentMeds: [],
    }
  );

  const handleSave = () => {
    setPatientContext(formData);
    setIsEditing(false);
  };

  const handleClear = () => {
    const emptyData: PatientContextType = {
      age: 0,
      sex: "male",
      weight: undefined,
      preExistingDiseases: [],
      currentMeds: [],
    };
    setFormData(emptyData);
    setPatientContext(null);
    setIsEditing(true);
  };

  const handleEdit = () => {
    setIsEditing(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <User className="h-8 w-8" />
            Patient Context
          </h2>
          <p className="text-muted-foreground mt-1">
            Manage patient information for personalized drug recommendations
          </p>
        </div>
        <div className="flex gap-2 items-center">
          {isActive && (
            <Badge variant="default" className="bg-green-600">
              <Check className="h-3 w-3 mr-1" />
              Active
            </Badge>
          )}
          {!isEditing && isActive && (
            <>
              <PatientExport patientContext={patientContext} />
              <Button variant="outline" size="sm" onClick={handleEdit}>
                <FileText className="h-4 w-4 mr-2" />
                Edit
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Stats Overview */}
      {isActive && !isEditing && <PatientStats patientContext={patientContext!} />}

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form or Summary */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>
              {isEditing ? "Patient Information" : "Current Patient Profile"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isEditing ? (
              <div className="space-y-6">
                <PatientForm formData={formData} setFormData={setFormData} />
                <div className="flex gap-2 pt-4 border-t">
                  <Button onClick={handleSave} className="flex-1">
                    <Save className="h-4 w-4 mr-2" />
                    Save & Apply Context
                  </Button>
                  <Button onClick={handleClear} variant="outline">
                    <X className="h-4 w-4 mr-2" />
                    Clear
                  </Button>
                </div>
              </div>
            ) : (
              <PatientSummary patientContext={patientContext!} />
            )}
          </CardContent>
        </Card>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                Recent Contexts
              </CardTitle>
            </CardHeader>
            <CardContent>
              <PatientHistory onLoad={setFormData} />
            </CardContent>
          </Card>

          {/* Information Card */}
          <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
            <CardHeader>
              <CardTitle className="text-blue-900 dark:text-blue-100 text-sm">
                Why Patient Context?
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-blue-800 dark:text-blue-200 space-y-2">
              <p>
                Patient context helps provide personalized drug recommendations by considering:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Age-appropriate dosing</li>
                <li>Drug-disease interactions</li>
                <li>Current medication conflicts</li>
                <li>Pre-existing condition warnings</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

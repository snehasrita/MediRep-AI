"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { PatientContext as PatientContextType } from "@/types";
import { getPatientContext, savePatientContext } from "@/lib/api";
import { useAuth } from "@/lib/context/AuthContext";

interface PatientContextState {
  patientContext: PatientContextType | null;
  setPatientContext: (context: PatientContextType | null) => void;
  isActive: boolean;
}

const PatientContext = createContext<PatientContextState | undefined>(undefined);


export function PatientContextProvider({ children }: { children: ReactNode }) {
  const { user, isPharmacist, isLoading: isLoadingAuth } = useAuth();
  const [patientContext, setPatientContextState] = useState<PatientContextType | null>(null);

  // Load from backend on mount
  useEffect(() => {
    if (isLoadingAuth || !user || isPharmacist) return;

    const loadContext = async () => {
      try {
        const saved = await getPatientContext();
        if (saved) {
          setPatientContextState(saved);
        }
      } catch (error) {
        console.error("Failed to load patient context", error);
      }
    };
    loadContext();
  }, [user, isLoadingAuth, isPharmacist]);

  const setPatientContext = (context: PatientContextType | null) => {
    console.log("PatientContext Provider: Setting context", context);
    setPatientContextState(context);
    // Persist to backend
    if (context) {
      console.log("PatientContext Provider: Saving to API...");
      savePatientContext(context)
        .then(() => console.log("PatientContext Provider: Save success"))
        .catch(e => console.error("Failed to save context", e));
    }
  };

  const isActive = patientContext !== null;

  return (
    <PatientContext.Provider value={{ patientContext, setPatientContext, isActive }}>
      {children}
    </PatientContext.Provider>
  );
}

export function usePatientContext() {
  const context = useContext(PatientContext);
  if (context === undefined) {
    throw new Error("usePatientContext must be used within a PatientContextProvider");
  }
  return context;
}
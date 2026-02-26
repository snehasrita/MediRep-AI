import * as React from "react"
import { cn } from "@/lib/utils"
import { MessageSquare, Sparkles, Shield, Zap, Pill, Stethoscope, Camera, User, FileText, Microscope, ShieldAlert, Banknote } from "lucide-react"
import { useAuth } from "@/lib/context/AuthContext"

export interface ChatEmptyProps {
  onSelectOption?: (option: { title: string; value: string; type: 'prompt' | 'nav' }) => void;
  className?: string
}

export function ChatEmpty({ onSelectOption, className }: ChatEmptyProps) {
  const { isPharmacist, isLoading } = useAuth();

  const patientOptions = [
    {
      icon: Pill,
      title: "Medication Info",
      description: "Get details on dosage & uses",
      value: "Tell me about ",
      type: "prompt" as const
    },
    {
      icon: Shield,
      title: "Check Interactions",
      description: "Verify safety between drugs",
      value: "Check interactions between ",
      type: "prompt" as const
    },
    {
      icon: Stethoscope,
      title: "Ask a Pharmacist",
      description: "Book a consultation with an expert",
      value: "/dashboard/BookPharmacist",
      type: "nav" as const
    },
    {
      icon: Camera,
      title: "Scan Prescription",
      description: "Analyze details from an image",
      value: "Analyze this prescription image",
      type: "prompt" as const
    }
  ];

  const hcpOptions = [
    {
      icon: Microscope,
      title: "Mechanism of Action",
      description: "Pharmacodynamics & pathway analysis",
      value: "Explain the Mechanism of Action for ",
      type: "prompt" as const
    },
    {
      icon: FileText,
      title: "Clinical Studies",
      description: "Efficacy data & trial results",
      value: "Summarize clinical studies for ",
      type: "prompt" as const
    },
    {
      icon: ShieldAlert,
      title: "Safety & Contraindications",
      description: "Black box warnings & adverse effects",
      value: "What are the contraindications for ",
      type: "prompt" as const
    },
    {
      icon: Banknote,
      title: "Insurance Coverage",
      description: "PM-JAY & reimbursement status",
      value: "Check insurance coverage for ",
      type: "prompt" as const
    }
  ];

  const options = isPharmacist ? hcpOptions : patientOptions;

  if (isLoading) return null;

  return (
    <div className={cn("flex flex-col items-center justify-center h-full p-8 animate-in fade-in zoom-in-95 duration-500", className)}>
      <div className="flex flex-col items-center text-center max-w-2xl mx-auto space-y-8">

        {/* Hero Icon */}
        <div className="relative">
          <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full" />
          <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-linear-to-br from-primary/20 to-primary/5 border border-primary/20 shadow-lg shadow-primary/10">
            {isPharmacist ? (
              <Zap className="h-10 w-10 text-primary" />
            ) : (
              <Sparkles className="h-10 w-10 text-primary" />
            )}
          </div>
        </div>

        {/* Title */}
        <div className="space-y-3">
          <h2 className="text-3xl font-bold tracking-tight text-foreground">
            {isPharmacist ? "Digital Medical Representative" : "Welcome to MediRep AI"}
          </h2>
          <p className="text-muted-foreground text-lg max-w-md mx-auto">
            {isPharmacist
              ? "Instant access to scientific data, clinical studies, and product details."
              : "Your intelligent assistant for pharmaceutical insights and patient care."
            }
          </p>
        </div>

        {/* Action Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-3xl mt-8">
          {options.map((option, index) => (
            <button
              key={index}
              onClick={() => onSelectOption?.(option)}
              className="flex flex-col items-start p-5 rounded-2xl bg-card border border-border/50 hover:border-primary/50 hover:bg-muted/50 transition-all duration-200 group text-left shadow-sm hover:shadow-md"
            >
              <div className="p-2.5 rounded-xl bg-primary/10 text-primary mb-3 group-hover:scale-110 transition-transform duration-200">
                <option.icon className="h-6 w-6" />
              </div>
              <h3 className="font-semibold text-foreground mb-1">{option.title}</h3>
              <p className="text-sm text-muted-foreground">{option.description}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

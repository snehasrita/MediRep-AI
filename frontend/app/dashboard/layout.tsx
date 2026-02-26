import { PatientContextProvider } from "@/lib/context/PatientContext";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PatientContextProvider>
      <div className="min-h-screen bg-[color:var(--landing-paper)] text-[color:var(--landing-ink)]">
        {children}
      </div>
    </PatientContextProvider>
  );
}

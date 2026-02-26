import { notFound } from "next/navigation";

import { SidebarDemo } from "@/components/ui/aceternity-sidebar-demo";

export default function SidebarDemoPage() {
  if (process.env.NODE_ENV !== "development") notFound();

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto w-full max-w-6xl">
        <SidebarDemo />
      </div>
    </div>
  );
}


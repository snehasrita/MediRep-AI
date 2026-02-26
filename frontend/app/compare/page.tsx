"use client";

import PriceCompare from "@/components/compare/PriceCompare";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

export default function ComparePage() {
    const router = useRouter();

    return (
        <div className="min-h-screen bg-linear-to-br from-[#fef5f1] to-[#f9dcc4]">
            <div className="container mx-auto p-6">
                <Button
                    variant="ghost"
                    onClick={() => router.push("/dashboard")}
                    className="mb-4 hover:bg-orange-50"
                >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to Dashboard
                </Button>
                <PriceCompare />
            </div>
        </div>
    );
}

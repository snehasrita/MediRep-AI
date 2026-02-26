import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
    return (
        <div className="flex h-screen bg-[color:var(--landing-paper)] overflow-hidden">
            {/* Sidebar Skeleton */}
            <div className="hidden md:flex h-full w-[280px] flex-col border-r border-[color:var(--landing-border)] bg-[color:var(--landing-card-strong)] p-4 gap-4">
                <div className="flex items-center gap-3 mb-4">
                    <Skeleton className="h-10 w-10 rounded-xl" />
                    <div className="space-y-2">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-3 w-16" />
                    </div>
                </div>
                <div className="space-y-3">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                        <Skeleton key={i} className="h-12 w-full rounded-xl" />
                    ))}
                </div>
            </div>

            {/* Main Content Skeleton */}
            <main className="flex-1 overflow-y-auto relative z-10 p-6 md:p-8">
                <div className="max-w-7xl mx-auto space-y-8">
                    <div className="space-y-4">
                        {/* Welcome text */}
                        <Skeleton className="h-10 w-1/3" />
                        <Skeleton className="h-6 w-1/4" />
                    </div>

                    {/* Bento Grid Skeleton */}
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
                        {/* Row 1 */}
                        <Skeleton className="h-[200px] md:col-span-2 rounded-2xl" />
                        <Skeleton className="h-[200px] md:col-span-1 rounded-2xl" />
                        {/* Row 2 */}
                        <Skeleton className="h-[200px] md:col-span-1 rounded-2xl" />
                        <Skeleton className="h-[200px] md:col-span-2 rounded-2xl" />
                        {/* Row 3 */}
                        <Skeleton className="h-[200px] md:col-span-1 rounded-2xl" />
                        <Skeleton className="h-[200px] md:col-span-1 rounded-2xl" />
                        <Skeleton className="h-[200px] md:col-span-1 rounded-2xl" />
                    </div>
                </div>
            </main>
        </div>
    );
}

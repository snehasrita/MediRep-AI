"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    LayoutDashboard,
    ShieldCheck,
    Users,
    Wallet,
    LogOut
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const pathname = usePathname();
    const router = useRouter();

    const handleLogout = async () => {
        const supabase = createClient();
        await supabase.auth.signOut();
        toast.success("Logged out");
        router.push("/auth/login");
    };

    const navItems = [
        {
            href: "/admin",
            label: "Overview",
            icon: LayoutDashboard,
            exact: true
        },
        {
            href: "/admin/verify",
            label: "Verification",
            icon: ShieldCheck
        },
        {
            href: "/admin/users",
            label: "Users",
            icon: Users
        },
        {
            href: "/admin/payouts",
            label: "Payouts",
            icon: Wallet
        }
    ];

    return (
        <div className="min-h-screen bg-[color:var(--landing-paper)] text-[color:var(--landing-ink)] flex">
            {/* Sidebar */}
            <aside className="w-64 border-r border-[color:var(--landing-border)] bg-[color:var(--landing-card-strong)] flex flex-col">
                <div className="p-6 border-b border-[color:var(--landing-border)]">
                    <h1 className="text-xl font-bold bg-gradient-to-r from-[color:var(--landing-clay)] via-[color:var(--landing-bone)] to-[color:var(--landing-moss)] bg-clip-text text-transparent font-[family-name:var(--font-display)]">
                        Admin Stealth
                    </h1>
                    <p className="text-xs text-[color:var(--landing-muted)] mt-1">Authorized Personnel Only</p>
                </div>

                <nav className="flex-1 p-4 space-y-1">
                    {navItems.map((item) => {
                        const isActive = item.exact
                            ? pathname === item.href
                            : pathname.startsWith(item.href);

                        return (
                            <Link key={item.href} href={item.href}>
                                <Button
                                    variant="ghost"
                                    className={cn(
                                        "w-full justify-start gap-3 rounded-xl transition-colors",
                                        isActive
                                            ? "bg-gradient-to-r from-[rgb(var(--landing-clay-rgb)/0.18)] via-[rgb(var(--landing-marigold-rgb)/0.08)] to-[rgb(var(--landing-moss-rgb)/0.16)] text-[color:var(--landing-ink)] border border-[rgb(var(--landing-clay-rgb)/0.22)]"
                                            : "text-[color:var(--landing-muted)] hover:text-[color:var(--landing-ink)] hover:bg-[rgb(var(--landing-dot-rgb)/0.06)]"
                                    )}
                                >
                                    <item.icon className="h-4 w-4" />
                                    {item.label}
                                </Button>
                            </Link>
                        );
                    })}
                </nav>

                <div className="p-4 border-t border-[color:var(--landing-border)]">
                    <Button
                        variant="ghost"
                        className="w-full justify-start gap-3 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/20"
                        onClick={handleLogout}
                    >
                        <LogOut className="h-4 w-4" />
                        Logout
                    </Button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 overflow-auto bg-[color:var(--landing-paper)]">
                <div className="p-8 max-w-7xl mx-auto">
                    {children}
                </div>
            </main>
        </div>
    );
}

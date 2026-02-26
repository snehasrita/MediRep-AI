"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
    Users,
    UserCheck,
    AlertTriangle,
    TrendingUp,
    Calendar,
    DollarSign,
    ArrowUpRight,
    Loader2,
    RefreshCw,
    ShieldCheck,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { adminApi, AdminStats } from "@/lib/admin-api";

export default function AdminDashboard() {
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState<AdminStats | null>(null);
    const [refreshing, setRefreshing] = useState(false);

    const fetchStats = async (showLoading = true) => {
        try {
            if (showLoading) setLoading(true);
            else setRefreshing(true);

            const data = await adminApi.getStats();
            setStats(data);
        } catch (error) {
            console.error(error);
            toast.error("Failed to fetch dashboard stats");
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        fetchStats();
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <Loader2 className="h-8 w-8 animate-spin text-[color:var(--landing-clay)]" />
            </div>
        );
    }

    const statCards = [
        {
            title: "Total Users",
            value: stats?.total_users || 0,
            icon: Users,
            bgColor: "bg-[rgb(var(--landing-clay-rgb)/0.12)]",
            textColor: "text-[color:var(--landing-clay)]",
        },
        {
            title: "Pharmacists",
            value: stats?.total_pharmacists || 0,
            icon: UserCheck,
            bgColor: "bg-[rgb(var(--landing-moss-rgb)/0.12)]",
            textColor: "text-[color:var(--landing-moss)]",
        },
        {
            title: "Pending Verification",
            value: stats?.pending_verifications || 0,
            icon: AlertTriangle,
            bgColor: "bg-[rgb(var(--landing-clay-rgb)/0.12)]",
            textColor: "text-[color:var(--landing-clay)]",
            urgent: (stats?.pending_verifications || 0) > 0,
        },
        {
            title: "Consultations",
            value: stats?.total_consultations || 0,
            icon: Calendar,
            bgColor: "bg-[rgb(var(--landing-moss-rgb)/0.12)]",
            textColor: "text-[color:var(--landing-moss)]",
        },
    ];

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-[color:var(--landing-ink)] font-[family-name:var(--font-display)]">
                        Admin Dashboard
                    </h1>
                    <p className="text-[color:var(--landing-muted)] mt-1">
                        System overview and quick actions
                    </p>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fetchStats(false)}
                    disabled={refreshing}
                    className="border-[color:var(--landing-border-strong)] hover:bg-[rgb(var(--landing-dot-rgb)/0.06)]"
                >
                    <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                    Refresh
                </Button>
            </div>

            {/* Stats Grid */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {statCards.map((stat) => (
                    <Card
                        key={stat.title}
                        className={`bg-[color:var(--landing-card)] border-[color:var(--landing-border)] ${stat.urgent ? 'ring-2 ring-[rgb(var(--landing-clay-rgb)/0.25)]' : ''
                            }`}
                    >
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium text-[color:var(--landing-muted)]">
                                {stat.title}
                            </CardTitle>
                            <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                                <stat.icon className={`h-4 w-4 ${stat.textColor}`} />
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-bold text-[color:var(--landing-ink)]">
                                {stat.value.toLocaleString()}
                            </div>
                            {stat.urgent && (
                                <p className="text-xs text-[color:var(--landing-clay)] mt-2 flex items-center gap-1">
                                    <AlertTriangle className="h-3 w-3" />
                                    Requires attention
                                </p>
                            )}
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Quick Actions */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {/* Pending Verifications Card */}
                <Card className="bg-[color:var(--landing-card)] border-[color:var(--landing-border)] md:col-span-2">
                    <CardHeader>
                        <CardTitle className="text-lg text-[color:var(--landing-ink)] flex items-center gap-2">
                            <ShieldCheck className="h-5 w-5 text-[color:var(--landing-clay)]" />
                            Pharmacist Verifications
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {(stats?.pending_verifications || 0) > 0 ? (
                            <div className="space-y-4">
                                <p className="text-[color:var(--landing-muted)]">
                                    You have{" "}
                                    <span className="text-[color:var(--landing-clay)] font-bold">
                                        {stats?.pending_verifications}
                                    </span>{" "}
                                    pharmacist application{stats?.pending_verifications === 1 ? '' : 's'} waiting for verification.
                                </p>
                                <Link href="/admin/verify">
                                    <Button className="bg-[color:var(--landing-clay)] hover:bg-[rgb(var(--landing-clay-rgb)/0.9)] text-[color:var(--landing-bone)]">
                                        Review Applications
                                        <ArrowUpRight className="ml-2 h-4 w-4" />
                                    </Button>
                                </Link>
                            </div>
                        ) : (
                            <div className="text-center py-6">
                                <div className="w-12 h-12 rounded-full bg-[rgb(var(--landing-moss-rgb)/0.12)] flex items-center justify-center mx-auto mb-3">
                                    <ShieldCheck className="h-6 w-6 text-[color:var(--landing-moss)]" />
                                </div>
                                <p className="text-[color:var(--landing-muted)]">All caught up! No pending verifications.</p>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Revenue Card */}
                <Card className="bg-[color:var(--landing-card)] border-[color:var(--landing-border)]">
                    <CardHeader>
                        <CardTitle className="text-lg text-[color:var(--landing-ink)] flex items-center gap-2">
                            <DollarSign className="h-5 w-5 text-[color:var(--landing-moss)]" />
                            Platform Revenue
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-[color:var(--landing-ink)]">
                            {stats?.total_revenue || 0}
                        </div>
                        <p className="text-xs text-[color:var(--landing-muted)] mt-1">
                            Total platform fees collected
                        </p>
                        <div className="mt-4 pt-4 border-t border-[color:var(--landing-border)]">
                            <Link href="/admin/payouts">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="w-full border-[color:var(--landing-border-strong)] hover:bg-[rgb(var(--landing-dot-rgb)/0.06)]"
                                >
                                    Manage Payouts
                                    <ArrowUpRight className="ml-2 h-3 w-3" />
                                </Button>
                            </Link>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* System Health */}
            <Card className="bg-[color:var(--landing-card)] border-[color:var(--landing-border)]">
                <CardHeader>
                    <CardTitle className="text-lg text-[color:var(--landing-ink)] flex items-center gap-2">
                        <TrendingUp className="h-5 w-5 text-[color:var(--landing-moss)]" />
                        System Health
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-4 md:grid-cols-3">
                        <div className="p-4 rounded-lg bg-[rgb(var(--landing-dot-rgb)/0.04)] border border-[color:var(--landing-border)]">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="w-2 h-2 rounded-full bg-[color:var(--landing-moss)] animate-pulse" />
                                <span className="text-sm text-[color:var(--landing-muted)]">API Status</span>
                            </div>
                            <p className="text-lg font-medium text-[color:var(--landing-moss)]">Operational</p>
                        </div>
                        <div className="p-4 rounded-lg bg-[rgb(var(--landing-dot-rgb)/0.04)] border border-[color:var(--landing-border)]">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="w-2 h-2 rounded-full bg-[color:var(--landing-moss)] animate-pulse" />
                                <span className="text-sm text-[color:var(--landing-muted)]">Database</span>
                            </div>
                            <p className="text-lg font-medium text-[color:var(--landing-moss)]">Connected</p>
                        </div>
                        <div className="p-4 rounded-lg bg-[rgb(var(--landing-dot-rgb)/0.04)] border border-[color:var(--landing-border)]">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="w-2 h-2 rounded-full bg-[color:var(--landing-moss)] animate-pulse" />
                                <span className="text-sm text-[color:var(--landing-muted)]">Payment Gateway</span>
                            </div>
                            <p className="text-lg font-medium text-[color:var(--landing-moss)]">Active</p>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

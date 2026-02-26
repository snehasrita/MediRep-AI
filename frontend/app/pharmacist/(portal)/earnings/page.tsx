"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
    Wallet,
    Loader2,
    RefreshCw,
    CheckCircle2,
    Clock,
    XCircle,
    AlertCircle,
    Calendar,
    IndianRupee,
    TrendingUp,
    Hash,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { pharmacistApi, PayoutSummary, PayoutStats } from "@/lib/pharmacist-api";

const statusConfig = {
    pending: { label: "Pending", icon: Clock, color: "text-yellow-600", bg: "bg-yellow-100 dark:bg-yellow-900/30" },
    processing: { label: "Processing", icon: AlertCircle, color: "text-blue-600", bg: "bg-blue-100 dark:bg-blue-900/30" },
    completed: { label: "Completed", icon: CheckCircle2, color: "text-green-600", bg: "bg-green-100 dark:bg-green-900/30" },
    failed: { label: "Failed", icon: XCircle, color: "text-red-600", bg: "bg-red-100 dark:bg-red-900/30" },
};

export default function EarningsPage() {
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [payouts, setPayouts] = useState<PayoutSummary[]>([]);
    const [stats, setStats] = useState<PayoutStats | null>(null);
    const [statusFilter, setStatusFilter] = useState<string>("all");

    const fetchData = async (showLoading = true) => {
        try {
            if (showLoading) setLoading(true);
            else setRefreshing(true);

            const [payoutsData, statsData, dashboardData] = await Promise.all([
                pharmacistApi.getPayoutHistory(statusFilter === "all" ? undefined : statusFilter),
                pharmacistApi.getPayoutStats(),
                pharmacistApi.getDashboardStats(),
            ]);

            console.log("Payout stats received:", statsData); // Debug log
            console.log("Dashboard stats received:", dashboardData); // Debug log
            setPayouts(payoutsData);
            setStats({
                ...statsData,
                total_earnings: dashboardData.total_earnings, // Add total earnings from dashboard
            });
        } catch (error: any) {
            console.error("Error fetching earnings data:", error);
            toast.error(error.message || "Failed to fetch earnings data");
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [statusFilter]);

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat("en-IN", {
            style: "currency",
            currency: "INR",
            maximumFractionDigits: 0,
        }).format(amount);
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
            year: "numeric",
        });
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <Loader2 className="h-8 w-8 animate-spin text-(--landing-clay)" />
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-(--landing-ink) font-display">
                        Earnings & Payouts
                    </h1>
                    <p className="text-(--landing-muted) mt-1">
                        Track your consultation earnings and payout history
                    </p>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fetchData(false)}
                    disabled={refreshing}
                    className="border-(--landing-border-strong) hover:bg-[rgb(var(--landing-dot-rgb)/0.06)]"
                >
                    <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
                    Refresh
                </Button>
            </div>

            {/* Summary Cards */}
            <div className="grid gap-4 md:grid-cols-3">
                <Card className="bg-(--landing-card) border-(--landing-border)">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-gray-600">
                            Total Earned
                        </CardTitle>
                        <div className="p-2 rounded-lg bg-[rgb(var(--landing-moss-rgb)/0.12)]">
                            <TrendingUp className="h-4 w-4 text-(--landing-moss)" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-green-600">
                            {formatCurrency((stats?.total_earnings ?? 0))}
                        </div>
                        <p className="text-xs text-gray-600 mt-1">
                            Total revenue from all consultations
                        </p>
                    </CardContent>
                </Card>

                <Card className="bg-(--landing-card) border-(--landing-border)">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-gray-600">
                            Pending Payout
                        </CardTitle>
                        <div className="p-2 rounded-lg bg-[rgb(var(--landing-clay-rgb)/0.12)]">
                            <IndianRupee className="h-4 w-4 text-(--landing-clay)" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-orange-600">
                            {formatCurrency((stats?.pending_payout ?? 0))}
                        </div>
                        <p className="text-xs text-gray-600 mt-1">
                            Awaiting next payout cycle
                        </p>
                    </CardContent>
                </Card>

                <Card className="bg-(--landing-card) border-(--landing-border)">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-gray-600">
                            Last Payout
                        </CardTitle>
                        <div className="p-2 rounded-lg bg-[rgb(var(--landing-dot-rgb)/0.12)]">
                            <Wallet className="h-4 w-4 text-(--landing-muted)" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-gray-900">
                            {stats?.last_payout?.amount ? formatCurrency(stats.last_payout.amount) : "---"}
                        </div>
                        <p className="text-xs text-gray-600 mt-1">
                            {stats?.last_payout?.date ? formatDate(stats.last_payout.date) : "No payouts yet"}
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Info Card */}
            <Card className="bg-linear-to-r from-[rgb(var(--landing-moss-rgb)/0.08)] to-[rgb(var(--landing-clay-rgb)/0.08)] border-(--landing-border)">
                <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                        <div className="p-2 rounded-lg bg-[rgb(var(--landing-moss-rgb)/0.12)]">
                            <AlertCircle className="h-5 w-5 text-(--landing-moss)" />
                        </div>
                        <div>
                            <h3 className="font-medium text-(--landing-ink)">Payout Information</h3>
                            <p className="text-sm text-(--landing-muted) mt-1">
                                Payouts are processed weekly. Completed consultations are aggregated and paid out via UPI/Bank transfer.
                                A 20% platform fee is deducted from each consultation. TDS (2%) may be applicable for annual earnings above Rs. 20,000.
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Payout History */}
            <Card className="bg-(--landing-card) border-(--landing-border)">
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle className="text-lg text-(--landing-ink) flex items-center gap-2">
                            <Wallet className="h-5 w-5 text-(--landing-moss)" />
                            Payout History
                        </CardTitle>
                        <CardDescription>
                            Your payment records and transaction history
                        </CardDescription>
                    </div>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="w-[150px] bg-[rgb(var(--landing-dot-rgb)/0.04)] border-(--landing-border)">
                            <SelectValue placeholder="Filter status" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Statuses</SelectItem>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="processing">Processing</SelectItem>
                            <SelectItem value="completed">Completed</SelectItem>
                            <SelectItem value="failed">Failed</SelectItem>
                        </SelectContent>
                    </Select>
                </CardHeader>
                <CardContent>
                    {payouts.length === 0 ? (
                        <div className="text-center py-12 text-(--landing-muted)">
                            <Wallet className="h-12 w-12 mx-auto mb-4 opacity-30" />
                            <p className="font-medium">No payouts yet</p>
                            <p className="text-sm mt-1">Complete consultations to start earning!</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {payouts.map((payout) => {
                                const config = statusConfig[payout.status];
                                const StatusIcon = config.icon;

                                return (
                                    <div
                                        key={payout.id}
                                        className="flex items-center justify-between p-4 rounded-lg bg-[rgb(var(--landing-dot-rgb)/0.04)] border border-(--landing-border)"
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className={`p-2 rounded-lg ${config.bg}`}>
                                                <StatusIcon className={`h-5 w-5 ${config.color}`} />
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <p className="font-medium text-(--landing-ink)">
                                                        Payout #{payout.id.slice(0, 8)}
                                                    </p>
                                                    <Badge variant="outline" className={`text-xs ${config.color}`}>
                                                        {config.label}
                                                    </Badge>
                                                </div>
                                                <div className="flex items-center gap-3 text-sm text-(--landing-muted) mt-1">
                                                    <span className="flex items-center gap-1">
                                                        <Calendar className="h-3 w-3" />
                                                        {formatDate(payout.period_start)} - {formatDate(payout.period_end)}
                                                    </span>
                                                    <span className="flex items-center gap-1">
                                                        <Hash className="h-3 w-3" />
                                                        {payout.consultation_count} consultation{payout.consultation_count !== 1 ? "s" : ""}
                                                    </span>
                                                </div>
                                                {payout.transfer_reference && (
                                                    <p className="text-xs text-(--landing-muted) mt-1">
                                                        UTR: {payout.transfer_reference}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="font-bold text-lg text-(--landing-ink)">
                                                {formatCurrency(payout.net_amount)}
                                            </p>
                                            {payout.tds_deducted > 0 && (
                                                <p className="text-xs text-(--landing-muted)">
                                                    TDS: {formatCurrency(payout.tds_deducted)}
                                                </p>
                                            )}
                                            {payout.processed_at && (
                                                <p className="text-xs text-(--landing-moss) mt-1">
                                                    Paid on {formatDate(payout.processed_at)}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
    Wallet,
    Loader2,
    RefreshCw,
    Plus,
    CheckCircle2,
    Clock,
    XCircle,
    AlertCircle,
    ChevronDown,
    Calendar,
    IndianRupee,
    User,
    Hash,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { adminApi, Payout, PendingEarning } from "@/lib/admin-api";

const statusConfig = {
    pending: { label: "Pending", icon: Clock, color: "text-yellow-600", bg: "bg-yellow-100 dark:bg-yellow-900/30" },
    processing: { label: "Processing", icon: AlertCircle, color: "text-blue-600", bg: "bg-blue-100 dark:bg-blue-900/30" },
    completed: { label: "Completed", icon: CheckCircle2, color: "text-green-600", bg: "bg-green-100 dark:bg-green-900/30" },
    failed: { label: "Failed", icon: XCircle, color: "text-red-600", bg: "bg-red-100 dark:bg-red-900/30" },
};

export default function PayoutsPage() {
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [payouts, setPayouts] = useState<Payout[]>([]);
    const [pendingEarnings, setPendingEarnings] = useState<PendingEarning[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [statusFilter, setStatusFilter] = useState<string>("all");

    // Create payout dialog
    const [createDialogOpen, setCreateDialogOpen] = useState(false);
    const [creating, setCreating] = useState(false);
    const [selectedPharmacist, setSelectedPharmacist] = useState<PendingEarning | null>(null);
    const [newPayout, setNewPayout] = useState({
        period_start: "",
        period_end: "",
        payout_method: "manual_upi" as "razorpay_payout" | "manual_upi" | "manual_bank",
        notes: "",
    });

    // Update payout dialog
    const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
    const [updating, setUpdating] = useState(false);
    const [selectedPayout, setSelectedPayout] = useState<Payout | null>(null);
    const [updateData, setUpdateData] = useState({
        status: "" as "processing" | "completed" | "failed",
        transfer_reference: "",
        notes: "",
    });

    const fetchData = async (showLoading = true) => {
        try {
            if (showLoading) setLoading(true);
            else setRefreshing(true);

            const [payoutsRes, earningsRes] = await Promise.all([
                adminApi.listPayouts({ status: statusFilter === "all" ? undefined : statusFilter }),
                adminApi.getPendingEarnings(),
            ]);

            setPayouts(payoutsRes.payouts);
            setTotalCount(payoutsRes.count);
            setPendingEarnings(earningsRes.pending_earnings);
        } catch (error) {
            console.error(error);
            toast.error("Failed to fetch payout data");
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [statusFilter]);

    const handleCreatePayout = async () => {
        if (!selectedPharmacist) return;

        try {
            setCreating(true);
            await adminApi.createPayout({
                pharmacist_id: selectedPharmacist.pharmacist_id,
                period_start: newPayout.period_start,
                period_end: newPayout.period_end,
                payout_method: newPayout.payout_method,
                notes: newPayout.notes || undefined,
            });
            toast.success("Payout created successfully");
            setCreateDialogOpen(false);
            setSelectedPharmacist(null);
            setNewPayout({ period_start: "", period_end: "", payout_method: "manual_upi", notes: "" });
            fetchData(false);
        } catch (error: any) {
            toast.error(error.message || "Failed to create payout");
        } finally {
            setCreating(false);
        }
    };

    const handleUpdatePayout = async () => {
        if (!selectedPayout || !updateData.status) return;

        try {
            setUpdating(true);
            await adminApi.updatePayout(selectedPayout.id, {
                status: updateData.status,
                transfer_reference: updateData.transfer_reference || undefined,
                notes: updateData.notes || undefined,
            });
            toast.success("Payout updated successfully");
            setUpdateDialogOpen(false);
            setSelectedPayout(null);
            setUpdateData({ status: "" as any, transfer_reference: "", notes: "" });
            fetchData(false);
        } catch (error: any) {
            toast.error(error.message || "Failed to update payout");
        } finally {
            setUpdating(false);
        }
    };

    const openUpdateDialog = (payout: Payout) => {
        setSelectedPayout(payout);
        setUpdateData({
            status: "" as any,
            transfer_reference: payout.transfer_reference || "",
            notes: payout.notes || "",
        });
        setUpdateDialogOpen(true);
    };

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
                <Loader2 className="h-8 w-8 animate-spin text-[color:var(--landing-clay)]" />
            </div>
        );
    }

    const totalPending = pendingEarnings.reduce((sum, e) => sum + e.pending_amount, 0);

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-[color:var(--landing-ink)] font-[family-name:var(--font-display)]">
                        Payout Management
                    </h1>
                    <p className="text-[color:var(--landing-muted)] mt-1">
                        Process pharmacist payouts and track earnings
                    </p>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fetchData(false)}
                    disabled={refreshing}
                    className="border-[color:var(--landing-border-strong)] hover:bg-[rgb(var(--landing-dot-rgb)/0.06)]"
                >
                    <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
                    Refresh
                </Button>
            </div>

            {/* Summary Cards */}
            <div className="grid gap-4 md:grid-cols-3">
                <Card className="bg-[color:var(--landing-card)] border-[color:var(--landing-border)]">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-[color:var(--landing-muted)]">
                            Total Pending Earnings
                        </CardTitle>
                        <div className="p-2 rounded-lg bg-[rgb(var(--landing-clay-rgb)/0.12)]">
                            <IndianRupee className="h-4 w-4 text-[color:var(--landing-clay)]" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-[color:var(--landing-ink)]">
                            {formatCurrency(totalPending)}
                        </div>
                        <p className="text-xs text-[color:var(--landing-muted)] mt-1">
                            Across {pendingEarnings.length} pharmacist{pendingEarnings.length !== 1 ? "s" : ""}
                        </p>
                    </CardContent>
                </Card>

                <Card className="bg-[color:var(--landing-card)] border-[color:var(--landing-border)]">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-[color:var(--landing-muted)]">
                            Payouts This Month
                        </CardTitle>
                        <div className="p-2 rounded-lg bg-[rgb(var(--landing-moss-rgb)/0.12)]">
                            <Wallet className="h-4 w-4 text-[color:var(--landing-moss)]" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-[color:var(--landing-ink)]">
                            {payouts.filter(p => p.status === "completed").length}
                        </div>
                        <p className="text-xs text-[color:var(--landing-muted)] mt-1">
                            Completed payouts
                        </p>
                    </CardContent>
                </Card>

                <Card className="bg-[color:var(--landing-card)] border-[color:var(--landing-border)]">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-[color:var(--landing-muted)]">
                            Processing
                        </CardTitle>
                        <div className="p-2 rounded-lg bg-[rgb(var(--landing-clay-rgb)/0.12)]">
                            <Clock className="h-4 w-4 text-[color:var(--landing-clay)]" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-[color:var(--landing-ink)]">
                            {payouts.filter(p => p.status === "pending" || p.status === "processing").length}
                        </div>
                        <p className="text-xs text-[color:var(--landing-muted)] mt-1">
                            Awaiting completion
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Pending Earnings Section */}
            {pendingEarnings.length > 0 && (
                <Card className="bg-[color:var(--landing-card)] border-[color:var(--landing-border)]">
                    <CardHeader>
                        <CardTitle className="text-lg text-[color:var(--landing-ink)] flex items-center gap-2">
                            <AlertCircle className="h-5 w-5 text-[color:var(--landing-clay)]" />
                            Pending Earnings (Unpaid)
                        </CardTitle>
                        <CardDescription>
                            Pharmacists with consultations pending payout
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            {pendingEarnings.map((earning) => (
                                <div
                                    key={earning.pharmacist_id}
                                    className="flex items-center justify-between p-4 rounded-lg bg-[rgb(var(--landing-dot-rgb)/0.04)] border border-[color:var(--landing-border)]"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="h-10 w-10 rounded-full bg-[rgb(var(--landing-clay-rgb)/0.12)] flex items-center justify-center text-sm font-bold text-[color:var(--landing-clay)]">
                                            {earning.pharmacist_name.charAt(0)}
                                        </div>
                                        <div>
                                            <p className="font-medium text-[color:var(--landing-ink)]">{earning.pharmacist_name}</p>
                                            <p className="text-sm text-[color:var(--landing-muted)]">
                                                {earning.consultation_count} consultation{earning.consultation_count !== 1 ? "s" : ""}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="text-right">
                                            <p className="font-bold text-[color:var(--landing-ink)]">
                                                {formatCurrency(earning.pending_amount)}
                                            </p>
                                            <p className="text-xs text-[color:var(--landing-muted)]">pending</p>
                                        </div>
                                        <Dialog open={createDialogOpen && selectedPharmacist?.pharmacist_id === earning.pharmacist_id} onOpenChange={(open) => {
                                            setCreateDialogOpen(open);
                                            if (!open) setSelectedPharmacist(null);
                                        }}>
                                            <DialogTrigger asChild>
                                                <Button
                                                    size="sm"
                                                    className="bg-[color:var(--landing-clay)] hover:bg-[rgb(var(--landing-clay-rgb)/0.9)] text-[color:var(--landing-bone)]"
                                                    onClick={() => setSelectedPharmacist(earning)}
                                                >
                                                    <Plus className="h-4 w-4 mr-1" />
                                                    Create Payout
                                                </Button>
                                            </DialogTrigger>
                                            <DialogContent className="bg-[color:var(--landing-card-strong)] border-[color:var(--landing-border)] text-[color:var(--landing-ink)]">
                                                <DialogHeader>
                                                    <DialogTitle>Create Payout</DialogTitle>
                                                    <DialogDescription>
                                                        Create a payout for {earning.pharmacist_name}
                                                    </DialogDescription>
                                                </DialogHeader>
                                                <div className="space-y-4 py-4">
                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div className="space-y-2">
                                                            <Label>Period Start</Label>
                                                            <Input
                                                                type="date"
                                                                value={newPayout.period_start}
                                                                onChange={(e) => setNewPayout({ ...newPayout, period_start: e.target.value })}
                                                                className="bg-[rgb(var(--landing-dot-rgb)/0.04)] border-[color:var(--landing-border)]"
                                                            />
                                                        </div>
                                                        <div className="space-y-2">
                                                            <Label>Period End</Label>
                                                            <Input
                                                                type="date"
                                                                value={newPayout.period_end}
                                                                onChange={(e) => setNewPayout({ ...newPayout, period_end: e.target.value })}
                                                                className="bg-[rgb(var(--landing-dot-rgb)/0.04)] border-[color:var(--landing-border)]"
                                                            />
                                                        </div>
                                                    </div>
                                                    <div className="space-y-2">
                                                        <Label>Payout Method</Label>
                                                        <Select
                                                            value={newPayout.payout_method}
                                                            onValueChange={(value: any) => setNewPayout({ ...newPayout, payout_method: value })}
                                                        >
                                                            <SelectTrigger className="bg-[rgb(var(--landing-dot-rgb)/0.04)] border-[color:var(--landing-border)]">
                                                                <SelectValue />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="manual_upi">Manual UPI</SelectItem>
                                                                <SelectItem value="manual_bank">Manual Bank Transfer</SelectItem>
                                                                <SelectItem value="razorpay_payout">Razorpay Payout</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                    <div className="space-y-2">
                                                        <Label>Notes (Optional)</Label>
                                                        <Textarea
                                                            value={newPayout.notes}
                                                            onChange={(e) => setNewPayout({ ...newPayout, notes: e.target.value })}
                                                            placeholder="Any notes about this payout..."
                                                            className="bg-[rgb(var(--landing-dot-rgb)/0.04)] border-[color:var(--landing-border)]"
                                                        />
                                                    </div>
                                                    <div className="p-3 rounded-lg bg-[rgb(var(--landing-moss-rgb)/0.08)] border border-[rgb(var(--landing-moss-rgb)/0.2)]">
                                                        <p className="text-sm text-[color:var(--landing-muted)]">
                                                            Amount to pay: <span className="font-bold text-[color:var(--landing-moss)]">{formatCurrency(earning.pending_amount)}</span>
                                                        </p>
                                                    </div>
                                                </div>
                                                <DialogFooter>
                                                    <Button variant="ghost" onClick={() => setCreateDialogOpen(false)}>
                                                        Cancel
                                                    </Button>
                                                    <Button
                                                        onClick={handleCreatePayout}
                                                        disabled={creating || !newPayout.period_start || !newPayout.period_end}
                                                        className="bg-[color:var(--landing-clay)] hover:bg-[rgb(var(--landing-clay-rgb)/0.9)] text-[color:var(--landing-bone)]"
                                                    >
                                                        {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Payout"}
                                                    </Button>
                                                </DialogFooter>
                                            </DialogContent>
                                        </Dialog>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Payouts List */}
            <Card className="bg-[color:var(--landing-card)] border-[color:var(--landing-border)]">
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle className="text-lg text-[color:var(--landing-ink)] flex items-center gap-2">
                            <Wallet className="h-5 w-5 text-[color:var(--landing-moss)]" />
                            Payout History
                        </CardTitle>
                        <CardDescription>
                            {totalCount} total payout{totalCount !== 1 ? "s" : ""}
                        </CardDescription>
                    </div>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="w-[150px] bg-[rgb(var(--landing-dot-rgb)/0.04)] border-[color:var(--landing-border)]">
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
                        <div className="text-center py-12 text-[color:var(--landing-muted)]">
                            <Wallet className="h-12 w-12 mx-auto mb-4 opacity-30" />
                            <p>No payouts found</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {payouts.map((payout) => {
                                const config = statusConfig[payout.status];
                                const StatusIcon = config.icon;

                                return (
                                    <div
                                        key={payout.id}
                                        className="flex items-center justify-between p-4 rounded-lg bg-[rgb(var(--landing-dot-rgb)/0.04)] border border-[color:var(--landing-border)]"
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className={`p-2 rounded-lg ${config.bg}`}>
                                                <StatusIcon className={`h-5 w-5 ${config.color}`} />
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <p className="font-medium text-[color:var(--landing-ink)]">
                                                        {payout.pharmacist?.full_name || "Unknown Pharmacist"}
                                                    </p>
                                                    <Badge variant="outline" className={`text-xs ${config.color}`}>
                                                        {config.label}
                                                    </Badge>
                                                </div>
                                                <div className="flex items-center gap-3 text-sm text-[color:var(--landing-muted)] mt-1">
                                                    <span className="flex items-center gap-1">
                                                        <Calendar className="h-3 w-3" />
                                                        {formatDate(payout.period_start)} - {formatDate(payout.period_end)}
                                                    </span>
                                                    <span className="flex items-center gap-1">
                                                        <Hash className="h-3 w-3" />
                                                        {payout.consultation_count} consultations
                                                    </span>
                                                </div>
                                                {payout.transfer_reference && (
                                                    <p className="text-xs text-[color:var(--landing-muted)] mt-1">
                                                        Ref: {payout.transfer_reference}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <div className="text-right">
                                                <p className="font-bold text-[color:var(--landing-ink)]">
                                                    {formatCurrency(payout.net_amount)}
                                                </p>
                                                {payout.tds_deducted > 0 && (
                                                    <p className="text-xs text-[color:var(--landing-muted)]">
                                                        TDS: {formatCurrency(payout.tds_deducted)}
                                                    </p>
                                                )}
                                            </div>
                                            {(payout.status === "pending" || payout.status === "processing") && (
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="outline" size="sm" className="border-[color:var(--landing-border)]">
                                                            Update
                                                            <ChevronDown className="h-4 w-4 ml-1" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuItem onClick={() => openUpdateDialog(payout)}>
                                                            Update Status
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Update Payout Dialog */}
            <Dialog open={updateDialogOpen} onOpenChange={setUpdateDialogOpen}>
                <DialogContent className="bg-[color:var(--landing-card-strong)] border-[color:var(--landing-border)] text-[color:var(--landing-ink)]">
                    <DialogHeader>
                        <DialogTitle>Update Payout Status</DialogTitle>
                        <DialogDescription>
                            Update the status for {selectedPayout?.pharmacist?.full_name}&apos;s payout
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>New Status</Label>
                            <Select
                                value={updateData.status}
                                onValueChange={(value: any) => setUpdateData({ ...updateData, status: value })}
                            >
                                <SelectTrigger className="bg-[rgb(var(--landing-dot-rgb)/0.04)] border-[color:var(--landing-border)]">
                                    <SelectValue placeholder="Select status" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="processing">Processing</SelectItem>
                                    <SelectItem value="completed">Completed</SelectItem>
                                    <SelectItem value="failed">Failed</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Transfer Reference (UTR/Transaction ID)</Label>
                            <Input
                                value={updateData.transfer_reference}
                                onChange={(e) => setUpdateData({ ...updateData, transfer_reference: e.target.value })}
                                placeholder="e.g., UTR123456789"
                                className="bg-[rgb(var(--landing-dot-rgb)/0.04)] border-[color:var(--landing-border)]"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Notes (Optional)</Label>
                            <Textarea
                                value={updateData.notes}
                                onChange={(e) => setUpdateData({ ...updateData, notes: e.target.value })}
                                placeholder="Any notes about this update..."
                                className="bg-[rgb(var(--landing-dot-rgb)/0.04)] border-[color:var(--landing-border)]"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setUpdateDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleUpdatePayout}
                            disabled={updating || !updateData.status}
                            className="bg-[color:var(--landing-moss)] hover:bg-[rgb(var(--landing-moss-rgb)/0.9)] text-[color:var(--landing-bone)]"
                        >
                            {updating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Update Payout"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

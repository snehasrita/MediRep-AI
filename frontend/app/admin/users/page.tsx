"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
    Users,
    Loader2,
    RefreshCw,
    Search,
    UserCheck,
    UserX,
    Shield,
    Mail,
    Calendar,
    MoreVertical,
    Ban,
    CheckCircle2,
    MessageSquare,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Avatar,
    AvatarFallback,
    AvatarImage,
} from "@/components/ui/avatar";
import { adminApi, AdminUser } from "@/lib/admin-api";

export default function UsersPage() {
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [searchQuery, setSearchQuery] = useState("");
    const [searchTimeout, setSearchTimeout] = useState<NodeJS.Timeout | null>(null);

    // Suspend dialog
    const [suspendDialogOpen, setSuspendDialogOpen] = useState(false);
    const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
    const [suspendNotes, setSuspendNotes] = useState("");
    const [processing, setProcessing] = useState(false);

    // User details dialog
    const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
    const [userDetails, setUserDetails] = useState<AdminUser | null>(null);
    const [loadingDetails, setLoadingDetails] = useState(false);

    const fetchUsers = async (search?: string, showLoading = true) => {
        try {
            if (showLoading) setLoading(true);
            else setRefreshing(true);

            const res = await adminApi.listUsers({
                search: search || undefined,
                limit: 50,
            });

            setUsers(res.users);
            setTotalCount(res.total);
        } catch (error) {
            console.error(error);
            toast.error("Failed to fetch users");
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    const handleSearch = (query: string) => {
        setSearchQuery(query);

        // Debounce search
        if (searchTimeout) {
            clearTimeout(searchTimeout);
        }

        const timeout = setTimeout(() => {
            fetchUsers(query, false);
        }, 300);

        setSearchTimeout(timeout);
    };

    const handleSuspendToggle = async () => {
        if (!selectedUser) return;

        try {
            setProcessing(true);
            const newSuspendState = !selectedUser.is_suspended;

            await adminApi.updateUser(selectedUser.id, {
                is_suspended: newSuspendState,
                notes: suspendNotes || undefined,
            });

            toast.success(newSuspendState ? "User suspended" : "User unsuspended");
            setSuspendDialogOpen(false);
            setSelectedUser(null);
            setSuspendNotes("");
            fetchUsers(searchQuery, false);
        } catch (error: any) {
            toast.error(error.message || "Failed to update user");
        } finally {
            setProcessing(false);
        }
    };

    const openSuspendDialog = (user: AdminUser) => {
        setSelectedUser(user);
        setSuspendNotes("");
        setSuspendDialogOpen(true);
    };

    const openDetailsDialog = async (user: AdminUser) => {
        setSelectedUser(user);
        setDetailsDialogOpen(true);
        setLoadingDetails(true);

        try {
            const res = await adminApi.getUserDetails(user.id);
            setUserDetails(res.user);
        } catch (error) {
            toast.error("Failed to load user details");
        } finally {
            setLoadingDetails(false);
        }
    };

    const formatDate = (dateStr?: string) => {
        if (!dateStr) return "Never";
        return new Date(dateStr).toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    };

    const getInitials = (name?: string, email?: string) => {
        if (name) {
            return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
        }
        if (email) {
            return email[0].toUpperCase();
        }
        return "?";
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <Loader2 className="h-8 w-8 animate-spin text-[color:var(--landing-clay)]" />
            </div>
        );
    }

    const activeUsers = users.filter(u => !u.is_suspended).length;
    const suspendedUsers = users.filter(u => u.is_suspended).length;
    const pharmacistUsers = users.filter(u => u.is_pharmacist).length;

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-[color:var(--landing-ink)] font-[family-name:var(--font-display)]">
                        User Management
                    </h1>
                    <p className="text-[color:var(--landing-muted)] mt-1">
                        View and manage platform users
                    </p>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fetchUsers(searchQuery, false)}
                    disabled={refreshing}
                    className="border-[color:var(--landing-border-strong)] hover:bg-[rgb(var(--landing-dot-rgb)/0.06)]"
                >
                    <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
                    Refresh
                </Button>
            </div>

            {/* Summary Cards */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card className="bg-[color:var(--landing-card)] border-[color:var(--landing-border)]">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-[color:var(--landing-muted)]">
                            Total Users
                        </CardTitle>
                        <div className="p-2 rounded-lg bg-[rgb(var(--landing-clay-rgb)/0.12)]">
                            <Users className="h-4 w-4 text-[color:var(--landing-clay)]" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-[color:var(--landing-ink)]">
                            {totalCount}
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-[color:var(--landing-card)] border-[color:var(--landing-border)]">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-[color:var(--landing-muted)]">
                            Active
                        </CardTitle>
                        <div className="p-2 rounded-lg bg-[rgb(var(--landing-moss-rgb)/0.12)]">
                            <UserCheck className="h-4 w-4 text-[color:var(--landing-moss)]" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-[color:var(--landing-moss)]">
                            {activeUsers}
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-[color:var(--landing-card)] border-[color:var(--landing-border)]">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-[color:var(--landing-muted)]">
                            Suspended
                        </CardTitle>
                        <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30">
                            <UserX className="h-4 w-4 text-red-600" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-red-600">
                            {suspendedUsers}
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-[color:var(--landing-card)] border-[color:var(--landing-border)]">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-[color:var(--landing-muted)]">
                            Pharmacists
                        </CardTitle>
                        <div className="p-2 rounded-lg bg-[rgb(var(--landing-clay-rgb)/0.12)]">
                            <Shield className="h-4 w-4 text-[color:var(--landing-clay)]" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-[color:var(--landing-ink)]">
                            {pharmacistUsers}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Search and Users List */}
            <Card className="bg-[color:var(--landing-card)] border-[color:var(--landing-border)]">
                <CardHeader>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                            <CardTitle className="text-lg text-[color:var(--landing-ink)] flex items-center gap-2">
                                <Users className="h-5 w-5 text-[color:var(--landing-moss)]" />
                                All Users
                            </CardTitle>
                            <CardDescription>
                                Showing {users.length} of {totalCount} users
                            </CardDescription>
                        </div>
                        <div className="relative w-full sm:w-72">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[color:var(--landing-muted)]" />
                            <Input
                                placeholder="Search by name or email..."
                                value={searchQuery}
                                onChange={(e) => handleSearch(e.target.value)}
                                className="pl-9 bg-[rgb(var(--landing-dot-rgb)/0.04)] border-[color:var(--landing-border)]"
                            />
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {users.length === 0 ? (
                        <div className="text-center py-12 text-[color:var(--landing-muted)]">
                            <Users className="h-12 w-12 mx-auto mb-4 opacity-30" />
                            <p>No users found</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {users.map((user) => (
                                <div
                                    key={user.id}
                                    className={`flex items-center justify-between p-4 rounded-lg border transition-colors ${
                                        user.is_suspended
                                            ? "bg-red-50/50 dark:bg-red-950/20 border-red-200 dark:border-red-900/50"
                                            : "bg-[rgb(var(--landing-dot-rgb)/0.04)] border-[color:var(--landing-border)] hover:bg-[rgb(var(--landing-dot-rgb)/0.06)]"
                                    }`}
                                >
                                    <div className="flex items-center gap-4">
                                        <Avatar className="h-10 w-10">
                                            <AvatarImage src={user.avatar_url} />
                                            <AvatarFallback className="bg-[rgb(var(--landing-clay-rgb)/0.12)] text-[color:var(--landing-clay)]">
                                                {getInitials(user.display_name, user.email)}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <p className="font-medium text-[color:var(--landing-ink)]">
                                                    {user.display_name || "Unnamed User"}
                                                </p>
                                                {user.is_suspended && (
                                                    <Badge variant="destructive" className="text-xs">
                                                        Suspended
                                                    </Badge>
                                                )}
                                                {user.is_pharmacist && (
                                                    <Badge variant="outline" className="text-xs border-[color:var(--landing-moss)] text-[color:var(--landing-moss)]">
                                                        Pharmacist
                                                    </Badge>
                                                )}
                                                {user.role === "admin" && (
                                                    <Badge className="text-xs bg-[color:var(--landing-clay)]">
                                                        Admin
                                                    </Badge>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-3 text-sm text-[color:var(--landing-muted)] mt-1">
                                                {user.email && (
                                                    <span className="flex items-center gap-1">
                                                        <Mail className="h-3 w-3" />
                                                        {user.email}
                                                    </span>
                                                )}
                                                <span className="flex items-center gap-1">
                                                    <Calendar className="h-3 w-3" />
                                                    Joined {formatDate(user.created_at)}
                                                </span>
                                            </div>
                                            {user.consultation_count !== undefined && user.consultation_count > 0 && (
                                                <p className="text-xs text-[color:var(--landing-muted)] mt-1 flex items-center gap-1">
                                                    <MessageSquare className="h-3 w-3" />
                                                    {user.consultation_count} consultation{user.consultation_count !== 1 ? "s" : ""}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon" className="text-[color:var(--landing-muted)]">
                                                <MoreVertical className="h-4 w-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem onClick={() => openDetailsDialog(user)}>
                                                View Details
                                            </DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            {user.role !== "admin" && (
                                                <DropdownMenuItem
                                                    onClick={() => openSuspendDialog(user)}
                                                    className={user.is_suspended ? "text-green-600" : "text-red-600"}
                                                >
                                                    {user.is_suspended ? (
                                                        <>
                                                            <CheckCircle2 className="h-4 w-4 mr-2" />
                                                            Unsuspend User
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Ban className="h-4 w-4 mr-2" />
                                                            Suspend User
                                                        </>
                                                    )}
                                                </DropdownMenuItem>
                                            )}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Suspend/Unsuspend Dialog */}
            <Dialog open={suspendDialogOpen} onOpenChange={setSuspendDialogOpen}>
                <DialogContent className="bg-[color:var(--landing-card-strong)] border-[color:var(--landing-border)] text-[color:var(--landing-ink)]">
                    <DialogHeader>
                        <DialogTitle>
                            {selectedUser?.is_suspended ? "Unsuspend User" : "Suspend User"}
                        </DialogTitle>
                        <DialogDescription>
                            {selectedUser?.is_suspended
                                ? `Are you sure you want to restore access for ${selectedUser?.display_name || selectedUser?.email}?`
                                : `Are you sure you want to suspend ${selectedUser?.display_name || selectedUser?.email}? They will not be able to access the platform.`
                            }
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Notes (Optional)</Label>
                            <Textarea
                                value={suspendNotes}
                                onChange={(e) => setSuspendNotes(e.target.value)}
                                placeholder={selectedUser?.is_suspended ? "Reason for unsuspending..." : "Reason for suspension..."}
                                className="bg-[rgb(var(--landing-dot-rgb)/0.04)] border-[color:var(--landing-border)]"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setSuspendDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSuspendToggle}
                            disabled={processing}
                            variant={selectedUser?.is_suspended ? "default" : "destructive"}
                            className={selectedUser?.is_suspended ? "bg-[color:var(--landing-moss)] hover:bg-[rgb(var(--landing-moss-rgb)/0.9)]" : ""}
                        >
                            {processing ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : selectedUser?.is_suspended ? (
                                "Unsuspend"
                            ) : (
                                "Suspend"
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* User Details Dialog */}
            <Dialog open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
                <DialogContent className="bg-[color:var(--landing-card-strong)] border-[color:var(--landing-border)] text-[color:var(--landing-ink)] max-w-md">
                    <DialogHeader>
                        <DialogTitle>User Details</DialogTitle>
                    </DialogHeader>
                    {loadingDetails ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-8 w-8 animate-spin text-[color:var(--landing-clay)]" />
                        </div>
                    ) : userDetails ? (
                        <div className="space-y-4">
                            <div className="flex items-center gap-4">
                                <Avatar className="h-16 w-16">
                                    <AvatarImage src={userDetails.avatar_url} />
                                    <AvatarFallback className="bg-[rgb(var(--landing-clay-rgb)/0.12)] text-[color:var(--landing-clay)] text-xl">
                                        {getInitials(userDetails.display_name, userDetails.email)}
                                    </AvatarFallback>
                                </Avatar>
                                <div>
                                    <p className="font-semibold text-lg">{userDetails.display_name || "Unnamed User"}</p>
                                    <p className="text-sm text-[color:var(--landing-muted)]">{userDetails.email}</p>
                                    <div className="flex gap-2 mt-2">
                                        {userDetails.is_suspended && (
                                            <Badge variant="destructive">Suspended</Badge>
                                        )}
                                        {userDetails.is_pharmacist && (
                                            <Badge variant="outline" className="border-[color:var(--landing-moss)] text-[color:var(--landing-moss)]">
                                                Pharmacist ({userDetails.pharmacist_status})
                                            </Badge>
                                        )}
                                        {userDetails.role === "admin" && (
                                            <Badge className="bg-[color:var(--landing-clay)]">Admin</Badge>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-[color:var(--landing-border)]">
                                <div>
                                    <p className="text-xs text-[color:var(--landing-muted)] uppercase tracking-wider">User ID</p>
                                    <p className="text-sm font-mono break-all">{userDetails.id}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-[color:var(--landing-muted)] uppercase tracking-wider">Role</p>
                                    <p className="text-sm capitalize">{userDetails.role || "User"}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-[color:var(--landing-muted)] uppercase tracking-wider">Joined</p>
                                    <p className="text-sm">{formatDate(userDetails.created_at)}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-[color:var(--landing-muted)] uppercase tracking-wider">Last Sign In</p>
                                    <p className="text-sm">{formatDate(userDetails.last_sign_in)}</p>
                                </div>
                                {userDetails.consultation_count !== undefined && (
                                    <div className="col-span-2">
                                        <p className="text-xs text-[color:var(--landing-muted)] uppercase tracking-wider">Consultations</p>
                                        <p className="text-sm">{userDetails.consultation_count}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <p className="text-center text-[color:var(--landing-muted)] py-4">Failed to load user details</p>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Save, User, Shield, Stethoscope, IndianRupee, Clock, Languages, GraduationCap, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { createClient } from "@/lib/supabase/client";

export default function PharmacistProfilePage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [session, setSession] = useState<any>(null);

    const [formData, setFormData] = useState({
        full_name: "",
        bio: "",
        specializations: "",
        languages: "",
        education: "",
        rate: 299,
        duration_minutes: 15,
        upi_id: ""
    });

    useEffect(() => {
        const loadProfile = async () => {
            const supabase = createClient();
            const { data: { session } } = await supabase.auth.getSession();

            if (!session) {
                router.push("/auth/login");
                return;
            }
            setSession(session);

            try {
                const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/pharmacist/profile`, {
                    headers: { "Authorization": `Bearer ${session.access_token}` }
                });

                if (res.ok) {
                    const data = await res.json();
                    setFormData({
                        ...data,
                        specializations: Array.isArray(data.specializations) ? data.specializations.join(", ") : data.specializations || "",
                        languages: Array.isArray(data.languages) ? data.languages.join(", ") : data.languages || "",
                    });
                }
            } catch (error) {
                console.error("Failed to load profile", error);
            } finally {
                setLoading(false);
            }
        };

        loadProfile();
    }, [router]);

    const handleSave = async () => {
        setSaving(true);
        try {
            // Remove full_name since it's not editable
            const updateData = {
                bio: formData.bio || null,
                specializations: formData.specializations.split(",").map(s => s.trim()).filter(Boolean),
                languages: formData.languages.split(",").map(s => s.trim()).filter(Boolean),
                education: formData.education || null,
                rate: Number(formData.rate),
                duration_minutes: Number(formData.duration_minutes),
                upi_id: formData.upi_id || null
            };

            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/pharmacist/profile`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${session.access_token}`
                },
                body: JSON.stringify(updateData)
            });

            if (!res.ok) {
                const error = await res.json().catch(() => ({ detail: "Failed to update profile" }));
                throw new Error(error.detail || "Failed to update profile");
            }

            const updatedProfile = await res.json();
            // Update local state with server response
            setFormData({
                ...updatedProfile,
                specializations: Array.isArray(updatedProfile.specializations) ? updatedProfile.specializations.join(", ") : "",
                languages: Array.isArray(updatedProfile.languages) ? updatedProfile.languages.join(", ") : "",
            });

            toast.success("Profile updated successfully!");
        } catch (error: any) {
            console.error("Profile update error:", error);
            toast.error(error.message || "Failed to update profile");
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex h-[50vh] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-3xl">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Edit Profile</h1>
                <p className="text-muted-foreground mt-1">Update your public profile and consultation settings.</p>
            </div>

            {/* Profile Header Card */}
            <Card className="bg-card border-border">
                <CardContent className="pt-6">
                    <div className="flex items-center gap-6">
                        <Avatar className="h-20 w-20 border-4 border-[rgb(var(--landing-moss-rgb)/0.22)]">
                            <AvatarFallback className="bg-[color:var(--landing-clay)] text-white text-2xl font-bold">
                                {formData.full_name?.slice(0, 2).toUpperCase() || "PH"}
                            </AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                            <h2 className="text-xl font-semibold">{formData.full_name || "Pharmacist"}</h2>
                            <p className="text-muted-foreground text-sm mt-1">Licensed Pharmacist</p>
                            <div className="flex items-center gap-4 mt-3">
                                <span className="text-xs bg-[rgb(var(--landing-moss-rgb)/0.12)] text-[color:var(--landing-moss)] px-2 py-1 rounded-full flex items-center gap-1">
                                    <IndianRupee className="h-3 w-3" /> {formData.rate} / session
                                </span>
                                <span className="text-xs bg-[rgb(var(--landing-clay-rgb)/0.12)] text-[color:var(--landing-clay)] px-2 py-1 rounded-full flex items-center gap-1">
                                    <Clock className="h-3 w-3" /> {formData.duration_minutes} mins
                                </span>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Professional Details */}
            <Card className="bg-card border-border">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <User className="h-5 w-5" /> Professional Details
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-2">
                        <Label>Full Name</Label>
                        <Input value={formData.full_name} disabled className="bg-muted" />
                        <p className="text-xs text-muted-foreground">Contact admin to change name</p>
                    </div>

                    <div className="space-y-2">
                        <Label>Short Bio</Label>
                        <Textarea
                            value={formData.bio}
                            onChange={e => setFormData({ ...formData, bio: e.target.value })}
                            placeholder="Tell patients about your expertise and experience..."
                            rows={4}
                            className="bg-background border-border"
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label className="flex items-center gap-2">
                                <Stethoscope className="h-4 w-4" /> Specializations
                            </Label>
                            <Input
                                value={formData.specializations}
                                onChange={e => setFormData({ ...formData, specializations: e.target.value })}
                                placeholder="e.g. Cardiology, Diabetes"
                                className="bg-background border-border"
                            />
                            <p className="text-xs text-muted-foreground">Comma separated</p>
                        </div>
                        <div className="space-y-2">
                            <Label className="flex items-center gap-2">
                                <Languages className="h-4 w-4" /> Languages
                            </Label>
                            <Input
                                value={formData.languages}
                                onChange={e => setFormData({ ...formData, languages: e.target.value })}
                                placeholder="e.g. English, Hindi"
                                className="bg-background border-border"
                            />
                            <p className="text-xs text-muted-foreground">Comma separated</p>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                            <GraduationCap className="h-4 w-4" /> Education
                        </Label>
                        <Input
                            value={formData.education}
                            onChange={e => setFormData({ ...formData, education: e.target.value })}
                            placeholder="e.g. B.Pharm from XYZ University"
                            className="bg-background border-border"
                        />
                    </div>
                </CardContent>
            </Card>

            {/* Consultation Settings */}
            <Card className="bg-card border-border">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Stethoscope className="h-5 w-5" /> Consultation Settings
                    </CardTitle>
                    <CardDescription>Set your consultation rate and duration</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <Label className="flex items-center gap-2">
                                <IndianRupee className="h-4 w-4" /> Rate (INR)
                            </Label>
                            <Input
                                type="number"
                                value={formData.rate}
                                onChange={e => setFormData({ ...formData, rate: Number(e.target.value) })}
                                className="bg-background border-border"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="flex items-center gap-2">
                                <Clock className="h-4 w-4" /> Session Duration
                            </Label>
                            <Select
                                value={String(formData.duration_minutes)}
                                onValueChange={val => setFormData({ ...formData, duration_minutes: Number(val) })}
                            >
                                <SelectTrigger className="bg-background border-border">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="15">15 Minutes</SelectItem>
                                    <SelectItem value="30">30 Minutes</SelectItem>
                                    <SelectItem value="45">45 Minutes</SelectItem>
                                    <SelectItem value="60">60 Minutes</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Payment Settings */}
            <Card className="bg-card border-border">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <CreditCard className="h-5 w-5" /> Payment Settings
                    </CardTitle>
                    <CardDescription>Configure your payout details</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-2">
                        <Label>UPI ID (For Payouts)</Label>
                        <Input
                            value={formData.upi_id}
                            onChange={e => setFormData({ ...formData, upi_id: e.target.value })}
                            placeholder="username@upi"
                            className="bg-background border-border"
                        />
                        <p className="text-xs text-muted-foreground">Your earnings will be transferred to this UPI ID</p>
                    </div>
                </CardContent>
                <CardFooter className="flex justify-end border-t border-border pt-6">
                    <Button
                        onClick={handleSave}
                        disabled={saving}
                        className="min-w-[140px] bg-[color:var(--landing-moss)] hover:bg-[rgb(var(--landing-moss-rgb)/0.9)] text-[color:var(--landing-bone)]"
                    >
                        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        Save Changes
                    </Button>
                </CardFooter>
            </Card>
        </div>
    );
}

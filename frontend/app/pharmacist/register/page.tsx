"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { toast } from "sonner";
import { FileText, Loader2, Shield, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Stepper, { Step } from "@/components/ui/stepper";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ModeToggle } from "@/components/mode-toggle";
import { createClient } from "@/lib/supabase/client";

// Steps
const STEPS = ["Basic Info", "Professional", "License", "Review"];

export default function PharmacistRegistrationPage() {
    const router = useRouter();
    const [step, setStep] = useState(1);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [session, setSession] = useState<any>(null);

    // Check authentication on mount
    useEffect(() => {
        const checkAuth = async () => {
            const supabase = createClient();
            const { data: { session } } = await supabase.auth.getSession();

            if (!session) {
                toast.info("Please create an account first");
                router.push("/pharmacist/auth/signup?redirect=/pharmacist/register");
                return;
            }

            // Check if already a registered pharmacist
            const { data: pharmacistProfile } = await supabase
                .from("pharmacist_profiles")
                .select("id")
                .eq("user_id", session.user.id)
                .maybeSingle();

            if (pharmacistProfile) {
                // Already registered, go to dashboard
                toast.success("You're already registered as a pharmacist!");
                router.push("/pharmacist/dashboard");
                return;
            }

            setSession(session);
            setIsLoading(false);
        };
        checkAuth();
    }, [router]);

    // Form State
    const [formData, setFormData] = useState({
        full_name: "",
        phone: "",
        bio: "",
        specializations: "", // comma separated string for input
        experience_years: 0,
        languages: "English, Hindi",
        education: "",
        license_number: "",
        license_state: "",
        license_image_url: "",
        rate: 299,
        duration_minutes: 15,
        upi_id: ""
    });

    const [licenseFile, setLicenseFile] = useState<File | null>(null);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        const numericFields = new Set(["experience_years", "rate"]);
        setFormData(prev => ({
            ...prev,
            [name]: numericFields.has(name) ? (value === "" ? 0 : Number(value)) : value
        }));
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];

            // Validate file size (5MB max)
            if (file.size > 5 * 1024 * 1024) {
                toast.error("File too large. Maximum size is 5MB");
                return;
            }

            // Validate file type
            if (!['image/jpeg', 'image/png', 'application/pdf'].includes(file.type)) {
                toast.error("Invalid file type. Only JPG, PNG, and PDF are allowed");
                return;
            }

            setLicenseFile(file);

            // Create a local preview URL (no upload yet - will upload during registration)
            if (formData.license_image_url.startsWith("blob:")) {
                URL.revokeObjectURL(formData.license_image_url);
            }
            const previewUrl = URL.createObjectURL(file);
            setFormData(prev => ({ ...prev, license_image_url: previewUrl }));
            toast.success("License selected. It will be uploaded during registration.");
        }
    };

    useEffect(() => {
        return () => {
            if (formData.license_image_url.startsWith("blob:")) {
                URL.revokeObjectURL(formData.license_image_url);
            }
        };
    }, [formData.license_image_url]);

    const canProceed = useMemo(() => {
        const nameOk = Boolean(formData.full_name.trim());
        const phoneOk = Boolean(formData.phone.trim());
        const bioOk = Boolean(formData.bio.trim());
        const specsOk = Boolean(formData.specializations.trim());
        const upiOk = Boolean(formData.upi_id.trim());
        const licNumOk = Boolean(formData.license_number.trim());
        const licStateOk = Boolean(formData.license_state.trim());
        const licFileOk = Boolean(licenseFile);

        if (step === 1) return nameOk && phoneOk && bioOk;
        if (step === 2) return specsOk && upiOk;
        if (step === 3) return licNumOk && licStateOk && licFileOk;
        // Review step: require everything critical.
        return nameOk && phoneOk && bioOk && specsOk && upiOk && licNumOk && licStateOk && licFileOk;
    }, [formData, licenseFile, step]);

    const handleSubmit = async (): Promise<boolean> => {
        if (!session) {
            toast.error("Please login first");
            router.push("/pharmacist/auth/login?redirect=/pharmacist/register");
            return false;
        }

        try {
            setIsSubmitting(true);

            // Build FormData to send file + data to backend
            const formDataToSend = new FormData();

            // Add license file if exists
            if (licenseFile) {
                formDataToSend.append('license_file', licenseFile);
            } else {
                toast.error("Please attach your license document.");
                return false;
            }

            // Prepare registration data
            const registrationData = {
                ...formData,
                license_image_url: "", // Backend will set this after upload
                specializations: formData.specializations.split(',').map(s => s.trim()).filter(Boolean),
                languages: formData.languages.split(',').map(s => s.trim()).filter(Boolean),
                experience_years: Number(formData.experience_years),
                rate: Number(formData.rate),
                duration_minutes: Number(formData.duration_minutes)
            };

            formDataToSend.append('data', JSON.stringify(registrationData));

            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'https://medirep-ai-production.up.railway.app'}/api/pharmacist/register`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: formDataToSend
            });

            if (!res.ok) {
                const error = await res.json();
                throw new Error(error.detail || "Registration failed");
            }

            toast.success("Registration submitted successfully! Your profile is pending verification.");
            router.push("/pharmacist/dashboard");
            return true;
        } catch (error: any) {
            console.error(error);
            toast.error(error.message);
            return false;
        } finally {
            setIsSubmitting(false);
        }
    };

    // Show loading while checking auth
    if (isLoading) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <div className="text-center">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto text-emerald-500" />
                    <p className="mt-4 text-muted-foreground">Checking authentication...</p>
                </div>
            </div>
        );
    }

    const clearLicense = () => {
        if (formData.license_image_url.startsWith("blob:")) {
            URL.revokeObjectURL(formData.license_image_url);
        }
        setFormData((prev) => ({ ...prev, license_image_url: "" }));
        setLicenseFile(null);
    };

    return (
        <div className="relative min-h-screen bg-background px-4 py-10">
            <div className="absolute right-4 top-4">
                <ModeToggle />
            </div>

            <div className="mx-auto w-full max-w-4xl">
                <div className="text-center">
                    <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
                        <span className="bg-clip-text text-transparent bg-gradient-to-r from-emerald-500 via-amber-400 to-orange-500">
                            Join MediRep Marketplace
                        </span>
                    </h1>
                    <p className="mt-2 text-muted-foreground">
                        Register as a pharmacist. Get verified. Start earning from paid consultations.
                    </p>
                </div>

                <div className="mt-10">
                    <Stepper
                        initialStep={1}
                        onStepChange={setStep}
                        disableStepIndicators
                        backButtonText="Previous"
                        nextButtonText="Next"
                        completeButtonText={isSubmitting ? "Submitting..." : "Submit application"}
                        backButtonProps={{ disabled: isSubmitting }}
                        nextButtonProps={{ disabled: isSubmitting || !canProceed }}
                        onFinalStepCompleted={handleSubmit}
                    >
                        <Step>
                            <div className="space-y-6">
                                <div>
                                    <h2 className="text-lg font-semibold">{STEPS[0]}</h2>
                                    <p className="mt-1 text-sm text-muted-foreground">
                                        These details show up on your public marketplace profile.
                                    </p>
                                </div>

                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label>Full name</Label>
                                        <Input
                                            name="full_name"
                                            value={formData.full_name}
                                            onChange={handleInputChange}
                                            placeholder="Dr. John Doe"
                                            autoComplete="name"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Phone number</Label>
                                        <Input
                                            name="phone"
                                            value={formData.phone}
                                            onChange={handleInputChange}
                                            placeholder="+91 98765 43210"
                                            autoComplete="tel"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label>Professional bio</Label>
                                    <Textarea
                                        name="bio"
                                        value={formData.bio}
                                        onChange={handleInputChange}
                                        placeholder="Your background, typical cases you help with, and what patients can expect..."
                                        className="min-h-[110px]"
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        Tip: write for patients. Keep it short, confident, and specific.
                                    </p>
                                </div>

                                <div className="space-y-2">
                                    <Label>Fluent languages (comma separated)</Label>
                                    <Input
                                        name="languages"
                                        value={formData.languages}
                                        onChange={handleInputChange}
                                        placeholder="English, Hindi"
                                    />
                                </div>
                            </div>
                        </Step>

                        <Step>
                            <div className="space-y-6">
                                <div>
                                    <h2 className="text-lg font-semibold">{STEPS[1]}</h2>
                                    <p className="mt-1 text-sm text-muted-foreground">
                                        Set what you’re good at and how the consultation will be priced.
                                    </p>
                                </div>

                                <div className="space-y-2">
                                    <Label>Specializations (comma separated)</Label>
                                    <Input
                                        name="specializations"
                                        value={formData.specializations}
                                        onChange={handleInputChange}
                                        placeholder="General Medicine, Diabetes Care, Drug Interactions"
                                    />
                                </div>

                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label>Years of experience</Label>
                                        <Input
                                            type="number"
                                            min={0}
                                            name="experience_years"
                                            value={String(formData.experience_years)}
                                            onChange={handleInputChange}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Education / degree</Label>
                                        <Input
                                            name="education"
                                            value={formData.education}
                                            onChange={handleInputChange}
                                            placeholder="B.Pharm, M.Pharm"
                                        />
                                    </div>
                                </div>

                                <div className="rounded-2xl border bg-muted/30 p-4">
                                    <div className="text-sm font-semibold">Consultation settings</div>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        This controls the default pricing shown to patients.
                                    </p>

                                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                                        <div className="space-y-2">
                                            <Label>Rate (INR)</Label>
                                            <Input
                                                type="number"
                                                min={0}
                                                name="rate"
                                                value={String(formData.rate)}
                                                onChange={handleInputChange}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Duration</Label>
                                            <Select
                                                value={String(formData.duration_minutes)}
                                                onValueChange={(val) =>
                                                    setFormData((prev) => ({
                                                        ...prev,
                                                        duration_minutes: Number(val),
                                                    }))
                                                }
                                            >
                                                <SelectTrigger>
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="15">15 minutes</SelectItem>
                                                    <SelectItem value="30">30 minutes</SelectItem>
                                                    <SelectItem value="45">45 minutes</SelectItem>
                                                    <SelectItem value="60">60 minutes</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>

                                    <div className="mt-4 space-y-2">
                                        <Label>UPI ID (payouts)</Label>
                                        <Input
                                            name="upi_id"
                                            value={formData.upi_id}
                                            onChange={handleInputChange}
                                            placeholder="name@upi"
                                        />
                                    </div>
                                </div>
                            </div>
                        </Step>

                        <Step>
                            <div className="space-y-6">
                                <div>
                                    <h2 className="text-lg font-semibold">{STEPS[2]}</h2>
                                    <p className="mt-1 text-sm text-muted-foreground">
                                        Verification is what makes the marketplace trustworthy.
                                    </p>
                                </div>

                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label>License number</Label>
                                        <Input
                                            name="license_number"
                                            value={formData.license_number}
                                            onChange={handleInputChange}
                                            placeholder="e.g. PH1234567"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Issuing state</Label>
                                        <Input
                                            name="license_state"
                                            value={formData.license_state}
                                            onChange={handleInputChange}
                                            placeholder="e.g. Maharashtra"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label>Upload license certificate</Label>
                                    <div className="relative rounded-2xl border-2 border-dashed bg-muted/30 p-6 transition-colors hover:bg-muted/40">
                                        {formData.license_image_url ? (
                                            <div className="relative h-48 w-full overflow-hidden rounded-xl bg-background">
                                                {licenseFile?.type === "application/pdf" ? (
                                                    <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
                                                        <FileText className="h-14 w-14" />
                                                        <div className="text-sm font-medium">
                                                            {licenseFile.name}
                                                        </div>
                                                    </div>
                                                ) : formData.license_image_url.startsWith("blob:") ? (
                                                    <img
                                                        src={formData.license_image_url}
                                                        alt="License preview"
                                                        className="h-full w-full object-contain"
                                                    />
                                                ) : (
                                                    <Image
                                                        src={formData.license_image_url}
                                                        alt="License"
                                                        fill
                                                        sizes="(max-width: 768px) 100vw, 720px"
                                                        className="object-contain"
                                                    />
                                                )}

                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    className="absolute right-2 top-2 bg-background/80 backdrop-blur"
                                                    onClick={clearLicense}
                                                >
                                                    Change
                                                </Button>
                                            </div>
                                        ) : (
                                            <div className="flex flex-col items-center justify-center py-10 text-center">
                                                <Upload className="h-8 w-8 text-muted-foreground" />
                                                <p className="mt-3 text-sm text-muted-foreground">
                                                    Drag & drop or click to upload
                                                    <br />
                                                    JPG / PNG / PDF up to 5MB
                                                </p>
                                                <input
                                                    type="file"
                                                    accept="image/jpeg,image/png,application/pdf"
                                                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                                                    onChange={handleFileChange}
                                                    disabled={isSubmitting}
                                                />
                                            </div>
                                        )}
                                    </div>

                                    <p className="mt-2 text-xs text-muted-foreground">
                                        <Shield className="inline h-3.5 w-3.5 -mt-0.5 mr-1" />
                                        License data is visible only to verification admins.
                                    </p>
                                </div>
                            </div>
                        </Step>

                        <Step>
                            <div className="space-y-6">
                                <div>
                                    <h2 className="text-lg font-semibold">{STEPS[3]}</h2>
                                    <p className="mt-1 text-sm text-muted-foreground">
                                        Confirm everything looks right — then submit for admin verification.
                                    </p>
                                </div>

                                <div className="rounded-2xl border bg-muted/20 p-4 text-sm">
                                    <div className="flex items-center justify-between py-2">
                                        <span className="text-muted-foreground">Name</span>
                                        <span className="font-medium">{formData.full_name || "—"}</span>
                                    </div>
                                    <div className="flex items-center justify-between py-2">
                                        <span className="text-muted-foreground">Phone</span>
                                        <span className="font-medium">{formData.phone || "—"}</span>
                                    </div>
                                    <div className="flex items-center justify-between py-2">
                                        <span className="text-muted-foreground">License</span>
                                        <span className="font-medium">
                                            {formData.license_number ? `${formData.license_number} (${formData.license_state || "—"})` : "—"}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between py-2">
                                        <span className="text-muted-foreground">Rate</span>
                                        <span className="font-medium">
                                            ₹{formData.rate} / {formData.duration_minutes} min
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between py-2">
                                        <span className="text-muted-foreground">Specializations</span>
                                        <span className="font-medium">{formData.specializations || "—"}</span>
                                    </div>
                                    <div className="flex items-center justify-between py-2">
                                        <span className="text-muted-foreground">License document</span>
                                        <span className={licenseFile ? "text-emerald-600 font-medium" : "text-destructive font-medium"}>
                                            {licenseFile ? "Attached" : "Missing"}
                                        </span>
                                    </div>
                                </div>

                                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-800 dark:text-amber-200">
                                    By submitting, you agree to the{" "}
                                    <Link href="/terms" className="underline underline-offset-4">
                                        Terms of Service
                                    </Link>
                                    . Your profile stays hidden until verified.
                                </div>

                                <div className="rounded-2xl border bg-muted/20 p-4 text-xs text-muted-foreground">
                                    Brutal honesty: verification + availability is the whole marketplace. Without it, it becomes spam.
                                </div>
                            </div>
                        </Step>
                    </Stepper>
                </div>

                <p className="mt-8 text-center text-xs text-muted-foreground">
                    Prototype build. We review profiles manually — production would require stronger KYC & fraud controls.
                </p>
            </div>
        </div>
    );
}

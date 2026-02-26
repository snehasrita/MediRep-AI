"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Search, Filter, Star, Clock, User, Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { marketplaceApi, PharmacistPreview } from "@/lib/marketplace-api";

export default function MarketplacePage() {
    const [pharmacists, setPharmacists] = useState<PharmacistPreview[]>([]);
    const [loading, setLoading] = useState(true);

    // Filter States
    const [specialization, setSpecialization] = useState<string>("");
    const [language, setLanguage] = useState<string>("");

    // Options
    const [specializationOptions, setSpecializationOptions] = useState<string[]>([]);
    const [languageOptions, setLanguageOptions] = useState<string[]>([]);

    useEffect(() => {
        async function loadOptions() {
            const [specRes, langRes] = await Promise.all([
                marketplaceApi.getSpecializations(),
                marketplaceApi.getLanguages()
            ]);
            setSpecializationOptions(specRes.specializations);
            setLanguageOptions(langRes.languages);
        }
        loadOptions();
    }, []);

    useEffect(() => {
        async function search() {
            try {
                setLoading(true);
                const results = await marketplaceApi.searchPharmacists({
                    specialization: specialization === "all" ? undefined : specialization,
                    language: language === "all" ? undefined : language,
                    available_only: false // Show all approved
                });
                setPharmacists(results);
            } catch (error) {
                console.error(error);
                toast.error("Failed to load pharmacists");
            } finally {
                setLoading(false);
            }
        }

        // Debounce or just trigger on change? For simplicity, trigger on specific change or mount
        search();
    }, [specialization, language]);

    return (
        <div className="min-h-screen bg-slate-950 text-slate-200">
            {/* Search Header */}
            <div className="bg-slate-900 border-b border-slate-800 py-12">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                    <h1 className="text-4xl font-extrabold tracking-tight text-white mb-4">
                        Find a Trusted Pharmacist
                    </h1>
                    <p className="text-lg text-slate-400 max-w-2xl mx-auto">
                        Connect with verified licensed pharmacists for expert advice on medications, interactions, and side effects.
                    </p>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col lg:flex-row gap-8">

                {/* Filters Sidebar */}
                <aside className="w-full lg:w-64 space-y-6">
                    <div className="bg-slate-900 p-4 rounded-lg border border-slate-800 space-y-4">
                        <div className="flex items-center gap-2 font-medium text-slate-200">
                            <Filter className="h-4 w-4" /> Filters
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs text-slate-500 font-medium uppercase">Specialization</label>
                            <Select value={specialization} onValueChange={setSpecialization}>
                                <SelectTrigger className="bg-slate-950 border-slate-800">
                                    <SelectValue placeholder="All Specializations" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Specializations</SelectItem>
                                    {specializationOptions.map(s => (
                                        <SelectItem key={s} value={s}>{s}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs text-slate-500 font-medium uppercase">Language</label>
                            <Select value={language} onValueChange={setLanguage}>
                                <SelectTrigger className="bg-slate-950 border-slate-800">
                                    <SelectValue placeholder="All Languages" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Languages</SelectItem>
                                    {languageOptions.map(l => (
                                        <SelectItem key={l} value={l}>{l}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </aside>

                {/* Results Grid */}
                <div className="flex-1">
                    {loading ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {[1, 2, 3].map(i => (
                                <div key={i} className="h-64 bg-slate-900 rounded-lg animate-pulse" />
                            ))}
                        </div>
                    ) : pharmacists.length === 0 ? (
                        <div className="text-center py-20 text-slate-500">
                            <User className="h-12 w-12 mx-auto mb-4 opacity-50" />
                            <p>No pharmacists found matching your criteria.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {pharmacists.map((pharmacist) => (
                                <Card key={pharmacist.id} className="bg-slate-900 border-slate-800 overflow-hidden hover:border-slate-700 transition-all hover:shadow-lg hover:shadow-indigo-900/10">
                                    <CardHeader className="pb-3">
                                        <div className="flex justify-between items-start">
                                            <div className="flex gap-4">
                                                <Avatar className="h-12 w-12 border-2 border-slate-800">
                                                    <AvatarImage src={pharmacist.profile_image_url} />
                                                    <AvatarFallback>{pharmacist.full_name.slice(0, 2).toUpperCase()}</AvatarFallback>
                                                </Avatar>
                                                <div>
                                                    <CardTitle className="text-lg text-slate-200">{pharmacist.full_name}</CardTitle>
                                                    <div className="flex items-center gap-1 text-amber-400 text-sm mt-1">
                                                        <Star className="h-3 w-3 fill-current" />
                                                        <span>{pharmacist.rating_avg.toFixed(1)}</span>
                                                        <span className="text-slate-600">({pharmacist.rating_count})</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </CardHeader>

                                    <CardContent className="space-y-4 text-sm">
                                        <div className="h-12 overflow-hidden text-slate-500 line-clamp-2">
                                            {pharmacist.bio || "No bio provided."}
                                        </div>

                                        <div className="flex flex-wrap gap-2">
                                            {pharmacist.specializations?.slice(0, 3).map(s => (
                                                <Badge key={s} variant="secondary" className="bg-slate-800 text-slate-300 hover:bg-slate-800">
                                                    {s}
                                                </Badge>
                                            ))}
                                            {pharmacist.specializations?.length > 3 && (
                                                <Badge key="more" variant="secondary" className="bg-slate-800 text-slate-300 hover:bg-slate-800">
                                                    +{pharmacist.specializations.length - 3}
                                                </Badge>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-4 text-slate-400 text-xs">
                                            <div className="flex items-center gap-1">
                                                <Clock className="h-3 w-3" />
                                                {pharmacist.experience_years} Years Exp.
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <Languages className="h-3 w-3" />
                                                {pharmacist.languages?.slice(0, 2).join(", ")}
                                            </div>
                                        </div>
                                    </CardContent>

                                    <CardFooter className="pt-3 border-t border-slate-800 bg-slate-950/30 flex items-center justify-between">
                                        <div>
                                            <p className="text-xs text-slate-500 uppercase font-bold">Consultation</p>
                                            <p className="text-slate-200 font-semibold">
                                                ₹{pharmacist.rate} <span className="text-slate-600 text-xs font-normal">/ {pharmacist.duration_minutes} min</span>
                                            </p>
                                        </div>
                                        <Link href={`/book/${pharmacist.id}`}>
                                            <Button
                                                disabled={!pharmacist.is_available}
                                                className={`${pharmacist.is_available
                                                    ? "bg-indigo-600 hover:bg-indigo-700"
                                                    : "bg-slate-800 text-slate-500 hover:bg-slate-800"}`}
                                            >
                                                {pharmacist.is_available ? "Book Now" : "Unavailable"}
                                            </Button>
                                        </Link>
                                    </CardFooter>
                                </Card>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

"use client";

import { useState } from "react";
import { comparePrices } from "@/lib/api";
import {
    Search,
    ExternalLink,
    Star,
    TrendingDown,
    Loader2,
    AlertCircle,
    Package,
    CheckCircle2,
    XCircle,
    Clock,
    Sparkles,
    Pill,
    ShoppingCart,
    Zap,
    Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";

interface PriceResult {
    name: string;
    price: string;
    mrp?: string;
    discount?: string;
    source: string;
    url: string;
    rating?: number | null;
    rating_count?: number;
    manufacturer?: string;
    image?: string;
    in_stock?: boolean;
    quantity?: string;
}

interface CompareResponse {
    error?: string | null;
    query: string;
    total_results: number;
    best_deal: PriceResult | null;
    best_by_source: Record<string, PriceResult>;
    results: PriceResult[];
    duration_seconds: number;
    providers: {
        active: string[];
        blocked: string[];
    };
}

const PHARMACY_CONFIG: Record<string, { color: string; gradient: string; icon: string; fullName: string }> = {
    PharmEasy: {
        color: "emerald",
        gradient: "from-emerald-500 to-green-600",
        icon: "💊",
        fullName: "PharmEasy",
    },
    "1mg": {
        color: "orange",
        gradient: "from-orange-500 to-red-500",
        icon: "🏥",
        fullName: "Tata 1mg",
    },
    Netmeds: {
        color: "blue",
        gradient: "from-blue-500 to-indigo-600",
        icon: "💉",
        fullName: "Netmeds",
    },
    Apollo: {
        color: "purple",
        gradient: "from-purple-500 to-violet-600",
        icon: "⚕️",
        fullName: "Apollo Pharmacy",
    },
};

const POPULAR_SEARCHES = ["Dolo 650", "Crocin", "Paracetamol", "Azithromycin", "Cetirizine"];

export default function PriceCompare() {
    const [query, setQuery] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState<CompareResponse | null>(null);
    const [searchTime, setSearchTime] = useState<number>(0);

    const handleSearch = async (searchQuery?: string) => {
        const q = searchQuery || query;
        if (!q.trim() || q.length < 2) {
            setError("Please enter at least 2 characters");
            return;
        }

        if (searchQuery) setQuery(searchQuery);
        setLoading(true);
        setError(null);
        setSearchTime(0);

        const startTime = Date.now();
        const updateTimer = setInterval(() => {
            setSearchTime((Date.now() - startTime) / 1000);
        }, 100);

        try {
            const result = (await comparePrices(q)) as CompareResponse;

            // Handle error in response
            if (result.error) {
                setError(result.error);
            }

            setData(result);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to fetch prices. Please try again.");
            console.error(err);
        } finally {
            clearInterval(updateTimer);
            setLoading(false);
        }
    };

    const parsePrice = (price: string): number => {
        const match = price?.match(/[\d,]+\.?\d*/);
        return match ? parseFloat(match[0].replace(/,/g, "")) : Infinity;
    };

    const getLowestPrice = (): number => {
        if (!data?.results.length) return Infinity;
        return Math.min(...data.results.map((r) => parsePrice(r.price)));
    };

    const lowestPrice = getLowestPrice();

    const getPharmacyStyle = (source: string) => {
        return PHARMACY_CONFIG[source] || {
            color: "slate",
            gradient: "from-slate-500 to-slate-600",
            icon: "💊",
            fullName: source,
        };
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-cyan-50/30">
            {/* Background Pattern */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-40 -right-40 w-80 h-80 bg-cyan-100 rounded-full blur-3xl opacity-50" />
                <div className="absolute top-1/2 -left-40 w-80 h-80 bg-blue-100 rounded-full blur-3xl opacity-50" />
                <div className="absolute -bottom-40 right-1/3 w-80 h-80 bg-emerald-100 rounded-full blur-3xl opacity-40" />
            </div>

            <div className="relative max-w-7xl mx-auto px-4 py-8 md:py-12">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center mb-10"
                >
                    <div className="inline-flex items-center gap-2 bg-cyan-100/80 text-cyan-700 px-4 py-2 rounded-full text-sm font-medium mb-4 backdrop-blur-sm">
                        <Zap className="h-4 w-4" />
                        Compare prices from 4 pharmacies instantly
                    </div>

                    <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-4">
                        <span className="bg-gradient-to-r from-slate-900 via-slate-700 to-slate-900 bg-clip-text text-transparent">
                            Medicine Price
                        </span>
                        <br />
                        <span className="bg-gradient-to-r from-cyan-600 to-blue-600 bg-clip-text text-transparent">
                            Compare
                        </span>
                    </h1>

                    <p className="text-slate-500 text-lg max-w-xl mx-auto">
                        Find the best deals across PharmEasy, 1mg, Apollo & Netmeds
                    </p>
                </motion.div>

                {/* Search Section */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="max-w-2xl mx-auto mb-8"
                >
                    <div className="relative">
                        <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-2xl blur-xl opacity-20" />
                        <div className="relative bg-white rounded-2xl shadow-2xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
                            <div className="flex items-center">
                                <div className="pl-5 text-slate-400">
                                    <Search className="h-5 w-5" />
                                </div>
                                <Input
                                    type="text"
                                    placeholder="Search any medicine..."
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    onKeyPress={(e) => e.key === "Enter" && handleSearch()}
                                    className="h-16 border-0 text-lg !bg-transparent text-slate-900 placeholder:text-slate-400 focus-visible:ring-0 px-4"
                                />
                                <div className="pr-3">
                                    <Button
                                        onClick={() => handleSearch()}
                                        disabled={loading}
                                        size="lg"
                                        className="h-12 px-8 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white font-semibold rounded-xl shadow-lg shadow-cyan-500/25 transition-all hover:shadow-xl hover:shadow-cyan-500/30 hover:-translate-y-0.5"
                                    >
                                        {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Search"}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Error */}
                    <AnimatePresence>
                        {error && (
                            <motion.div
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0 }}
                                className="flex items-center justify-center gap-2 text-red-500 text-sm font-medium mt-4"
                            >
                                <AlertCircle className="h-4 w-4" />
                                {error}
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Popular Searches */}
                    {!data && !loading && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.3 }}
                            className="flex flex-wrap items-center justify-center gap-2 mt-6"
                        >
                            <span className="text-sm text-slate-400">Popular:</span>
                            {POPULAR_SEARCHES.map((term) => (
                                <button
                                    key={term}
                                    onClick={() => handleSearch(term)}
                                    className="px-4 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-full text-sm text-slate-600 hover:text-slate-900 hover:border-slate-300 transition-all hover:shadow-sm"
                                >
                                    {term}
                                </button>
                            ))}
                        </motion.div>
                    )}
                </motion.div>

                {/* Loading State */}
                <AnimatePresence>
                    {loading && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="flex justify-center py-16"
                        >
                            <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 p-10 max-w-md w-full">
                                <div className="flex flex-col items-center gap-6">
                                    <div className="relative">
                                        <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full animate-ping opacity-20" />
                                        <div className="relative w-20 h-20 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-full flex items-center justify-center shadow-lg shadow-cyan-500/30">
                                            <Pill className="h-10 w-10 text-white animate-pulse" />
                                        </div>
                                    </div>

                                    <div className="text-center">
                                        <p className="text-xl font-semibold text-slate-900 mb-1">Scanning pharmacies</p>
                                        <p className="text-slate-500">Finding the best prices for you</p>
                                    </div>

                                    <div className="flex items-center gap-2 text-cyan-600 font-mono text-2xl font-bold">
                                        <Clock className="h-5 w-5" />
                                        {searchTime.toFixed(1)}s
                                    </div>

                                    <div className="flex gap-3">
                                        {Object.entries(PHARMACY_CONFIG).map(([key, config], i) => (
                                            <motion.div
                                                key={key}
                                                initial={{ scale: 0, opacity: 0 }}
                                                animate={{ scale: 1, opacity: 1 }}
                                                transition={{ delay: i * 0.15 }}
                                                className={`w-12 h-12 rounded-xl bg-gradient-to-br ${config.gradient} flex items-center justify-center text-xl shadow-lg`}
                                            >
                                                {config.icon}
                                            </motion.div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Results */}
                {data && !loading && (
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
                        {/* Stats */}
                        <div className="flex flex-wrap items-center justify-center gap-3">
                            <div className="flex items-center gap-2 bg-white px-5 py-2.5 rounded-full shadow-sm border border-slate-100">
                                <Package className="h-4 w-4 text-cyan-500" />
                                <span className="font-semibold text-slate-900">{data.total_results}</span>
                                <span className="text-slate-500">results</span>
                            </div>
                            <div className="flex items-center gap-2 bg-white px-5 py-2.5 rounded-full shadow-sm border border-slate-100">
                                <Clock className="h-4 w-4 text-cyan-500" />
                                <span className="font-semibold text-slate-900">{data.duration_seconds.toFixed(1)}s</span>
                            </div>
                            <div className="flex items-center gap-2 bg-white px-5 py-2.5 rounded-full shadow-sm border border-slate-100">
                                <Shield className="h-4 w-4 text-emerald-500" />
                                <span className="font-semibold text-slate-900">{data.providers.active.length}</span>
                                <span className="text-slate-500">pharmacies</span>
                            </div>
                        </div>

                        {/* Best by Source */}
                        {Object.keys(data.best_by_source).length > 0 && (
                            <div className="bg-gradient-to-br from-emerald-50 via-cyan-50 to-blue-50 rounded-3xl p-6 md:p-8 border border-emerald-100/50">
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-cyan-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
                                        <Sparkles className="h-5 w-5 text-white" />
                                    </div>
                                    <div>
                                        <h2 className="font-bold text-slate-900 text-lg">Best Price by Pharmacy</h2>
                                        <p className="text-sm text-slate-500">Lowest price from each source</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                    {Object.entries(data.best_by_source).map(([source, item]) => {
                                        const config = getPharmacyStyle(source);
                                        return (
                                            <a
                                                key={source}
                                                href={item.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="group bg-white rounded-2xl p-4 border border-slate-100 hover:border-transparent hover:shadow-xl hover:shadow-slate-200/50 transition-all hover:-translate-y-1"
                                            >
                                                <div className="flex items-center gap-3 mb-3">
                                                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${config.gradient} flex items-center justify-center text-lg shadow-md`}>
                                                        {config.icon}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="font-semibold text-slate-900 text-sm truncate">{config.fullName}</p>
                                                    </div>
                                                    <ExternalLink className="h-4 w-4 text-slate-300 group-hover:text-cyan-500 transition-colors" />
                                                </div>
                                                <p className="text-xs text-slate-500 line-clamp-1 mb-2">{item.name}</p>
                                                <p className="text-2xl font-bold text-slate-900">{item.price}</p>
                                            </a>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* All Results */}
                        {data.results.length > 0 ? (
                            <div>
                                <h3 className="text-lg font-semibold text-slate-900 mb-4">All Results</h3>
                                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                                    {data.results.map((result, index) => {
                                        const price = parsePrice(result.price);
                                        const isLowest = price === lowestPrice;
                                        const config = getPharmacyStyle(result.source);
                                        const inStock = result.in_stock !== false;

                                        return (
                                            <motion.div
                                                key={`${result.source}-${result.name}-${index}`}
                                                initial={{ opacity: 0, y: 20 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ delay: Math.min(index * 0.02, 0.4) }}
                                            >
                                                <Card
                                                    className={`!bg-white group h-full overflow-hidden transition-all duration-300 hover:shadow-xl hover:-translate-y-1 ${isLowest
                                                        ? "ring-2 ring-emerald-500 ring-offset-2 shadow-lg shadow-emerald-100"
                                                        : "border-slate-200 hover:border-slate-300"
                                                        } ${!inStock ? "opacity-60" : ""}`}
                                                >
                                                    <CardContent className="p-4">
                                                        {/* Header */}
                                                        <div className="flex items-start justify-between gap-2 mb-3">
                                                            <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-100">
                                                                <span className="text-sm">{config.icon}</span>
                                                                <span className={`text-xs font-bold bg-gradient-to-r ${config.gradient} bg-clip-text text-transparent`}>
                                                                    {result.source}
                                                                </span>
                                                            </div>
                                                            <div className="flex items-center gap-1">
                                                                {isLowest && (
                                                                    <Badge className="bg-emerald-500 text-white text-xs gap-1">
                                                                        <TrendingDown className="h-3 w-3" />
                                                                        Best
                                                                    </Badge>
                                                                )}
                                                                {inStock ? (
                                                                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                                                ) : (
                                                                    <XCircle className="h-4 w-4 text-red-400" />
                                                                )}
                                                            </div>
                                                        </div>

                                                        {/* Name */}
                                                        <h4 className="font-semibold text-slate-900 text-sm leading-tight line-clamp-2 min-h-[2.5rem] mb-1" title={result.name}>
                                                            {result.name}
                                                        </h4>

                                                        {result.manufacturer && (
                                                            <p className="text-xs text-slate-400 truncate mb-3">{result.manufacturer}</p>
                                                        )}

                                                        {/* Price */}
                                                        <div className="flex items-end justify-between mb-4">
                                                            <div>
                                                                <p className="text-2xl font-bold text-slate-900">{result.price}</p>
                                                                {result.mrp && result.mrp !== result.price && (
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="text-xs text-slate-400 line-through">{result.mrp}</span>
                                                                        {result.discount && (
                                                                            <span className="text-xs font-semibold text-emerald-600">{result.discount} off</span>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                            {result.rating && result.rating > 0 && (
                                                                <div className="flex items-center gap-1 bg-amber-50 px-2 py-1 rounded-md">
                                                                    <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
                                                                    <span className="text-xs font-bold text-amber-700">{result.rating}</span>
                                                                </div>
                                                            )}
                                                        </div>

                                                        {/* CTA */}
                                                        {result.url && (
                                                            <a
                                                                href={result.url}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className={`flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-semibold transition-all ${isLowest
                                                                    ? "bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/25 hover:shadow-xl hover:shadow-emerald-500/30"
                                                                    : "bg-blue-600 text-white shadow-md shadow-blue-500/20 hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-500/30"
                                                                    }`}
                                                            >
                                                                <ShoppingCart className="h-4 w-4" />
                                                                {inStock ? "Buy Now" : "Check Availability"}
                                                            </a>
                                                        )}
                                                    </CardContent>
                                                </Card>
                                            </motion.div>
                                        );
                                    })}
                                </div>
                            </div>
                        ) : (
                            <div className="text-center py-16 bg-white rounded-3xl border-2 border-dashed border-slate-200">
                                <Pill className="h-16 w-16 text-slate-200 mx-auto mb-4" />
                                <p className="text-slate-900 font-semibold text-lg">No results found</p>
                                <p className="text-slate-500 mt-1">Try searching with a different name</p>
                            </div>
                        )}
                    </motion.div>
                )}

                {/* Initial State */}
                {!data && !loading && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.4 }}
                        className="text-center py-12"
                    >
                        <div className="bg-white rounded-3xl shadow-xl border border-slate-100 p-8 md:p-12 max-w-2xl mx-auto">
                            <div className="flex justify-center gap-4 mb-8">
                                {Object.entries(PHARMACY_CONFIG).map(([key, config], i) => (
                                    <motion.div
                                        key={key}
                                        initial={{ scale: 0, rotate: -10 }}
                                        animate={{ scale: 1, rotate: 0 }}
                                        transition={{ delay: 0.5 + i * 0.1, type: "spring" }}
                                        className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${config.gradient} flex items-center justify-center text-2xl shadow-lg hover:scale-110 transition-transform cursor-default`}
                                        title={config.fullName}
                                    >
                                        {config.icon}
                                    </motion.div>
                                ))}
                            </div>

                            <h3 className="text-xl font-semibold text-slate-900 mb-2">Compare prices across top pharmacies</h3>
                            <p className="text-slate-500 mb-6">
                                Search for any medicine and we&apos;ll show you the best prices from PharmEasy, Tata 1mg, Apollo Pharmacy, and Netmeds.
                            </p>

                            <div className="grid grid-cols-2 gap-4 text-left max-w-md mx-auto">
                                <div className="flex items-start gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
                                        <Zap className="h-4 w-4 text-emerald-600" />
                                    </div>
                                    <div>
                                        <p className="font-medium text-slate-900 text-sm">Real-time prices</p>
                                        <p className="text-xs text-slate-500">Live data from pharmacies</p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-cyan-100 flex items-center justify-center shrink-0">
                                        <Shield className="h-4 w-4 text-cyan-600" />
                                    </div>
                                    <div>
                                        <p className="font-medium text-slate-900 text-sm">Verified sources</p>
                                        <p className="text-xs text-slate-500">Official pharmacy sites</p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                                        <TrendingDown className="h-4 w-4 text-blue-600" />
                                    </div>
                                    <div>
                                        <p className="font-medium text-slate-900 text-sm">Best deals</p>
                                        <p className="text-xs text-slate-500">Find lowest prices</p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center shrink-0">
                                        <ExternalLink className="h-4 w-4 text-purple-600" />
                                    </div>
                                    <div>
                                        <p className="font-medium text-slate-900 text-sm">Direct links</p>
                                        <p className="text-xs text-slate-500">Buy with one click</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </div>
        </div>
    );
}

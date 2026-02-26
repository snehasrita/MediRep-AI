"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, RefreshCw, Download, Loader2, FlaskConical, ImageIcon, Sparkles } from "lucide-react";
import { checkInteractions, saveDrug, getEnhancedInteraction, getDrugInfo, generateReactionImage } from "@/lib/api";
import { DrugInteraction, EnhancedInteraction } from "@/types";
import { usePatientContext } from "@/lib/context/PatientContext";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import {
  DrugSearchInput,
  DrugList,
  InteractionCard,
  InteractionList,
  InteractionSummary,
  InteractionMathCard,
} from "@/components/InteractionGraph";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false });

// import { forceCollide } from 'd3-force';

const severityColors = {
  major: "#ef4444",
  moderate: "#eab308",
  minor: "#3b82f6",
};

// Helper to subcriptify formulas
const toSubscript = (str: string) => {
  const map: Record<string, string> = {
    '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉'
  };
  return str.replace(/\d/g, (d) => map[d] || d);
};

export default function InteractionGraphWidget() {
  const [drugs, setDrugs] = useState<string[]>([]);
  const [interactions, setInteractions] = useState<DrugInteraction[]>([]);
  const [selectedInteraction, setSelectedInteraction] = useState<DrugInteraction | null>(null);
  const [enhancedInteraction, setEnhancedInteraction] = useState<EnhancedInteraction | null>(null);
  const [isLoadingEnhanced, setIsLoadingEnhanced] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { patientContext } = usePatientContext();
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<any>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 400 });
  const nodeImages = useRef<Record<string, HTMLImageElement>>({});

  // === NEW: Reaction Image State ===
  const [reactionImageUrl, setReactionImageUrl] = useState<string | null>(null);
  const [reactionImageLoading, setReactionImageLoading] = useState(false);
  const [reactionImageError, setReactionImageError] = useState<string | null>(null);
  // =================================

  const [drugMetadata, setDrugMetadata] = useState<Record<string, { formula?: string; name?: string }>>({});

  // Fetch drug metadata (formulas) dynamically
  useEffect(() => {
    drugs.forEach(async (drug) => {
      const key = drug.toLowerCase().trim();
      if (!drugMetadata[key]) {
        try {
          const info = await getDrugInfo(drug);
          setDrugMetadata(prev => ({
            ...prev,
            [key]: {
              formula: info.formula,
              name: info.name // Corrected name from DB/AI
            }
          }));
        } catch (e) {
          console.error(`Failed to fetch info for ${drug}`, e);
        }
      }
    });
  }, [drugs]);

  // Preload drug structure images
  useEffect(() => {
    drugs.forEach(drug => {
      const key = drug.toLowerCase().trim();
      const meta = drugMetadata[key];
      // Use corrected name if available (fixes typos like 'parocetemol' -> 'Paracetamol')
      const queryName = meta?.name || drug;

      // We check if we already have an image FOR THIS KEY. 
      // If we have a better name now, and the old image failed (naturalWidth=0) or doesn't exist, try again.
      // Ideally we just overwrite with the better query if available.

      const img = new Image();
      img.crossOrigin = "Anonymous";
      img.src = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(queryName)}/PNG?record_type=2d&image_size=300x300`;
      img.onload = () => {
        nodeImages.current[key] = img;
      };
    });
  }, [drugs, drugMetadata]);

  // Update dimensions on resize
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setDimensions({ width: rect.width, height: 400 });
      }
    };
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);



  const addDrug = (drug: string) => {
    if (drug.trim() && !drugs.includes(drug.trim())) {
      setDrugs([...drugs, drug.trim()]);
    }
  };

  const removeDrug = (index: number) => {
    setDrugs(drugs.filter((_, i) => i !== index));
    setSelectedInteraction(null);
  };

  const fetchInteractions = useCallback(async () => {
    const hasContext = patientContext && (patientContext.preExistingDiseases?.length > 0);

    if (drugs.length < 1 || (drugs.length < 2 && !hasContext)) {
      setInteractions([]);
      setSelectedInteraction(null);
      return;
    }

    setIsLoading(true);
    try {
      const response = await checkInteractions(drugs, patientContext) as any;

      // BRUTAL FIX: Backend returns an array directly
      if (Array.isArray(response)) {
        setInteractions(response);
      } else if (response.interactions && Array.isArray(response.interactions)) {
        setInteractions(response.interactions);
      } else {
        setInteractions([]);
      }
    } catch (error) {
      console.error("Error fetching interactions:", error);
      setInteractions([]);
    } finally {
      setIsLoading(false);
    }
  }, [drugs, patientContext]);

  useEffect(() => {
    fetchInteractions();
  }, [fetchInteractions]);

  // === NEW: Auto-generate reaction image when we have drug interactions ===
  useEffect(() => {
    const generateImage = async () => {
      // Need at least 2 drugs to generate image
      if (drugs.length < 2) {
        setReactionImageUrl(null);
        setReactionImageError(null);
        return;
      }

      // Use the first two drugs from the drugs list (these are guaranteed to be real drug names)
      // This avoids using drug class names like "ACE Inhibitor" from interaction data
      const drug1 = drugs[0];
      const drug2 = drugs[1];

      // Get formulas from metadata
      const drug1Key = drug1.toLowerCase().trim();
      const drug2Key = drug2.toLowerCase().trim();
      const drug1Formula = drugMetadata[drug1Key]?.formula || "";
      const drug2Formula = drugMetadata[drug2Key]?.formula || "";

      // Find if there's an interaction between these two drugs
      const relevantInteraction = interactions.find(
        (i) =>
          (i.drug1.toLowerCase() === drug1Key && i.drug2.toLowerCase() === drug2Key) ||
          (i.drug1.toLowerCase() === drug2Key && i.drug2.toLowerCase() === drug1Key)
      );

      setReactionImageLoading(true);
      setReactionImageError(null);

      try {
        const response = await generateReactionImage({
          drug1,
          drug2,
          drug1_formula: drug1Formula,
          drug2_formula: drug2Formula,
          mechanism: relevantInteraction?.description?.slice(0, 100) || "Drug-Drug Interaction",
        });

        if (response.url) {
          setReactionImageUrl(response.url);
        } else if (response.error) {
          setReactionImageError(response.error);
        }
      } catch (error) {
        console.error("Failed to generate reaction image:", error);
        setReactionImageError("Failed to generate image");
      } finally {
        setReactionImageLoading(false);
      }
    };

    // Debounce to avoid rapid-fire requests
    const timer = setTimeout(generateImage, 1500);
    return () => clearTimeout(timer);
  }, [drugs, interactions, drugMetadata]);
  // ======================================================================

  const handleRefresh = async () => {
    console.log("Refresh clicked, drugs:", drugs);
    if (drugs.length >= 2) {
      await fetchInteractions();
    }
  };

  // Fetch enhanced interaction with AUC mathematics
  const fetchEnhancedInteraction = useCallback(async (drug1: string, drug2: string) => {
    setIsLoadingEnhanced(true);
    try {
      const result = await getEnhancedInteraction(drug1, drug2, patientContext) as EnhancedInteraction;
      setEnhancedInteraction(result);
    } catch (error) {
      console.log("Enhanced interaction not available for this pair");
      setEnhancedInteraction(null);
    } finally {
      setIsLoadingEnhanced(false);
    }
  }, [patientContext]);

  const exportData = () => {
    console.log("Export clicked, drugs:", drugs, "interactions:", interactions);
    try {
      const data = {
        drugs,
        interactions,
        timestamp: new Date().toISOString(),
        summary: {
          total: interactions.length,
          major: interactions.filter(i => i.severity === "major").length,
          moderate: interactions.filter(i => i.severity === "moderate").length,
          minor: interactions.filter(i => i.severity === "minor").length,
        }
      };

      const jsonString = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonString], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `drug-interactions-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      console.log("Export successful");
    } catch (error) {
      console.error("Error exporting data:", error);
      alert("Failed to export data. Please try again.");
    }
  };

  // Build graph data with links between drugs that have related interactions
  const graphData = useMemo(() => {
    const nodeIds = new Set(drugs.map(d => d.toLowerCase().trim()));

    // Find direct drug-drug interactions
    const directLinks = interactions
      .filter(i => {
        const source = i.drug1.toLowerCase().trim();
        const target = i.drug2.toLowerCase().trim();
        return nodeIds.has(source) && nodeIds.has(target) && source !== target;
      })
      .map((interaction) => ({
        source: interaction.drug1.toLowerCase().trim(),
        target: interaction.drug2.toLowerCase().trim(),
        color: severityColors[interaction.severity as keyof typeof severityColors] || severityColors.moderate,
        severity: interaction.severity,
        description: interaction.description,
        recommendation: interaction.recommendation,
      }));

    // If we have interactions but no direct drug-drug links, 
    // create links between drugs that share interactions (via patient context)
    // If we have interactions but no direct drug-drug links, 
    // we previously tried to link everything. This causes graph explosions.
    // Now we strictly show direct drug-drug interactions.
    const links = directLinks;

    // Pre-position nodes in a circle for better initial spread
    const radius = 120;
    const angleStep = (2 * Math.PI) / Math.max(drugs.length, 1);

    return {
      nodes: drugs.map((drug, index) => ({
        id: drug.toLowerCase().trim(),
        name: drug,
        // Initial positions in a circle
        x: Math.cos(angleStep * index) * radius,
        y: Math.sin(angleStep * index) * radius,
      })),
      links,
    };
  }, [drugs, interactions]);

  // Configure force simulation and auto-zoom
  useEffect(() => {
    if (graphRef.current) {
      const fg = graphRef.current;
      // Start with a stronger repulsion to separate nodes
      fg.d3Force('charge')?.strength(-400);
      fg.d3Force('link')?.distance(200);

      // Auto-zoom to fit all nodes with padding
      setTimeout(() => {
        if (graphRef.current) {
          graphRef.current.zoomToFit(400, 50);
        }
      }, 500);
    }
  }, [graphData]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Drug Interaction Checker</h2>
          <p className="text-muted-foreground mt-1">
            Visualize and analyze potential drug-drug interactions
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isLoading || drugs.length < 2}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={exportData}
            disabled={drugs.length === 0}
          >
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      {interactions.length > 0 && <InteractionSummary interactions={interactions} />}

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Graph Visualization */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Interaction Network</CardTitle>
          </CardHeader>
          <CardContent>
            {drugs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-[400px] text-center">
                <div className="rounded-full bg-muted p-6 mb-4">
                  <AlertTriangle className="h-12 w-12 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-2">No Drugs Added</h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  Add at least 2 drugs to visualize their interactions in the network graph
                </p>
              </div>
            ) : drugs.length === 1 ? (
              <div className="flex flex-col items-center justify-center h-[400px] text-center">
                <div className="rounded-full bg-primary/10 p-6 mb-4">
                  <AlertTriangle className="h-12 w-12 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Add More Drugs</h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  Add at least one more drug to check for interactions
                </p>
              </div>
            ) : isLoading ? (
              <div className="h-[400px] flex flex-col items-center justify-center gap-4 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-xl">
                <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
                <div className="space-y-2 w-full max-w-xs">
                  <Skeleton className="h-4 w-full bg-slate-700" />
                  <Skeleton className="h-4 w-3/4 bg-slate-700" />
                  <Skeleton className="h-4 w-1/2 bg-slate-700" />
                </div>
                <p className="text-sm text-cyan-300/70">Analyzing molecular interactions...</p>
              </div>
            ) : (
              <div ref={containerRef} className="h-[400px] rounded-xl overflow-hidden relative">
                {/* Premium dark gradient background */}
                <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950" />

                {/* Animated grid pattern overlay */}
                <div
                  className="absolute inset-0 opacity-20"
                  style={{
                    backgroundImage: `
                      linear-gradient(rgba(99, 102, 241, 0.1) 1px, transparent 1px),
                      linear-gradient(90deg, rgba(99, 102, 241, 0.1) 1px, transparent 1px)
                    `,
                    backgroundSize: '40px 40px'
                  }}
                />

                {/* Radial glow in center */}
                <div className="absolute inset-0 bg-gradient-radial from-cyan-500/10 via-transparent to-transparent"
                  style={{
                    background: 'radial-gradient(circle at center, rgba(6, 182, 212, 0.15) 0%, transparent 50%)'
                  }}
                />

                <ForceGraph2D
                  ref={graphRef}
                  graphData={graphData}
                  nodeLabel=""
                  width={dimensions.width}
                  height={dimensions.height}
                  d3AlphaDecay={0.005}
                  d3VelocityDecay={0.15}
                  cooldownTicks={300}
                  warmupTicks={100}
                  minZoom={0.5}
                  maxZoom={3}
                  enableNodeDrag={true}
                  nodeRelSize={10}
                  nodeCanvasObject={(node: any, ctx, globalScale) => {
                    // Guard against undefined positions during initialization
                    if (node.x === undefined || node.y === undefined || !isFinite(node.x) || !isFinite(node.y)) {
                      return;
                    }

                    try {
                      const label = node.name || node.id;
                      const nodeSize = 32;
                      const fontSize = Math.max(10, 12 / globalScale);
                      const img = nodeImages.current[node.id];

                      ctx.beginPath();

                      // Draw Node (Image or Sphere)
                      if (img && img.complete && img.naturalWidth > 0) {
                        ctx.save();
                        ctx.beginPath();
                        ctx.arc(node.x, node.y, nodeSize, 0, 2 * Math.PI);
                        ctx.clip();
                        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
                        ctx.fill();
                        try {
                          ctx.drawImage(img, node.x - nodeSize, node.y - nodeSize, nodeSize * 2, nodeSize * 2);
                        } catch (e) { }
                        ctx.restore();
                        // Border
                        ctx.beginPath();
                        ctx.arc(node.x, node.y, nodeSize, 0, 2 * Math.PI);
                        ctx.strokeStyle = '#38bdf8';
                        ctx.lineWidth = 2 / globalScale;
                        ctx.stroke();
                      } else {
                        // Fallback Sphere
                        const time = Date.now() / 1000;
                        const pulse = Math.sin(time * 2 + node.x) * 0.15 + 1;
                        const gradient1 = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, nodeSize * 0.8 * pulse);
                        gradient1.addColorStop(0, 'rgba(6, 182, 212, 0.4)');
                        gradient1.addColorStop(1, 'transparent');
                        ctx.fillStyle = gradient1;
                        ctx.fill();
                        const gradient2 = ctx.createRadialGradient(node.x - 5, node.y - 5, 2, node.x, node.y, nodeSize * 0.6);
                        gradient2.addColorStop(0, '#67e8f9');
                        gradient2.addColorStop(1, '#0e7490');
                        ctx.fillStyle = gradient2;
                        ctx.beginPath();
                        ctx.arc(node.x, node.y, nodeSize * 0.6, 0, 2 * Math.PI);
                        ctx.fill();
                      }

                      // Label
                      ctx.font = `600 ${fontSize}px Inter, system-ui, sans-serif`;
                      const textWidth = ctx.measureText(label).width;
                      const labelY = node.y + nodeSize + 8;
                      const pillPadding = 6;
                      const pillHeight = fontSize + 6;

                      // Background Pill (Safe Rect)
                      ctx.beginPath();
                      ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
                      // Use standard rect to avoid compatibility issues
                      ctx.rect(
                        node.x - textWidth / 2 - pillPadding,
                        labelY - pillHeight / 2,
                        textWidth + pillPadding * 2,
                        pillHeight
                      );
                      ctx.fill();
                      ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
                      ctx.lineWidth = 1;
                      ctx.stroke();

                      // Text
                      ctx.textAlign = 'center';
                      ctx.textBaseline = 'middle';
                      ctx.fillStyle = '#f0f9ff';
                      ctx.fillText(label, node.x, labelY);

                      // Formula
                      const meta = drugMetadata[label.toLowerCase().trim()];
                      const formula = meta?.formula ? toSubscript(meta.formula) : null;
                      if (formula) {
                        const formulaFontSize = Math.max(9, 11 / globalScale);
                        ctx.font = `700 ${formulaFontSize}px "Courier New", monospace`;
                        ctx.fillStyle = '#67e8f9';
                        ctx.fillText(formula, node.x, labelY + pillHeight);
                      }
                    } catch (err) {
                      console.error("Node Render Error:", err);
                    }
                  }}
                  nodePointerAreaPaint={(node: any, color, ctx) => {
                    ctx.beginPath();
                    ctx.arc(node.x, node.y, 40, 0, 2 * Math.PI);
                    ctx.fillStyle = color;
                    ctx.fill();
                  }}
                  linkCanvasObject={(link: any, ctx, globalScale) => {
                    const start = link.source;
                    const end = link.target;

                    if (!start.x || !end.x || !isFinite(start.x) || !isFinite(end.x)) return;
                    if (!start.y || !end.y || !isFinite(start.y) || !isFinite(end.y)) return;

                    // Get severity color
                    const severityColors: Record<string, { main: string; glow: string }> = {
                      major: { main: '#ef4444', glow: 'rgba(239, 68, 68, 0.3)' },
                      moderate: { main: '#f59e0b', glow: 'rgba(245, 158, 11, 0.3)' },
                      minor: { main: '#22c55e', glow: 'rgba(34, 197, 94, 0.3)' },
                    };
                    const colors = severityColors[link.severity] || severityColors.moderate;

                    // Calculate distance and angle
                    const dx = end.x - start.x;
                    const dy = end.y - start.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);

                    // Guard against zero distance
                    if (distance < 1) return;

                    // Animated time
                    const time = Date.now() / 800;

                    // Draw wavy curved line using bezier
                    const numWaves = Math.max(2, Math.floor(distance / 40));
                    const waveAmplitude = Math.min(20, distance * 0.15);

                    // Perpendicular direction for wave offset
                    const perpX = -dy / distance;
                    const perpY = dx / distance;

                    // Draw glow path
                    ctx.beginPath();
                    ctx.moveTo(start.x, start.y);

                    for (let i = 1; i <= 20; i++) {
                      const t = i / 20;
                      const x = start.x + dx * t;
                      const y = start.y + dy * t;

                      // Sine wave offset with animation
                      const waveOffset = Math.sin(t * Math.PI * numWaves + time) * waveAmplitude;
                      const offsetX = x + perpX * waveOffset;
                      const offsetY = y + perpY * waveOffset;

                      ctx.lineTo(offsetX, offsetY);
                    }

                    ctx.strokeStyle = colors.glow;
                    ctx.lineWidth = 8;
                    ctx.lineCap = 'round';
                    ctx.stroke();

                    // Draw main wavy line
                    ctx.beginPath();
                    ctx.moveTo(start.x, start.y);

                    for (let i = 1; i <= 20; i++) {
                      const t = i / 20;
                      const x = start.x + dx * t;
                      const y = start.y + dy * t;

                      const waveOffset = Math.sin(t * Math.PI * numWaves + time) * waveAmplitude;
                      const offsetX = x + perpX * waveOffset;
                      const offsetY = y + perpY * waveOffset;

                      ctx.lineTo(offsetX, offsetY);
                    }

                    ctx.strokeStyle = colors.main;
                    ctx.lineWidth = 3;
                    ctx.lineCap = 'round';
                    ctx.stroke();

                    // Center indicator dot
                    const midX = (start.x + end.x) / 2;
                    const midY = (start.y + end.y) / 2;
                    const midWaveOffset = Math.sin(0.5 * Math.PI * numWaves + time) * waveAmplitude;

                    ctx.beginPath();
                    ctx.arc(midX + perpX * midWaveOffset, midY + perpY * midWaveOffset, 5, 0, 2 * Math.PI);
                    ctx.fillStyle = colors.main;
                    ctx.fill();
                    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
                    ctx.lineWidth = 2;
                    ctx.stroke();
                  }}
                  linkDirectionalParticles={4}
                  linkDirectionalParticleWidth={4}
                  linkDirectionalParticleSpeed={0.005}
                  linkDirectionalParticleColor={(link: any) => {
                    const colors: Record<string, string> = {
                      major: '#fca5a5',
                      moderate: '#fcd34d',
                      minor: '#86efac',
                    };
                    return colors[link.severity] || colors.moderate;
                  }}
                  onLinkClick={(link: any) => {
                    const drug1 = link.source.id || link.source;
                    const drug2 = link.target.id || link.target;
                    setSelectedInteraction({
                      drug1,
                      drug2,
                      severity: link.severity,
                      description: link.description,
                      recommendation: link.recommendation,
                    });
                    // Also try to fetch enhanced data
                    fetchEnhancedInteraction(drug1, drug2);
                  }}
                  onNodeClick={(node: any) => {
                    // Find first interaction involving this drug
                    const interaction = interactions.find(
                      i => i.drug1.toLowerCase() === node.id || i.drug2.toLowerCase() === node.id
                    );
                    if (interaction) setSelectedInteraction(interaction);
                  }}
                  backgroundColor="transparent"
                />

                {/* Legend */}
                <div className="absolute bottom-3 left-3 flex gap-3 bg-slate-900/80 backdrop-blur-sm rounded-lg px-3 py-2 border border-slate-700">
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-red-500" />
                    <span className="text-xs text-slate-300">Major</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-amber-500" />
                    <span className="text-xs text-slate-300">Moderate</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-green-500" />
                    <span className="text-xs text-slate-300">Minor</span>
                  </div>
                </div>
              </div>
            )}

            {/* === Chemical Reaction Visualization (Freepik AI Generated) === */}
            {drugs.length >= 2 && interactions.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-6"
              >
                <div className="bg-gradient-to-br from-slate-900 via-purple-900/20 to-slate-900 rounded-xl border border-purple-500/30 overflow-hidden">
                  <div className="px-4 py-3 border-b border-purple-500/20 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-purple-500/20">
                        <Sparkles className="h-4 w-4 text-purple-400" />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-white">Chemical Reaction Formula</h3>
                        <p className="text-[10px] text-purple-300/70">AI-Generated Molecular Visualization</p>
                      </div>
                    </div>
                    {reactionImageLoading && (
                      <div className="flex items-center gap-2 text-xs text-purple-300">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Generating...
                      </div>
                    )}
                  </div>

                  <div className="p-4">
                    {reactionImageLoading ? (
                      <div className="flex flex-col items-center justify-center h-48 gap-3">
                        <div className="relative">
                          <div className="absolute inset-0 bg-purple-500/20 rounded-full animate-ping" />
                          <FlaskConical className="h-10 w-10 text-purple-400 relative z-10" />
                        </div>
                        <p className="text-sm text-purple-300/80">Generating chemical reaction diagram...</p>
                        <p className="text-xs text-slate-500">Using Gemini AI Image Generation</p>
                      </div>
                    ) : reactionImageUrl ? (
                      <div className="relative group">
                        <img
                          src={reactionImageUrl}
                          alt="Chemical Reaction Formula"
                          className="w-full h-auto max-h-80 object-contain rounded-lg bg-white/5"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-lg" />
                        <div className="absolute bottom-2 left-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <p className="text-xs text-white/80 text-center">
                            Chemical reaction between {drugs[0]} and {drugs[1]}
                          </p>
                        </div>
                      </div>
                    ) : reactionImageError ? (
                      <div className="flex flex-col items-center justify-center h-48 gap-3 text-center">
                        <div className="p-3 rounded-full bg-red-500/10">
                          <AlertTriangle className="h-8 w-8 text-red-400" />
                        </div>
                        <div>
                          <p className="text-sm text-red-400 font-medium">Image Generation Failed</p>
                          <p className="text-xs text-slate-500 mt-1 max-w-xs">
                            {reactionImageError.includes("FREEPIK")
                              ? "Please configure FREEPIK_API_KEY in backend .env file"
                              : reactionImageError}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-2 border-purple-500/50 text-purple-300 hover:bg-purple-500/20"
                          onClick={() => {
                            setReactionImageError(null);
                            // Re-trigger by updating a dependency
                          }}
                        >
                          <RefreshCw className="h-3 w-3 mr-1" />
                          Retry
                        </Button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-48 gap-3 text-center">
                        <div className="p-3 rounded-full bg-slate-700/50">
                          <ImageIcon className="h-8 w-8 text-slate-400" />
                        </div>
                        <p className="text-sm text-slate-400">Chemical reaction image will appear here</p>
                        <p className="text-xs text-slate-600">Add drugs with interactions to generate</p>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
            {/* ============================================================== */}

            {selectedInteraction && (
              <div className="mt-4 space-y-4">
                {/* Standard Interaction Card */}
                <InteractionCard
                  interaction={selectedInteraction}
                  onClose={() => {
                    setSelectedInteraction(null);
                    setEnhancedInteraction(null);
                  }}
                />

                {/* Enhanced Math Card (when available) */}
                <AnimatePresence>
                  {isLoadingEnhanced && (
                    <div className="flex items-center justify-center p-4 bg-slate-800/50 rounded-lg">
                      <Loader2 className="h-5 w-5 animate-spin text-cyan-400 mr-2" />
                      <span className="text-sm text-slate-400">Loading pharmacokinetic data...</span>
                    </div>
                  )}
                  {enhancedInteraction && !isLoadingEnhanced && (
                    <InteractionMathCard
                      interaction={enhancedInteraction}
                      onClose={() => setEnhancedInteraction(null)}
                    />
                  )}
                </AnimatePresence>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Drug Management */}
          <Card>
            <CardHeader>
              <CardTitle>Manage Drugs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <DrugSearchInput
                onAddDrug={addDrug}
                existingDrugs={drugs}
                isLoading={isLoading}
              />
              <DrugList
                drugs={drugs}
                onRemove={removeDrug}
                onSave={async (drug) => {
                  await saveDrug(drug);
                }}
              />
            </CardContent>
          </Card>

          {/* Interactions List */}
          {drugs.length >= 2 && (
            <Card>
              <CardHeader>
                <CardTitle>
                  Interactions ({interactions.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <InteractionList
                  interactions={interactions}
                  onSelect={setSelectedInteraction}
                  selectedInteraction={selectedInteraction}
                />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

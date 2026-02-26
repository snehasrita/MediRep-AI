"use client";

import { useCallback, useState, useRef } from "react";
import { Camera, Upload, Image as ImageIcon, X, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

interface PillUploadZoneProps {
  onFileSelect: (file: File) => void;
  disabled?: boolean;
}

export default function PillUploadZone({ onFileSelect, disabled }: PillUploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const file = e.dataTransfer.files[0];
      if (file && (file.type === "image/jpeg" || file.type === "image/png")) {
        onFileSelect(file);
      }
    },
    [onFileSelect]
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        onFileSelect(file);
      }
    },
    [onFileSelect]
  );

  const startCamera = async () => {
    setCameraError(null);
    setShowCamera(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Camera access error:", err);
      setCameraError("Could not access camera. Please use file upload instead.");
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setShowCamera(false);
    setCameraError(null);
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0);

    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], `pill-capture-${Date.now()}.jpg`, { type: "image/jpeg" });
        onFileSelect(file);
        stopCamera();
      }
    }, "image/jpeg", 0.9);
  };

  return (
    <>
      <motion.div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        animate={isDragging ? { scale: 1.02, borderColor: "rgb(59, 130, 246)" } : { scale: 1 }}
        transition={{ duration: 0.2 }}
        className={cn(
          "border-2 border-dashed rounded-lg p-12 text-center transition-all",
          disabled ? "border-muted bg-muted/20 cursor-not-allowed" : "border-border hover:border-primary/50 cursor-pointer",
          isDragging && "border-primary bg-primary/5"
        )}
      >
        <div className="flex flex-col items-center gap-4">
          <motion.div
            className="relative"
            animate={isDragging ? { y: -5 } : { y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <Camera className={cn("h-16 w-16 transition-colors", isDragging ? "text-primary" : "text-muted-foreground")} />
            <ImageIcon className="h-6 w-6 text-primary absolute -bottom-1 -right-1" />
          </motion.div>

          <div className="space-y-2">
            <h3 className="text-lg font-semibold">
              {isDragging ? "Drop your image here" : "Upload Pill Image"}
            </h3>
            <p className="text-sm text-muted-foreground max-w-md">
              Take a clear photo of the pill on a white background with good lighting.
              Make sure any text or imprint is visible.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              onClick={() => document.getElementById("pill-file-input")?.click()}
              disabled={disabled}
            >
              <Upload className="h-4 w-4 mr-2" />
              Choose File
            </Button>
            <Button
              variant="outline"
              onClick={startCamera}
              disabled={disabled}
            >
              <Video className="h-4 w-4 mr-2" />
              Use Camera
            </Button>
          </div>

          <input
            id="pill-file-input"
            type="file"
            accept="image/jpeg,image/png"
            capture="environment"
            onChange={handleFileInput}
            className="hidden"
            disabled={disabled}
          />

          <p className="text-xs text-muted-foreground">
            Supports JPEG and PNG (max 10MB)
          </p>
        </div>
      </motion.div>

      {/* Camera Modal */}
      <AnimatePresence>
        {showCamera && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
            onClick={stopCamera}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="relative bg-card rounded-xl overflow-hidden max-w-2xl w-full mx-4"
            >
              <div className="p-4 flex items-center justify-between border-b">
                <h3 className="font-semibold">Capture Pill Photo</h3>
                <Button variant="ghost" size="icon" onClick={stopCamera}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {cameraError ? (
                <div className="p-8 text-center">
                  <p className="text-destructive mb-4">{cameraError}</p>
                  <Button onClick={stopCamera}>Close</Button>
                </div>
              ) : (
                <div className="p-4 space-y-4">
                  <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-32 h-32 border-2 border-white/50 rounded-full" />
                    </div>
                  </div>

                  <div className="flex justify-center gap-4">
                    <Button variant="outline" onClick={stopCamera}>
                      Cancel
                    </Button>
                    <Button onClick={capturePhoto}>
                      <Camera className="h-4 w-4 mr-2" />
                      Capture Photo
                    </Button>
                  </div>

                  <p className="text-xs text-center text-muted-foreground">
                    Position the pill in the center circle and ensure good lighting
                  </p>
                </div>
              )}

              <canvas ref={canvasRef} className="hidden" />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

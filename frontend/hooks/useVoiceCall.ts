"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { sendMessage, synthesizeVoiceAudio, transcribeVoiceAudio } from "@/lib/api";

export type VoiceState = "idle" | "connecting" | "listening" | "processing" | "speaking" | "error";

interface VoiceMessage {
  role: "user" | "assistant";
  text: string;
  timestamp: number;
}

interface UseVoiceCallOptions {
  onTranscript?: (text: string) => void;
  onVoiceTurn?: (text: string) => Promise<string | null> | string | null;
}

declare global {
  type TranscriptAlternative = { transcript: string };
  type TranscriptResult = { isFinal: boolean; 0?: TranscriptAlternative };
  type SpeechRecognitionEventLike = {
    resultIndex: number;
    results: ArrayLike<TranscriptResult>;
  };
  type SpeechRecognitionErrorEventLike = { error?: string };
  type SpeechRecognitionLike = {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    onresult: ((event: SpeechRecognitionEventLike) => void) | null;
    onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
    onend: (() => void) | null;
    start: () => void;
    stop: () => void;
  };
  type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

  interface Window {
    webkitSpeechRecognition?: SpeechRecognitionCtor;
    SpeechRecognition?: SpeechRecognitionCtor;
  }
}

const SPEECH_CHUNK_MAX_CHARS = 900;
const BACKEND_TTS_CHUNK_MAX_CHARS = 340;
const BACKEND_STT_TIMESLICE_MS = 2200;
const BACKEND_STT_MIN_BLOB_BYTES = 2500;
const BACKEND_STT_MIN_AUDIO_LEVEL = 0.008;
const USE_BROWSER_STT = false;

function cleanForSpeech(raw: string): string {
  let text = (raw || "").trim();
  if (!text) return "";

  text = text.replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, "");
  text = text.replace(/tool_call:\s*\w+\s+params:\s*\{[^}]*\}/gi, "");
  text = text.replace(/\(\s*sources?\s*:\s*[^)]+\)/gi, "");
  text = text.replace(/\(\s*sources?\s+\d+[^)]*\)/gi, "");
  text = text.replace(/^[ \t]*sources?\s*:\s*.+$/gim, "");
  text = text.replace(/[【\[]\s*\d+\s*†\s*source\s*[】\]]/gi, "");
  text = text.replace(/[【\[]\s*\d+\s*†[^\]】]{0,80}[】\]]/g, "");
  text = text.replace(/https?:\/\/\S+/g, "");
  text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  text = text.replace(/`([^`]+)`/g, "$1");
  text = text.replace(/\*{1,2}([^*]+)\*{1,2}/g, "$1");
  text = text.replace(/#{1,3}\s*/g, "");
  text = text.replace(/\n+/g, " ");
  text = text.replace(/[ \t]{2,}/g, " ");
  text = text.replace(/\n{3,}/g, "\n\n");

  return text
    .split("\n")
    .filter((line) => line.trim() !== ".")
    .join("\n")
    .trim();
}

function splitForSpeech(text: string, maxChars: number = SPEECH_CHUNK_MAX_CHARS): string[] {
  const input = text.trim();
  if (!input) return [];
  if (input.length <= maxChars) return [input];

  const chunks: string[] = [];
  const sentences = input.split(/(?<=[.!?])\s+/);
  let current = "";

  for (const sentence of sentences) {
    const next = (current ? `${current} ${sentence}` : sentence).trim();
    if (next.length <= maxChars) {
      current = next;
      continue;
    }

    if (current) chunks.push(current);

    if (sentence.length <= maxChars) {
      current = sentence;
      continue;
    }

    let remaining = sentence.trim();
    while (remaining.length > maxChars) {
      let cut = remaining.lastIndexOf(" ", maxChars);
      if (cut < 40) cut = maxChars;
      chunks.push(remaining.slice(0, cut).trim());
      remaining = remaining.slice(cut).trim();
    }
    current = remaining;
  }

  if (current) chunks.push(current);
  return chunks;
}

export function useVoiceCall(options: UseVoiceCallOptions = {}) {
  const { onTranscript, onVoiceTurn } = options;

  const [state, setState] = useState<VoiceState>("idle");
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState<VoiceMessage[]>([]);
  const [currentTranscript, setCurrentTranscript] = useState("");
  const [duration, setDuration] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const levelTimerRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);

  const stateRef = useRef<VoiceState>("idle");
  const isConnectedRef = useRef(false);
  const shouldRestartRef = useRef(false);
  const sessionIdRef = useRef<string | null>(null);
  const transcribeBusyRef = useRef(false);
  const pendingTranscribeBlobRef = useRef<Blob | null>(null);
  const previousAudioChunkRef = useRef<Blob | null>(null);
  const lastTranscriptRef = useRef("");
  const lastTranscriptAtRef = useRef(0);
  const audioLevelRef = useRef(0);
  const sendDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    sessionIdRef.current = sessionStorage.getItem("current_chat_session_id");
  }, []);

  const updateState = useCallback((next: VoiceState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const stopSpeech = useCallback(() => {
    if (typeof window === "undefined") return;
    if (!("speechSynthesis" in window)) return;
    try {
      window.speechSynthesis.cancel();
    } catch {
      // ignore
    }
  }, []);

  const speakText = useCallback(async (raw: string) => {
    if (typeof window === "undefined") return;
    if (!("speechSynthesis" in window)) return;

    const cleaned = cleanForSpeech(raw);
    const chunks = splitForSpeech(cleaned, BACKEND_TTS_CHUNK_MAX_CHARS);
    if (chunks.length === 0) return;

    stopSpeech();
    updateState("speaking");
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice =
      voices.find((voice) => /en[-_]?in/i.test(voice.lang)) ||
      voices.find((voice) => /^en/i.test(voice.lang)) ||
      null;

    const playBackendAudio = async (blob: Blob) => {
      await new Promise<void>((resolve) => {
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.preload = "auto";
        const cleanup = () => {
          URL.revokeObjectURL(url);
          resolve();
        };
        audio.onended = cleanup;
        audio.onerror = cleanup;
        void audio.play().catch(cleanup);
      });
    };

    const speakWithBrowser = async (chunk: string) => {
      await new Promise<void>((resolve) => {
        const utterance = new SpeechSynthesisUtterance(chunk);
        if (preferredVoice) {
          utterance.voice = preferredVoice;
          utterance.lang = preferredVoice.lang;
        } else {
          utterance.lang = "en-IN";
        }
        utterance.rate = 0.98;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;

        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          resolve();
        };

        const timeoutId = window.setTimeout(finish, 30000);
        utterance.onend = () => {
          window.clearTimeout(timeoutId);
          finish();
        };
        utterance.onerror = () => {
          window.clearTimeout(timeoutId);
          finish();
        };

        try {
          window.speechSynthesis.speak(utterance);
        } catch {
          window.clearTimeout(timeoutId);
          finish();
        }
      });
    };

    const backendAudioChunks = await Promise.all(
      chunks.map(async (chunk) => {
        try {
          return await synthesizeVoiceAudio(chunk, "mp3");
        } catch {
          return null;
        }
      })
    );

    for (let i = 0; i < chunks.length; i++) {
      if (!isConnectedRef.current) break;
      const backendAudio = backendAudioChunks[i];
      if (backendAudio) {
        await playBackendAudio(backendAudio);
      } else {
        await speakWithBrowser(chunks[i]);
      }
    }
  }, [stopSpeech, updateState]);

  const startLevelMonitoring = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;

    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteFrequencyData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i];
      const normalized = sum / data.length / 255;
      audioLevelRef.current = normalized;
      setAudioLevel(normalized);
      levelTimerRef.current = requestAnimationFrame(tick);
    };

    tick();
  }, []);

  const stopLevelMonitoring = useCallback(() => {
    if (levelTimerRef.current) {
      cancelAnimationFrame(levelTimerRef.current);
      levelTimerRef.current = null;
    }
    setAudioLevel(0);
  }, []);

  const stopRecognition = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    try {
      recognition.stop();
    } catch {
      // ignore
    }
  }, []);

  const stopBackendRecorder = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;
    try {
      if (recorder.state !== "inactive") recorder.stop();
    } catch {
      // ignore
    }
    mediaRecorderRef.current = null;
  }, []);

  const startRecognition = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition || !isConnectedRef.current || !shouldRestartRef.current) return false;

    try {
      recognition.start();
      return true;
    } catch (error) {
      if (error instanceof DOMException && error.name === "InvalidStateError") {
        return true;
      }
      setErrorMessage("Speech recognition could not start. Try Chrome or Edge and allow microphone access.");
      updateState("error");
      return false;
    }
  }, [updateState]);

  const cleanupAudio = useCallback(() => {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;

    if (audioContextRef.current?.state !== "closed") {
      audioContextRef.current?.close();
    }
    audioContextRef.current = null;
    analyserRef.current = null;
  }, []);

  const handleFinalTranscript = useCallback(async (text: string) => {
    const transcript = text.trim();
    if (!transcript || !isConnectedRef.current) return;

    setMessages((prev) => [...prev, { role: "user", text: transcript, timestamp: Date.now() }]);
    setCurrentTranscript("");
    updateState("processing");
    onTranscript?.(transcript);

    try {
      let assistantText = "";

      if (onVoiceTurn) {
        assistantText = ((await onVoiceTurn(transcript)) || "").trim();
      } else {
        const response = await sendMessage(
          transcript,
          undefined,
          undefined,
          sessionIdRef.current || undefined,
          false,
          undefined,
          undefined,
          true
        );

        if (response.session_id) {
          sessionIdRef.current = response.session_id;
          sessionStorage.setItem("current_chat_session_id", response.session_id);
        }

        assistantText = (response.response || "").trim();
      }

      const safeText = assistantText || "I couldn't generate a response right now.";
      setMessages((prev) => [...prev, { role: "assistant", text: safeText, timestamp: Date.now() }]);
      await speakText(safeText);
    } catch {
      const fallback = "I couldn't process that right now. Please try again.";
      setMessages((prev) => [...prev, { role: "assistant", text: fallback, timestamp: Date.now() }]);
      await speakText(fallback);
    } finally {
      if (isConnectedRef.current) {
        updateState("listening");
        startRecognition();
      }
    }
  }, [onTranscript, onVoiceTurn, speakText, startRecognition, updateState]);

  const processBackendAudioChunk = useCallback(async (blob: Blob) => {
    if (!isConnectedRef.current) return;
    if (stateRef.current !== "listening") return;
    if (transcribeBusyRef.current) {
      pendingTranscribeBlobRef.current = blob;
      return;
    }
    if (blob.size < BACKEND_STT_MIN_BLOB_BYTES) return;

    transcribeBusyRef.current = true;
    try {
      const transcript = (await transcribeVoiceAudio(blob, "auto")).trim();
      if (!transcript || transcript.length < 3) return;

      const normalized = transcript
        .toLowerCase()
        .replace(/[^\w\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (!normalized) return;
      const now = Date.now();
      const previous = lastTranscriptRef.current;
      const isRepeat =
        normalized === previous ||
        (previous && normalized.includes(previous)) ||
        (previous && previous.includes(normalized));
      if (isRepeat && (now - lastTranscriptAtRef.current) < 7000) return;
      lastTranscriptRef.current = normalized;
      lastTranscriptAtRef.current = now;

      await handleFinalTranscript(transcript);
    } catch {
      // Backend STT failed — don't kill the voice call.
      // Browser STT (if available) continues working independently.
    } finally {
      transcribeBusyRef.current = false;
      const pending = pendingTranscribeBlobRef.current;
      pendingTranscribeBlobRef.current = null;
      if (pending && isConnectedRef.current && stateRef.current === "listening") {
        void processBackendAudioChunk(pending);
      }
    }
  }, [handleFinalTranscript]);

  const startBackendRecorder = useCallback(() => {
    const stream = mediaStreamRef.current;
    if (!stream || !isConnectedRef.current) return false;
    if (typeof MediaRecorder === "undefined") return false;

    stopBackendRecorder();

    const mimeCandidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
      "audio/ogg;codecs=opus",
    ];

    let mimeType: string | undefined;
    for (const candidate of mimeCandidates) {
      if (MediaRecorder.isTypeSupported(candidate)) {
        mimeType = candidate;
        break;
      }
    }

    let recorder: MediaRecorder;
    try {
      recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    } catch {
      return false;
    }

    recorder.ondataavailable = (event: BlobEvent) => {
      if (!event.data || event.data.size <= 0) return;
      // Use overlap window (previous + current chunk) for better word-boundary recognition.
      const previous = previousAudioChunkRef.current;
      previousAudioChunkRef.current = event.data;
      if (!previous) return;

      // Skip obvious silence windows early to reduce noisy transcribe calls.
      if (audioLevelRef.current < BACKEND_STT_MIN_AUDIO_LEVEL) return;

      const combined = new Blob([previous, event.data], {
        type: event.data.type || "audio/webm",
      });
      void processBackendAudioChunk(combined);
    };

    recorder.onerror = () => {
      if (!isConnectedRef.current) return;
      setErrorMessage("Backend voice recorder failed. Try reconnecting.");
      updateState("error");
    };

    try {
      recorder.start(BACKEND_STT_TIMESLICE_MS);
      mediaRecorderRef.current = recorder;
      return true;
    } catch {
      return false;
    }
  }, [processBackendAudioChunk, stopBackendRecorder, updateState]);

  const connect = useCallback(async () => {
    if (isConnectedRef.current) return;

    setErrorMessage("");
    updateState("connecting");

    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorMessage("Microphone access is not available in this browser/context.");
      updateState("error");
      return;
    }

    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: { ideal: 1 },
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }

      mediaStreamRef.current = stream;

      const audioContext = new AudioContext({
        latencyHint: "interactive",
      });
      audioContextRef.current = audioContext;

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      const SpeechRecognition = USE_BROWSER_STT
        ? (window.SpeechRecognition || window.webkitSpeechRecognition) as SpeechRecognitionCtor | undefined
        : undefined;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = "en-IN";

        recognition.onresult = (event: SpeechRecognitionEventLike) => {
          if (!isConnectedRef.current) return;
          if (stateRef.current !== "listening") return;

          let fullFinal = "";
          let hasInterim = false;
          let display = "";

          for (let i = 0; i < event.results.length; i++) {
            const result = event.results[i];
            const piece = result?.[0]?.transcript?.trim() || "";
            if (!piece) continue;
            display += `${piece} `;
            if (result.isFinal) {
              fullFinal += `${piece} `;
            } else {
              hasInterim = true;
            }
          }

          // Show live transcript as the user speaks
          if (display.trim()) setCurrentTranscript(display.trim());

          // Clear any pending send timer
          if (sendDebounceRef.current) {
            clearTimeout(sendDebounceRef.current);
            sendDebounceRef.current = null;
          }

          // Only send after 1.5s of silence (all results final, no interim speech)
          if (fullFinal.trim() && !hasInterim) {
            sendDebounceRef.current = setTimeout(() => {
              sendDebounceRef.current = null;
              if (!isConnectedRef.current) return;
              if (stateRef.current !== "listening") return;
              const text = fullFinal.trim();
              if (!text) return;
              stopRecognition();
              void handleFinalTranscript(text);
            }, 1500);
          }
        };

        recognition.onerror = () => {
          // Browser STT is optional now; backend STT remains active.
        };

        recognition.onend = () => {
          if (!isConnectedRef.current) return;
          if (!shouldRestartRef.current) return;
          if (stateRef.current === "speaking" || stateRef.current === "processing") return;
          startRecognition();
        };

        recognitionRef.current = recognition;
      } else {
        recognitionRef.current = null;
      }

      isConnectedRef.current = true;
      shouldRestartRef.current = true;
      previousAudioChunkRef.current = null;
      pendingTranscribeBlobRef.current = null;
      setIsConnected(true);
      setDuration(0);
      updateState("listening");
      startLevelMonitoring();

      const backendRecorderStarted = startBackendRecorder();
      if (!backendRecorderStarted) {
        setErrorMessage("Backend recording is not supported in this browser.");
        shouldRestartRef.current = false;
        isConnectedRef.current = false;
        setIsConnected(false);
        stopLevelMonitoring();
        cleanupAudio();
        recognitionRef.current = null;
        updateState("error");
        return;
      }

      const started = startRecognition();
      if (!started && !recognitionRef.current) {
        // No browser STT path available; backend STT recorder handles transcript capture.
        updateState("listening");
      }
    } catch (error) {
      const message =
        error instanceof DOMException
          ? error.name === "NotAllowedError"
            ? "Microphone permission denied. Allow access and retry."
            : error.name === "NotFoundError"
              ? "No microphone device found."
              : error.name === "NotReadableError"
                ? "Microphone is busy in another app. Close that app and retry."
                : "Voice setup failed on this device/browser."
          : "Voice setup failed on this device/browser.";
      setErrorMessage(message);
      updateState("error");
    }
  }, [cleanupAudio, handleFinalTranscript, startBackendRecorder, startLevelMonitoring, startRecognition, stopLevelMonitoring, stopRecognition, updateState]);

  const disconnect = useCallback(() => {
    shouldRestartRef.current = false;
    isConnectedRef.current = false;

    if (sendDebounceRef.current) {
      clearTimeout(sendDebounceRef.current);
      sendDebounceRef.current = null;
    }

    stopRecognition();
    stopBackendRecorder();
    stopSpeech();
    stopLevelMonitoring();
    cleanupAudio();

    recognitionRef.current = null;
    previousAudioChunkRef.current = null;
    pendingTranscribeBlobRef.current = null;

    setIsConnected(false);
    setDuration(0);
    setCurrentTranscript("");
    setErrorMessage("");
    updateState("idle");
  }, [cleanupAudio, stopBackendRecorder, stopLevelMonitoring, stopRecognition, stopSpeech, updateState]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setCurrentTranscript("");
  }, []);

  useEffect(() => {
    if (!isConnected) {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    timerRef.current = window.setInterval(() => {
      setDuration((value) => value + 1);
    }, 1000);

    return () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isConnected]);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    state,
    isConnected,
    messages,
    currentTranscript,
    duration,
    audioLevel,
    errorMessage,
    connect,
    disconnect,
    clearMessages,
  };
}

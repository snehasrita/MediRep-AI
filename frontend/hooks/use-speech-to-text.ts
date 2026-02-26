"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface UseSpeechToTextProps {
    continuous?: boolean;
    interimResults?: boolean;
    lang?: string;
}

export function useSpeechToText({
    continuous = true,
    interimResults = true,
    lang = "en-US"
}: UseSpeechToTextProps = {}) {
    const [isListening, setIsListening] = useState(false);
    const [transcript, setTranscript] = useState("");
    const [interimTranscript, setInterimTranscript] = useState("");
    const [error, setError] = useState<string | null>(null);

    const recognitionRef = useRef<any>(null);

    useEffect(() => {
        if (typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window)) {
            const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
            recognitionRef.current = new SpeechRecognition();
            recognitionRef.current.continuous = continuous;
            recognitionRef.current.interimResults = interimResults;
            recognitionRef.current.lang = lang;

            recognitionRef.current.onresult = (event: any) => {
                let finalTranscript = "";
                let currentInterimTranscript = "";

                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) {
                        finalTranscript += event.results[i][0].transcript;
                    } else {
                        currentInterimTranscript += event.results[i][0].transcript;
                    }
                }

                if (finalTranscript) {
                    setTranscript((prev) => prev + finalTranscript);
                }
                setInterimTranscript(currentInterimTranscript);
            };

            recognitionRef.current.onerror = (event: any) => {
                console.error("Speech recognition error", event.error);
                setError(event.error);
                setIsListening(false);
            };

            recognitionRef.current.onend = () => {
                setIsListening(false);
            };
        } else {
            setError("Speech recognition is not supported in this browser.");
        }

        return () => {
            if (recognitionRef.current) {
                recognitionRef.current.stop();
            }
        };
    }, [continuous, interimResults, lang]);

    const startListening = useCallback(() => {
        if (recognitionRef.current && !isListening) {
            try {
                setTranscript("");
                setInterimTranscript("");
                setError(null);
                recognitionRef.current.start();
                setIsListening(true);
            } catch (err) {
                console.error("Failed to start speech recognition", err);
            }
        }
    }, [isListening]);

    const stopListening = useCallback(() => {
        if (recognitionRef.current && isListening) {
            try {
                recognitionRef.current.stop();
                setIsListening(false);
            } catch (err) {
                console.error("Failed to stop speech recognition", err);
            }
        }
    }, [isListening]);

    const resetTranscript = useCallback(() => {
        setTranscript("");
        setInterimTranscript("");
    }, []);

    return {
        isListening,
        transcript,
        interimTranscript,
        startListening,
        stopListening,
        error,
        resetTranscript,
        hasSupport: typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window)
    };
}

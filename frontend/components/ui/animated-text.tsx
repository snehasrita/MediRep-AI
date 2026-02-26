"use client";

import { animate } from "framer-motion";
import { useEffect, useRef, useState } from "react";

export function useAnimatedText(
  text: string,
  delimiter: string = "",
  enabled: boolean = true
) {
  const [cursor, setCursor] = useState(0);
  const [startingCursor, setStartingCursor] = useState(0);
  const prevTextRef = useRef(text);

  useEffect(() => {
    const prevText = prevTextRef.current;
    if (prevText !== text) {
      setStartingCursor(text.startsWith(prevText) ? cursor : 0);
      prevTextRef.current = text;
    }
  }, [text, cursor]);

  useEffect(() => {
    if (!enabled) {
      setCursor(text.split(delimiter).length);
      return;
    }
    const parts = text.split(delimiter);
    const duration =
      delimiter === ""
        ? 6 // Character animation (faster)
        : delimiter === " "
          ? 3 // Word animation (faster)
          : 1.5; // Chunk animation (faster)

    const controls = animate(startingCursor, parts.length, {
      duration,
      ease: "easeOut",
      onUpdate(latest) {
        setCursor(Math.floor(latest));
      },
    });

    return () => controls.stop();
  }, [enabled, startingCursor, text, delimiter]);

  if (!enabled) {
    return text;
  }

  return text.split(delimiter).slice(0, cursor).join(delimiter);
}

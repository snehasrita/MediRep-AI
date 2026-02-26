"use client";

import React, {
  forwardRef,
  useEffect,
  useMemo,
  useRef,
  type HTMLAttributes,
  type RefObject,
} from "react";
import { motion } from "framer-motion";

import { cn } from "@/lib/utils";

type Callback = () => void;

function useAnimationFrame(callback: Callback) {
  useEffect(() => {
    let id: number;
    const loop = () => {
      callback();
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [callback]);
}

function useMousePositionRef(containerRef: RefObject<HTMLElement | null>) {
  const positionRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const update = (x: number, y: number) => {
      const el = containerRef?.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        positionRef.current = { x: x - rect.left, y: y - rect.top };
      } else {
        positionRef.current = { x, y };
      }
    };

    const onMouse = (ev: MouseEvent) => update(ev.clientX, ev.clientY);
    const onTouch = (ev: TouchEvent) => {
      const t = ev.touches[0];
      if (!t) return;
      update(t.clientX, t.clientY);
    };

    window.addEventListener("mousemove", onMouse, { passive: true });
    window.addEventListener("touchmove", onTouch, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMouse);
      window.removeEventListener("touchmove", onTouch);
    };
  }, [containerRef]);

  return positionRef;
}

interface ParsedAxis {
  axis: string;
  fromValue: number;
  toValue: number;
}

function parseFontVariationSettings(settingsStr: string): Map<string, number> {
  return new Map(
    settingsStr
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        const [name, value] = s.split(" ");
        return [name.replace(/['"]/g, ""), Number.parseFloat(value)];
      })
  );
}

function calculateFalloff(distance: number, radius: number, falloff: VariableProximityProps["falloff"]) {
  const norm = Math.min(Math.max(1 - distance / radius, 0), 1);
  switch (falloff) {
    case "exponential":
      return norm ** 2;
    case "gaussian":
      return Math.exp(-((distance / (radius / 2)) ** 2) / 2);
    case "linear":
    default:
      return norm;
  }
}

export interface VariableProximityProps extends HTMLAttributes<HTMLSpanElement> {
  label: string;
  fromFontVariationSettings: string;
  toFontVariationSettings: string;
  containerRef: RefObject<HTMLElement | null>;
  radius?: number;
  falloff?: "linear" | "exponential" | "gaussian";
  className?: string;
  onClick?: () => void;
  style?: React.CSSProperties;
  /**
   * Optional: provide a variable font family to maximize the effect.
   * If not provided, we fall back to the app's display font.
   */
  fontFamily?: string;
}

const VariableProximity = forwardRef<HTMLSpanElement, VariableProximityProps>((props, ref) => {
  const {
    label,
    fromFontVariationSettings,
    toFontVariationSettings,
    containerRef,
    radius = 90,
    falloff = "linear",
    className,
    onClick,
    style,
    fontFamily,
    ...rest
  } = props;

  const letterRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const interpolatedSettingsRef = useRef<string[]>([]);
  const mousePositionRef = useMousePositionRef(containerRef);
  const lastPositionRef = useRef<{ x: number | null; y: number | null }>({ x: null, y: null });

  const parsedSettings: ParsedAxis[] = useMemo(() => {
    const fromMap = parseFontVariationSettings(fromFontVariationSettings);
    const toMap = parseFontVariationSettings(toFontVariationSettings);
    return Array.from(fromMap.entries()).map(([axis, fromValue]) => ({
      axis,
      fromValue,
      toValue: toMap.get(axis) ?? fromValue,
    }));
  }, [fromFontVariationSettings, toFontVariationSettings]);

  useAnimationFrame(() => {
    const host = containerRef?.current;
    if (!host) return;
    const { x, y } = mousePositionRef.current;
    if (lastPositionRef.current.x === x && lastPositionRef.current.y === y) return;
    lastPositionRef.current = { x, y };

    const hostRect = host.getBoundingClientRect();

    letterRefs.current.forEach((letterRef, index) => {
      if (!letterRef) return;

      const rect = letterRef.getBoundingClientRect();
      const cx = rect.left + rect.width / 2 - hostRect.left;
      const cy = rect.top + rect.height / 2 - hostRect.top;
      const dist = Math.hypot(x - cx, y - cy);

      if (dist >= radius) {
        letterRef.style.fontVariationSettings = fromFontVariationSettings;
        letterRef.style.transform = "";
        return;
      }

      const f = calculateFalloff(dist, radius, falloff);
      const newSettings = parsedSettings
        .map(({ axis, fromValue, toValue }) => `'${axis}' ${fromValue + (toValue - fromValue) * f}`)
        .join(", ");

      interpolatedSettingsRef.current[index] = newSettings;
      letterRef.style.fontVariationSettings = newSettings;

      // Fallback visual even if the font isn't variable: subtle scale.
      const scale = 1 + f * 0.12;
      letterRef.style.transform = `translateZ(0) scale(${scale.toFixed(3)})`;
    });
  });

  const words = label.split(" ");
  let letterIndex = 0;

  return (
    <span
      ref={ref}
      className={cn("inline", className)}
      onClick={onClick}
      style={{
        display: "inline",
        fontFamily: fontFamily ?? "var(--font-display), system-ui, sans-serif",
        ...style,
      }}
      {...rest}
    >
      {words.map((word, wordIndex) => (
        <span key={wordIndex} style={{ display: "inline-block", whiteSpace: "nowrap" }}>
          {word.split("").map((letter) => {
            const currentLetterIndex = letterIndex++;
            return (
              <motion.span
                key={currentLetterIndex}
                ref={(el) => {
                  letterRefs.current[currentLetterIndex] = el;
                }}
                style={{
                  display: "inline-block",
                  fontVariationSettings: interpolatedSettingsRef.current[currentLetterIndex],
                }}
                aria-hidden="true"
              >
                {letter}
              </motion.span>
            );
          })}
          {wordIndex < words.length - 1 ? (
            <span style={{ display: "inline-block" }}>&nbsp;</span>
          ) : null}
        </span>
      ))}
      <span className="sr-only">{label}</span>
    </span>
  );
});

VariableProximity.displayName = "VariableProximity";
export default VariableProximity;

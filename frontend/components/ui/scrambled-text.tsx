"use client";

import React, { useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Brutal truth:
 * The original "React Bits" ScrambledText uses GSAP's SplitText + ScrambleTextPlugin,
 * which are Club GSAP (paid) plugins and will crash in a typical OSS install.
 *
 * This component recreates the same feel without paid plugins:
 * - Splits text into spans
 * - On pointer proximity, temporarily scrambles chars and eases back to original
 */
export interface ScrambledTextProps {
  radius?: number;
  duration?: number; // seconds
  speed?: number; // 0..1 scramble intensity
  scrambleChars?: string;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

type CharState = {
  el: HTMLSpanElement;
  original: string;
  until: number; // timestamp ms
};

export default function ScrambledText({
  radius = 110,
  duration = 0.9,
  speed = 0.35,
  scrambleChars = ".:",
  className,
  style,
  children,
}: ScrambledTextProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const charRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const activeRef = useRef<Map<number, CharState>>(new Map());
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const rafRef = useRef<number | null>(null);

  const text = useMemo(() => {
    if (typeof children === "string") return children;
    // Keep it simple: this component is for string content. If non-string,
    // render as-is without effects.
    return null;
  }, [children]);

  const chars = useMemo(() => {
    if (text == null) return [];
    return Array.from(text);
  }, [text]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || text == null) return;

    const pick = (set: string) => set[Math.floor(Math.random() * set.length)] ?? "";

    const stop = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      root.style.transform = "";
      for (const s of activeRef.current.values()) s.el.textContent = s.original;
      activeRef.current.clear();
      pointerRef.current = null;
    };

    const tick = () => {
      const now = Date.now();
      const totalMs = Math.max(1, duration * 1000);

      for (const [idx, s] of activeRef.current.entries()) {
        const remaining = s.until - now;
        if (remaining <= 0) {
          s.el.textContent = s.original;
          activeRef.current.delete(idx);
          continue;
        }

        const progress = 1 - remaining / totalMs; // 0 -> 1
        const o = s.original;
        if (!o) continue;

        if (o === " ") {
          s.el.textContent = "\u00A0";
          continue;
        }

        // Readability-first: always settle back to original in the last ~25%.
        if (progress >= 0.75) {
          s.el.textContent = o;
          continue;
        }

        const scrambleChance = Math.max(0, Math.min(1, speed)) * (1 - progress);
        s.el.textContent = Math.random() < scrambleChance ? pick(scrambleChars) : o;
      }

      // Keep a subtle parallax while the user interacts (but never on idle).
      const p = pointerRef.current;
      if (p) {
        const r = root.getBoundingClientRect();
        const rx = ((p.x - (r.left + r.width / 2)) / r.width) * 6;
        const ry = ((p.y - (r.top + r.height / 2)) / r.height) * 5;
        root.style.transform = `translate3d(${rx.toFixed(2)}px, ${ry.toFixed(2)}px, 0)`;
      }

      if (activeRef.current.size > 0) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
        root.style.transform = "";
      }
    };

    const activateNearPointer = (x: number, y: number) => {
      const now = Date.now();
      const totalMs = Math.max(1, duration * 1000);

      for (let i = 0; i < charRefs.current.length; i++) {
        const el = charRefs.current[i];
        if (!el) continue;

        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const dist = Math.hypot(x - cx, y - cy);

        if (dist > radius) continue;
        const o = el.dataset.original ?? el.textContent ?? "";
        if (!o || o === " ") continue;

        const strength = 1 - dist / radius;
        // One activation per move: do not extend indefinitely or the text never settles.
        const until = now + totalMs * strength;
        activeRef.current.set(i, { el, original: o, until });
      }

      if (rafRef.current == null && activeRef.current.size > 0) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      pointerRef.current = { x: e.clientX, y: e.clientY };
      activateNearPointer(e.clientX, e.clientY);
    };

    root.addEventListener("pointermove", onPointerMove, { passive: true });
    root.addEventListener("pointerleave", stop);

    return () => {
      root.removeEventListener("pointermove", onPointerMove);
      root.removeEventListener("pointerleave", stop);
      stop();
    };
  }, [radius, duration, speed, scrambleChars, text]);

  if (text == null) {
    return (
      <div className={cn("max-w-3xl", className)} style={style}>
        {children}
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className={cn(
        "max-w-3xl rounded-3xl border p-6 backdrop-blur",
        "transition-transform duration-200 will-change-transform",
        className
      )}
      style={{
        ...style,
        borderColor: "var(--landing-border)",
        backgroundColor: "var(--landing-card)",
        color: "var(--landing-muted)",
      }}
    >
      <p className="text-pretty font-mono text-[clamp(14px,2.2vw,18px)] leading-relaxed">
        {chars.map((c, i) => (
          <span
            key={i}
            ref={(el) => {
              charRefs.current[i] = el;
            }}
            className="inline-block will-change-transform"
            data-original={c}
          >
            {c === " " ? "\u00A0" : c}
          </span>
        ))}
      </p>
    </div>
  );
}

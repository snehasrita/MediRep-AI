"use client";

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";
import {
  AnimatePresence,
  motion,
  type Target,
  type TargetAndTransition,
  type Transition,
  type VariantLabels,
} from "framer-motion";

import { cn } from "@/lib/utils";

export interface RotatingTextRef {
  next: () => void;
  previous: () => void;
  jumpTo: (index: number) => void;
  reset: () => void;
}

export interface RotatingTextProps
  extends Omit<React.ComponentPropsWithoutRef<"span">, "children"> {
  texts: string[];
  transition?: Transition;
  initial?: boolean | Target | VariantLabels;
  animate?: boolean | VariantLabels | TargetAndTransition;
  exit?: Target | VariantLabels;
  rotationInterval?: number;
  staggerDuration?: number;
  staggerFrom?: "first" | "last" | "center" | "random" | number;
  loop?: boolean;
  auto?: boolean;
  splitBy?: "characters" | "words" | "lines" | string;
  onNext?: (index: number) => void;
  mainClassName?: string;
  splitLevelClassName?: string;
  elementLevelClassName?: string;
  mode?: "sync" | "wait";
}

function splitIntoGraphemes(text: string): string[] {
  // Handles emojis/combined glyphs better when available.
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const seg = new Intl.Segmenter("en", { granularity: "grapheme" });
    return Array.from(seg.segment(text), (s) => s.segment);
  }
  return Array.from(text);
}

const RotatingText = forwardRef<RotatingTextRef, RotatingTextProps>(
  (props, ref) => {
    const {
      texts,
      transition = { type: "spring", damping: 25, stiffness: 320 },
      initial = { y: "100%", opacity: 0 },
      animate = { y: 0, opacity: 1 },
      exit = { y: "-120%", opacity: 0 },
      rotationInterval = 2200,
      staggerDuration = 0.03,
      staggerFrom = "first",
      loop = true,
      auto = true,
      splitBy = "characters",
      onNext,
      mainClassName,
      splitLevelClassName,
      elementLevelClassName,
      mode = "wait",
      className,
      ...rest
    } = props;

    const [currentTextIndex, setCurrentTextIndex] = useState(0);

    const elements = useMemo(() => {
      const currentText = texts[currentTextIndex] ?? "";
      if (splitBy === "characters") {
        const words = currentText.split(" ");
        return words.map((word, i) => ({
          characters: splitIntoGraphemes(word),
          needsSpace: i !== words.length - 1,
        }));
      }
      if (splitBy === "words") {
        return currentText.split(" ").map((word, i, arr) => ({
          characters: [word],
          needsSpace: i !== arr.length - 1,
        }));
      }
      if (splitBy === "lines") {
        return currentText.split("\n").map((line, i, arr) => ({
          characters: [line],
          needsSpace: i !== arr.length - 1,
        }));
      }
      return currentText.split(splitBy).map((part, i, arr) => ({
        characters: [part],
        needsSpace: i !== arr.length - 1,
      }));
    }, [texts, currentTextIndex, splitBy]);

    const getStaggerDelay = useCallback(
      (index: number, total: number): number => {
        if (staggerFrom === "first") return index * staggerDuration;
        if (staggerFrom === "last") return (total - 1 - index) * staggerDuration;
        if (staggerFrom === "center") {
          const center = Math.floor(total / 2);
          return Math.abs(center - index) * staggerDuration;
        }
        if (staggerFrom === "random") {
          const rand = Math.floor(Math.random() * total);
          return Math.abs(rand - index) * staggerDuration;
        }
        return Math.abs((staggerFrom as number) - index) * staggerDuration;
      },
      [staggerFrom, staggerDuration]
    );

    const handleIndexChange = useCallback(
      (idx: number) => {
        setCurrentTextIndex(idx);
        onNext?.(idx);
      },
      [onNext]
    );

    const next = useCallback(() => {
      const nextIndex =
        currentTextIndex === texts.length - 1
          ? loop
            ? 0
            : currentTextIndex
          : currentTextIndex + 1;
      if (nextIndex !== currentTextIndex) handleIndexChange(nextIndex);
    }, [currentTextIndex, texts.length, loop, handleIndexChange]);

    const previous = useCallback(() => {
      const prevIndex =
        currentTextIndex === 0
          ? loop
            ? texts.length - 1
            : currentTextIndex
          : currentTextIndex - 1;
      if (prevIndex !== currentTextIndex) handleIndexChange(prevIndex);
    }, [currentTextIndex, texts.length, loop, handleIndexChange]);

    const jumpTo = useCallback(
      (index: number) => {
        const valid = Math.max(0, Math.min(index, texts.length - 1));
        if (valid !== currentTextIndex) handleIndexChange(valid);
      },
      [texts.length, currentTextIndex, handleIndexChange]
    );

    const reset = useCallback(() => {
      if (currentTextIndex !== 0) handleIndexChange(0);
    }, [currentTextIndex, handleIndexChange]);

    useImperativeHandle(ref, () => ({ next, previous, jumpTo, reset }), [
      next,
      previous,
      jumpTo,
      reset,
    ]);

    useEffect(() => {
      if (!auto) return;
      const id = setInterval(next, rotationInterval);
      return () => clearInterval(id);
    }, [next, rotationInterval, auto]);

    const totalChars = elements.reduce((sum, w) => sum + w.characters.length, 0);

    return (
      <span
        className={cn(
          "relative inline-flex flex-wrap items-baseline",
          mainClassName,
          className
        )}
        {...rest}
      >
        <span className="sr-only">{texts[currentTextIndex]}</span>
        <AnimatePresence mode={mode} initial={false}>
          <motion.span
            key={currentTextIndex}
            className={cn(splitBy === "lines" ? "flex w-full flex-col" : "inline-flex flex-wrap")}
            aria-hidden="true"
          >
            {elements.map((word, wordIndex, arr) => {
              const previousChars = arr
                .slice(0, wordIndex)
                .reduce((sum, w) => sum + w.characters.length, 0);
              return (
                <span key={wordIndex} className={cn("inline-flex", splitLevelClassName)}>
                  {word.characters.map((char, charIndex) => (
                    <motion.span
                      key={`${wordIndex}-${charIndex}`}
                      initial={initial}
                      animate={animate}
                      exit={exit}
                      transition={{
                        ...transition,
                        delay: getStaggerDelay(previousChars + charIndex, totalChars),
                      }}
                      className={cn("inline-block", elementLevelClassName)}
                    >
                      {char}
                    </motion.span>
                  ))}
                  {word.needsSpace ? <span className="inline-block">&nbsp;</span> : null}
                </span>
              );
            })}
          </motion.span>
        </AnimatePresence>
      </span>
    );
  }
);

RotatingText.displayName = "RotatingText";
export default RotatingText;

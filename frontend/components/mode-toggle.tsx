"use client";

import { AnimatedThemeToggle } from "@/components/ui/animated-theme-toggle";

/**
 * Keep the existing import path (`@/components/mode-toggle`) used across the app,
 * but render the newer animated toggle (wired to next-themes).
 */
export function ModeToggle() {
  return <AnimatedThemeToggle />;
}


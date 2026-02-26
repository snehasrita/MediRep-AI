"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Bot } from "lucide-react"
import { motion } from "framer-motion"

export interface ChatLoadingProps {
  className?: string
  label?: string
}

export function ChatLoading({ className, label }: ChatLoadingProps) {
  return (
    <div className={cn("px-4 py-3", className)}>
      <div className="flex gap-3 max-w-[95%] md:max-w-[85%]">
        {/* AI Avatar */}
        <div className="shrink-0 mt-1">
          <div className="h-8 w-8 rounded-xl bg-[color:var(--landing-moss)] flex items-center justify-center shadow-sm">
            <Bot className="h-4 w-4 text-white" />
          </div>
        </div>

        {/* Loading Content */}
        <div className="flex-1 min-w-0">
          <div className="bg-zinc-100 dark:bg-zinc-900 rounded-2xl rounded-tl-md px-4 py-4 shadow-sm border border-zinc-200/50 dark:border-zinc-800 inline-block">
            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    className="w-2 h-2 bg-[color:var(--landing-moss)] rounded-full"
                    animate={{
                      scale: [1, 1.3, 1],
                      opacity: [0.4, 1, 0.4],
                    }}
                    transition={{
                      duration: 0.8,
                      repeat: Infinity,
                      delay: i * 0.15,
                      ease: "easeInOut",
                    }}
                  />
                ))}
              </div>
              {label && (
                <span className="text-sm text-zinc-500 dark:text-zinc-400 ml-1">{label}</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

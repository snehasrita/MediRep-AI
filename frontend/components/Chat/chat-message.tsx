"use client"

import * as React from "react"
import { Bot } from "lucide-react"
import { cn } from "@/lib/utils"
import { Message } from "@/types"
import Markdown from "react-markdown"
import { motion } from "framer-motion"
import { useAnimatedText } from "@/components/ui/animated-text"
import remarkGfm from "remark-gfm"
import { ReimbursementCard } from "./ReimbursementCard"
import { EvidencePanel } from "./EvidencePanel"

export interface ChatMessageProps {
  message: Message
  index: number
  isNewMessage?: boolean
}

export function ChatMessage({ message, index, isNewMessage = false }: ChatMessageProps) {
  const isUser = message.role === "user"
  const shouldAnimate = !isUser && isNewMessage
  const animatedContent = useAnimatedText(message.content, " ", shouldAnimate)
  const renderedContent = isUser ? message.content : animatedContent

  if (isUser) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="flex justify-end px-4 py-3"
      >
        <div className="max-w-[85%] md:max-w-[70%] flex flex-col gap-2 items-end">
          {message.images && message.images.length > 0 && (
            <div className="flex flex-wrap gap-2 justify-end">
              {message.images.map((img, idx) => (
                <div key={idx} className="relative w-40 h-40 rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-700 shadow-sm bg-zinc-100 dark:bg-zinc-800">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img} alt="User upload" className="object-cover w-full h-full" />
                </div>
              ))}
            </div>
          )}
          <div className="bg-[color:var(--landing-clay)] text-white px-4 py-3 rounded-2xl rounded-br-md shadow-sm">
            <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{renderedContent}</p>
          </div>
        </div>
      </motion.div>
    )
  }

  const track2 = message.track2

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: 0.05 }}
      className="px-4 py-3"
    >
      <div className="flex gap-3 max-w-[95%] md:max-w-[85%]">
        {/* AI Avatar */}
        <div className="shrink-0 mt-1">
          <div className="h-8 w-8 rounded-xl bg-[color:var(--landing-moss)] flex items-center justify-center shadow-sm">
            <Bot className="h-4 w-4 text-white" />
          </div>
        </div>

        {/* Message Content */}
        <div className="flex-1 min-w-0">
          <div className="bg-zinc-100 dark:bg-zinc-900 rounded-2xl rounded-tl-md px-4 py-3 shadow-sm border border-zinc-200/50 dark:border-zinc-800">
            <div className={cn(
              "text-[15px] leading-7 text-zinc-800 dark:text-zinc-200",
              "prose prose-zinc dark:prose-invert max-w-none prose-sm",
              // Paragraphs
              "prose-p:my-2 prose-p:leading-7 first:prose-p:mt-0 last:prose-p:mb-0",
              // Headings
              "prose-headings:font-semibold prose-headings:text-zinc-900 dark:prose-headings:text-white",
              "prose-h1:text-lg prose-h1:mt-4 prose-h1:mb-2",
              "prose-h2:text-base prose-h2:mt-4 prose-h2:mb-2",
              "prose-h3:text-sm prose-h3:mt-3 prose-h3:mb-1",
              // Lists
              "prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5",
              "prose-ul:pl-4 prose-ol:pl-4",
              // Code
              "prose-code:text-[13px] prose-code:font-mono",
              "prose-code:before:content-none prose-code:after:content-none",
              "[&_code:not(pre_code)]:bg-zinc-200 dark:[&_code:not(pre_code)]:bg-zinc-800",
              "[&_code:not(pre_code)]:px-1.5 [&_code:not(pre_code)]:py-0.5 [&_code:not(pre_code)]:rounded",
              "[&_code:not(pre_code)]:text-zinc-800 dark:[&_code:not(pre_code)]:text-zinc-200",
              // Code blocks
              "prose-pre:bg-zinc-900 dark:prose-pre:bg-black",
              "prose-pre:border prose-pre:border-zinc-700",
              "prose-pre:rounded-xl prose-pre:my-3 prose-pre:p-4",
              "prose-pre:overflow-x-auto prose-pre:text-sm",
              // Links
              "prose-a:text-[color:var(--landing-clay)] prose-a:font-medium prose-a:no-underline hover:prose-a:underline",
              // Strong/Bold
              "prose-strong:font-semibold prose-strong:text-zinc-900 dark:prose-strong:text-white",
              // Blockquotes
              "prose-blockquote:border-l-2 prose-blockquote:border-[color:var(--landing-clay)]",
              "prose-blockquote:pl-4 prose-blockquote:italic prose-blockquote:text-zinc-600 dark:prose-blockquote:text-zinc-400",
              "prose-blockquote:my-3",
              // Tables
              "prose-table:text-sm prose-th:text-left prose-th:font-semibold prose-th:pb-2 prose-td:py-1.5",
              // HR
              "prose-hr:border-zinc-300 dark:prose-hr:border-zinc-700 prose-hr:my-4"
            )}>
              <Markdown remarkPlugins={[remarkGfm]}>{renderedContent}</Markdown>
            </div>
          </div>

          {/* Track 2: Insurance/Reimbursement Card */}
          {track2?.insurance && (
            <ReimbursementCard data={track2.insurance} />
          )}

          {/* Track 2: Evidence Panel (MoA + Comparison) */}
          {track2 && (track2.moa || track2.compare) && (
            <EvidencePanel track2={track2} />
          )}

          {/* Citations */}
          {message.citations && message.citations.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {message.citations.map((citation, idx) => (
                <a
                  key={idx}
                  href={citation.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors border border-zinc-200 dark:border-zinc-700"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--landing-moss)]" />
                  <span className="truncate max-w-[180px]">{citation.title}</span>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )
}


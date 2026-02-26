import * as React from "react"
import { cn } from "@/lib/utils"
import { ChatMessageList } from "@/components/ui/chat-message-list"

export interface ChatMessagesProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
}

export function ChatMessages({ children, className, ...props }: ChatMessagesProps) {
  return (
    <ChatMessageList className={cn("flex-1 min-h-0", className)} {...props}>
      {children}
    </ChatMessageList>
  )
}

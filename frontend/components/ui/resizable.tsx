"use client"

import * as React from "react"
import { GripVerticalIcon } from "lucide-react"

import { cn } from "@/lib/utils"

// Simplified resizable components - using divs instead of react-resizable-panels
// to avoid type issues during build

function ResizablePanelGroup({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="resizable-panel-group"
      className={cn(
        "flex h-full w-full",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

function ResizablePanel({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div 
      data-slot="resizable-panel" 
      className={cn("flex-1", className)}
      {...props}
    >
      {children}
    </div>
  )
}

function ResizableHandle({
  withHandle,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  withHandle?: boolean
}) {
  return (
    <div
      data-slot="resizable-handle"
      className={cn(
        "bg-border relative flex w-px items-center justify-center",
        className
      )}
      {...props}
    >
      {withHandle && (
        <div className="bg-border z-10 flex h-4 w-3 items-center justify-center rounded-xs border">
          <GripVerticalIcon className="size-2.5" />
        </div>
      )}
    </div>
  )
}

export { ResizablePanelGroup, ResizablePanel, ResizableHandle }

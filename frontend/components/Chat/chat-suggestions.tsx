import * as React from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Sparkles } from "lucide-react"

export interface ChatSuggestionsProps {
  suggestions: string[]
  onSelect: (suggestion: string) => void
  className?: string
}

export function ChatSuggestions({ suggestions, onSelect, className }: ChatSuggestionsProps) {
  if (suggestions.length === 0) return null

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5" />
        <span>Suggested questions</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((suggestion, index) => (
          <Button
            key={index}
            variant="outline"
            size="sm"
            onClick={() => onSelect(suggestion)}
            className="text-xs h-8 rounded-full border-border/50 hover:border-primary/50 hover:bg-primary/5 transition-all"
          >
            {suggestion}
          </Button>
        ))}
      </div>
    </div>
  )
}

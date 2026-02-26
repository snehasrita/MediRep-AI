"use client";

import * as React from "react";
import { Search, Plus, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface DrugSearchInputProps {
  onAddDrug: (drug: string) => void;
  existingDrugs: string[];
  isLoading?: boolean;
  className?: string;
}

export function DrugSearchInput({ onAddDrug, existingDrugs, isLoading, className }: DrugSearchInputProps) {
  const [open, setOpen] = React.useState(false);
  const [value, setValue] = React.useState("");
  const [searchResults, setSearchResults] = React.useState<string[]>([]);

  const handleAdd = () => {
    if (value.trim() && !existingDrugs.includes(value.trim())) {
      onAddDrug(value.trim());
      setValue("");
      setOpen(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && value.trim()) {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <div className={cn("flex gap-2", className)}>
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enter drug name (e.g., Aspirin, Warfarin)"
          className="pl-10"
          disabled={isLoading}
        />
      </div>
      <Button onClick={handleAdd} disabled={!value.trim() || isLoading} size="icon">
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
      </Button>
    </div>
  );
}

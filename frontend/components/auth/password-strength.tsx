"use client";

import { useMemo } from "react";
import { getPasswordStrength } from "@/lib/auth/validation";
import { cn } from "@/lib/utils";

interface PasswordStrengthProps {
  password: string;
  className?: string;
}

export function PasswordStrength({ password, className }: PasswordStrengthProps) {
  const strength = useMemo(() => getPasswordStrength(password), [password]);

  if (!password) return null;

  const colors = {
    weak: "bg-red-500",
    fair: "bg-orange-500",
    good: "bg-yellow-500",
    strong: "bg-green-500",
  };

  const textColors = {
    weak: "text-red-500",
    fair: "text-orange-500",
    good: "text-yellow-500",
    strong: "text-green-500",
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((index) => (
          <div
            key={index}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors duration-300",
              index <= strength.score ? colors[strength.label] : "bg-muted"
            )}
          />
        ))}
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className={cn("font-medium capitalize", textColors[strength.label])}>
          {strength.label}
        </span>
        {strength.feedback.length > 0 && (
          <span className="text-muted-foreground">
            {strength.feedback[0]}
          </span>
        )}
      </div>
    </div>
  );
}

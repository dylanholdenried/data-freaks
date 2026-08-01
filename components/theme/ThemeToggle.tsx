"use client";

import { Moon, Sun } from "lucide-react";
import { useAppTheme } from "./theme-context";
import { cn } from "@/lib/utils";

export default function ThemeToggle({
  className,
  variant = "icon",
}: {
  className?: string;
  variant?: "icon" | "sidebar";
}) {
  const { theme, toggleTheme } = useAppTheme();
  const isDark = theme === "dark";

  if (variant === "sidebar") {
    return (
      <button
        type="button"
        onClick={toggleTheme}
        aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
        className={cn(
          "flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--da-line)] bg-[var(--da-panel-2)] px-4 py-2 text-xs font-semibold text-[var(--da-text)] transition-colors hover:bg-[var(--da-line)]",
          className
        )}
      >
        {isDark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
        {isDark ? "Light mode" : "Dark mode"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Light mode" : "Dark mode"}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--da-line)] bg-[var(--da-panel)] text-[var(--da-muted)] transition-colors hover:bg-[var(--da-panel-2)] hover:text-[var(--da-text)]",
        className
      )}
    >
      {isDark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
    </button>
  );
}

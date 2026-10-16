"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

type CopyableTextProps = {
  value: string;
  /** Shown in the toast, e.g. "Stock #" or "VIN". */
  label: string;
  className?: string;
  style?: CSSProperties;
  title?: string;
  children?: ReactNode;
};

/** Click-to-copy control that never opens/flips the parent card. */
export default function CopyableText({
  value,
  label,
  className,
  style,
  title,
  children,
}: CopyableTextProps) {
  const [copied, setCopied] = useState(false);
  const [mounted, setMounted] = useState(false);
  const timerRef = useRef<number | null>(null);
  const canCopy = Boolean(value.trim()) && value.trim() !== "—";

  useEffect(() => {
    setMounted(true);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  const onCopy = useCallback(
    async (e: React.MouseEvent | React.KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!canCopy) return;
      try {
        await navigator.clipboard.writeText(value.trim());
        setCopied(true);
        if (timerRef.current) window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => setCopied(false), 1800);
      } catch {
        // Clipboard may be unavailable; fail quietly.
      }
    },
    [canCopy, value]
  );

  return (
    <>
      <button
        type="button"
        disabled={!canCopy}
        onClick={onCopy}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter" || e.key === " ") onCopy(e);
        }}
        className={cn(
          "appearance-none border-0 bg-transparent p-0 text-inherit",
          canCopy && "cursor-pointer hover:opacity-90",
          !canCopy && "cursor-default",
          className
        )}
        style={style}
        title={canCopy ? title ?? `Click to copy ${label}` : title}
        aria-label={canCopy ? `Copy ${label} ${value.trim()}` : undefined}
      >
        {children ?? value}
      </button>
      {mounted && copied
        ? createPortal(
            <div
              role="status"
              aria-live="polite"
              className="pointer-events-none fixed bottom-6 left-1/2 z-[10000] -translate-x-1/2 rounded-md border border-emerald-300 bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg"
            >
              {label} copied
            </div>,
            document.body
          )
        : null}
    </>
  );
}

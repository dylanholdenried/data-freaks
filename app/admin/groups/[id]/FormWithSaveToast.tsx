"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";

export type SaveResult = {
  saved: true;
  redirectTo?: string | null;
  message?: string;
  emailWarning?: string;
};

type Props = {
  action: (formData: FormData) => Promise<SaveResult | void>;
  className?: string;
  children: ReactNode;
  /** Default toast when action does not return message */
  successMessage?: string;
};

/** Client form wrapper that shows a green success toast after a successful server action. */
export default function FormWithSaveToast({
  action,
  className,
  children,
  successMessage = "Changes Saved Successfully",
}: Props) {
  const router = useRouter();
  const [toast, setToast] = useState<{ text: string; warning?: string } | null>(null);
  const [, startTransition] = useTransition();
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  function flashToast(text: string, warning?: string) {
    setToast({ text, warning });
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setToast(null), warning ? 6000 : 3500);
  }

  return (
    <>
      {toast ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed right-4 top-4 z-50 max-w-sm animate-in fade-in slide-in-from-top-2 rounded-md border border-emerald-300 bg-emerald-600 px-4 py-3 text-sm font-medium text-white shadow-lg"
        >
          {toast.text}
          {toast.warning ? (
            <p className="mt-1 text-xs font-normal text-emerald-100">{toast.warning}</p>
          ) : null}
        </div>
      ) : null}
      <form
        className={className}
        action={(formData) => {
          startTransition(async () => {
            const result = await action(formData);
            if (!result?.saved) return;
            flashToast(result.message || successMessage, result.emailWarning);
            if (result.redirectTo) {
              router.push(result.redirectTo);
            }
            router.refresh();
          });
        }}
      >
        {children}
      </form>
    </>
  );
}

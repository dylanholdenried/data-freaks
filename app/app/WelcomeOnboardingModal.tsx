"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { markWelcomeSeen } from "@/app/app/onboarding-actions";

type Props = {
  firstName: string | null;
  show: boolean;
};

export default function WelcomeOnboardingModal({ firstName, show }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(show);
  const [pending, startTransition] = useTransition();

  if (!open) return null;

  function dismiss(goToSetup: boolean) {
    startTransition(async () => {
      try {
        await markWelcomeSeen();
      } catch {
        // Still close UI so the user is not stuck if the column is missing temporarily
      }
      setOpen(false);
      if (goToSetup) {
        router.push("/app/setup");
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="app-panel w-full max-w-md p-6">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Welcome{firstName ? `, ${firstName}` : ""}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Your auto group is active. Next, finish store setup — add salespeople, finance managers,
          acquisition sources, and monthly goals.
        </p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" disabled={pending} onClick={() => dismiss(false)}>
            Later
          </Button>
          <Button type="button" disabled={pending} onClick={() => dismiss(true)}>
            Go to Setup
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          You can always open{" "}
          <Link href="/app/setup" className="underline">
            Setup & Config
          </Link>{" "}
          from the sidebar.
        </p>
      </div>
    </div>
  );
}

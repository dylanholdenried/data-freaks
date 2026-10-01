"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    console.error(error);
  }, [error]);

  function retry() {
    startTransition(() => {
      router.refresh();
      reset();
    });
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50">
      <div className="container flex min-h-[60vh] items-center justify-center py-10">
        <Card className="w-full max-w-lg">
          <CardContent className="space-y-6 pt-8 text-center">
            <p className="text-base leading-relaxed text-foreground">
              We&apos;re having trouble reaching our servers right now. Your account and data are
              fine — please try again in a moment.
            </p>
            <Button type="button" size="sm" onClick={retry} disabled={pending}>
              {pending ? "Retrying…" : "Try again"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

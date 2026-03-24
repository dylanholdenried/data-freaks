"use client";

import { useState } from "react";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

export default function LoginPage() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setError(null);
    setSubmitting(true);
    try {
      const data = Object.fromEntries(formData.entries());
      const parsed = loginSchema.parse(data);

      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed)
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Login failed (${res.status})`);
      }

      window.location.href = "/app";
    } catch (err: any) {
      console.error(err);
      const msg = String(err?.message ?? "");
      if (msg === "Failed to fetch" || msg === "fetch failed" || msg.includes("NetworkError")) {
        setError(
          "Could not reach the server. If you’re on localhost, use the same URL/port as `npm run dev` (e.g. http://localhost:3001). Also confirm .env.local has your Supabase URL and anon key."
        );
        return;
      }
      setError(err.message ?? "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleMagicLink(formData: FormData) {
    setError(null);
    setSubmitting(true);
    try {
      const email = String(formData.get("magic_email") ?? "");
      if (!email) throw new Error("Email is required");

      const res = await fetch("/api/auth/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });

      if (!res.ok) {
        throw new Error("Failed to send magic link");
      }

      alert("Magic link sent. Check your email.");
    } catch (err: any) {
      console.error(err);
      setError(err.message ?? "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-border bg-white/70 backdrop-blur">
        <div className="container flex h-16 items-center justify-between">
          <a href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary font-bold">
              DF
            </div>
            <span className="text-sm font-semibold tracking-tight">Data Freaks</span>
          </a>
          <nav className="flex items-center gap-4 text-sm">
            <a href="/demo" className="text-muted-foreground hover:text-foreground">
              View Demo
            </a>
            <a href="/signup" className="text-muted-foreground hover:text-foreground">
              Sign up
            </a>
            <a href="/login" className="text-foreground font-medium">
              Log in
            </a>
          </nav>
        </div>
      </header>

      <div className="container flex min-h-[60vh] items-center justify-center py-10">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Sign in to Data Freaks</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                handleSubmit(new FormData(e.currentTarget));
              }}
            >
              <div>
                <label className="text-xs font-medium text-muted-foreground">Email</label>
                <Input name="email" type="email" required autoComplete="email" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Password</label>
                <Input name="password" type="password" required autoComplete="current-password" />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? "Signing in..." : "Sign in"}
              </Button>
            </form>

            <div className="h-px bg-border" />

            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                handleMagicLink(new FormData(e.currentTarget));
              }}
            >
              <div>
                <label className="text-xs font-medium text-muted-foreground">Magic link</label>
                <Input name="magic_email" type="email" placeholder="Email for one-click sign-in" />
              </div>
              <Button type="submit" variant="outline" className="w-full" disabled={submitting}>
                Send magic link
              </Button>
            </form>

            <p className="text-xs text-muted-foreground">
              Google sign-in and password reset can be enabled via Supabase Auth settings. This screen is
              wired to the same project keys.
            </p>
            <p className="text-xs text-muted-foreground">
              Need an account?{" "}
              <a href="/signup" className="font-medium text-primary underline-offset-4 hover:underline">
                Request access
              </a>
              .
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}


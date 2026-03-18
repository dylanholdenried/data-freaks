"use client";

import { useState } from "react";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const signupSchema = z.object({
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  dealer_group_mode: z.enum(["new", "existing"]),
  dealer_group_name: z.string().optional(),
  existing_group_id: z.string().optional(),
  title: z.string().optional(),
  number_of_stores: z.coerce.number().int().positive().optional(),
  website: z.string().min(3).optional()
});

export default function SignupPage() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(formData: FormData) {
    setError(null);
    setSubmitting(true);
    setSuccess(false);

    try {
      const raw = Object.fromEntries(formData.entries());
      const parsed = signupSchema.parse(raw);

      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed)
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Sign up failed");
      }

      setSuccess(true);
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
            <a href="/signup" className="text-foreground font-medium">
              Sign up
            </a>
            <a href="/login" className="text-muted-foreground hover:text-foreground">
              Log in
            </a>
          </nav>
        </div>
      </header>

      <div className="container flex min-h-[60vh] items-center justify-center py-10">
        <Card className="w-full max-w-xl">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Create your Data Freaks login</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {success ? (
              <div className="space-y-2 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">
                  Account created. Your access is currently pending.
                </p>
                <p>
                  We&apos;ve registered your request with the Data Freaks team. Once your dealer group is
                  configured and approved, you&apos;ll be able to sign in at{" "}
                  <span className="font-medium text-foreground">/login</span> and access the sales log.
                </p>
              </div>
            ) : (
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSubmit(new FormData(e.currentTarget));
                }}
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">First name</label>
                    <Input name="first_name" required />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Last name</label>
                    <Input name="last_name" required />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Email</label>
                    <Input name="email" type="email" required autoComplete="email" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Password</label>
                    <Input name="password" type="password" required autoComplete="new-password" />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground">Title / role</label>
                  <Input name="title" placeholder="Partner, COO, GSM, etc." />
                </div>

                <fieldset className="space-y-2 rounded-md border border-border bg-white p-3">
                  <legend className="px-1 text-xs font-medium text-muted-foreground">
                    Dealer group access
                  </legend>
                  <div className="flex flex-col gap-2 text-xs">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="dealer_group_mode"
                        value="new"
                        defaultChecked
                        className="h-3 w-3"
                      />
                      <span>Request a new dealer group</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="dealer_group_mode"
                        value="existing"
                        className="h-3 w-3"
                      />
                      <span>Request access to an existing Data Freaks group</span>
                    </label>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">
                        Dealer group name
                      </label>
                      <Input
                        name="dealer_group_name"
                        placeholder="Freak Auto Group"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">
                        Existing group ID (optional)
                      </label>
                      <Input
                        name="existing_group_id"
                        placeholder="If you know the internal group ID"
                      />
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">
                        Number of stores
                      </label>
                      <Input name="number_of_stores" type="number" min={1} placeholder="e.g. 3" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">
                        Dealer group website
                      </label>
                      <Input
                        name="website"
                        type="text"
                        placeholder="exampleautogroup.com"
                      />
                    </div>
                  </div>
                </fieldset>

                {error && <p className="text-sm text-destructive">{error}</p>}

                <div className="flex items-center justify-between pt-2">
                  <p className="text-xs text-muted-foreground">
                    Your account will be created immediately and marked as{" "}
                    <span className="font-medium text-foreground">pending</span> until a Data Freaks admin
                    approves access.
                  </p>
                  <Button type="submit" disabled={submitting}>
                    {submitting ? "Creating..." : "Create account"}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}


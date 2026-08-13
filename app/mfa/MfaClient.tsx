"use client";

import { useEffect, useState } from "react";
import { Archivo, IBM_Plex_Mono, Inter } from "next/font/google";
import DealerAcqLogo from "@/components/brand/DealerAcqLogo";

const archivo = Archivo({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-da-display",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-da-body",
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-da-mono",
  display: "swap",
});

type EnrollResponse =
  | { mode: "enroll"; factorId: string; qr: string; secret: string }
  | { mode: "verify"; factorId: string }
  | { error: string };

export default function MfaClient() {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"enroll" | "verify" | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/mfa/enroll", { method: "POST" });
        const body = (await res.json().catch(() => ({}))) as EnrollResponse;
        if (!res.ok || "error" in body) {
          throw new Error(("error" in body && body.error) || `MFA setup failed (${res.status})`);
        }
        if (cancelled) return;
        setFactorId(body.factorId);
        setMode(body.mode);
        if (body.mode === "enroll") {
          setQr(body.qr);
          setSecret(body.secret);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not start MFA setup");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/mfa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ factorId, code: code.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error ?? `Verification failed (${res.status})`);
      }
      window.location.href = typeof body.next === "string" ? body.next : "/app";
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={`da-landing da-login-page ${archivo.variable} ${inter.variable} ${ibmPlexMono.variable}`}>
      <nav className="da-nav">
        <div className="da-wrap da-nav-in">
          <DealerAcqLogo href="/" />
        </div>
      </nav>

      <main className="da-login-main">
        <div className="da-login-glow" aria-hidden="true" />
        <section className="da-login-shell" aria-labelledby="mfa-heading">
          <div className="da-login-copy">
            <div className="da-eyebrow">Owner security</div>
            <h1 id="mfa-heading">
              Two-factor <span className="da-hl">required.</span>
            </h1>
            <p>
              The owner account can see every dealer group. An authenticator app code is required
              after your password before you can open the app.
            </p>
          </div>

          <div className="da-login-card">
            <div className="da-login-card-bar">
              <span>DEALERACQ · MFA</span>
              <div className="da-term-dots" aria-hidden="true">
                <span className="da-dot da-dot-a" />
                <span className="da-dot da-dot-b" />
                <span className="da-dot" />
              </div>
            </div>
            <div className="da-login-card-body">
              <div className="da-login-card-heading">
                <span className="da-sec-eyebrow">
                  {mode === "enroll" ? "Enroll authenticator" : "Verify identity"}
                </span>
                <h2>{mode === "enroll" ? "Scan this QR code" : "Enter your 6-digit code"}</h2>
              </div>

              {error ? (
                <div className="da-login-error" role="alert">
                  {error}
                </div>
              ) : null}

              {loading ? <p className="da-login-note">Preparing authenticator setup…</p> : null}

              {!loading && mode === "enroll" && qr ? (
                <div className="space-y-4">
                  <p className="da-login-note" style={{ marginTop: 0 }}>
                    Use Google Authenticator, 1Password, Authy, or any TOTP app. Scan the code, then
                    enter the 6-digit number it shows.
                  </p>
                  <div className="flex justify-center rounded-xl bg-white p-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={qr} alt="Authenticator QR code" className="h-44 w-44" />
                  </div>
                  {secret ? (
                    <p className="da-login-note">
                      Can&apos;t scan? Enter this key manually:{" "}
                      <code className="break-all text-[var(--da-text)]">{secret}</code>
                    </p>
                  ) : null}
                </div>
              ) : null}

              {!loading && mode ? (
                <form className="da-login-form" onSubmit={handleVerify}>
                  <label>
                    <span>Authenticator code</span>
                    <input
                      name="code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="\d{6}"
                      maxLength={6}
                      required
                      placeholder="123456"
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    />
                  </label>
                  <button
                    type="submit"
                    className="da-btn da-btn-green da-login-submit"
                    disabled={submitting || code.length !== 6}
                  >
                    {submitting ? "Verifying…" : mode === "enroll" ? "Enable and continue" : "Continue"}
                  </button>
                </form>
              ) : null}

              <p className="da-login-note">
                If you lose this device, remove the factor in Supabase → Authentication → Users, then
                sign in and enroll again.
              </p>
              <form action="/api/auth/signout" method="post" className="da-login-signup">
                <button type="submit" className="underline">
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

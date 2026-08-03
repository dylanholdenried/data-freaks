"use client";

import { useEffect, useRef, useState } from "react";
import { Archivo, IBM_Plex_Mono, Inter } from "next/font/google";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
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

const tickerItems = [
  ["2021 SILVERADO 1500 LT", "+$4,850", "21 DAYS", true],
  ["2019 EQUINOX LT", "+$3,975", "14 DAYS", true],
  ["2018 RAM 1500 BIG HORN", "+$4,210", "33 DAYS", true],
  ["2022 MALIBU LT", "−$640", "88 DAYS · RED-LIGHT", false],
  ["2020 TRAVERSE LS", "+$3,480", "19 DAYS", true],
  ["2017 F-150 XLT", "+$5,120", "26 DAYS", true],
] as const;

export default function SetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [tokenHash, setTokenHash] = useState<string | null>(null);
  const [tokenType, setTokenType] = useState("recovery");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [ready, setReady] = useState(false);
  const [canSetPassword, setCanSetPassword] = useState(false);
  const hasInviteTokenRef = useRef(false);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let cancelled = false;
    const storageKey = "da_invite_token";

    async function loadInviteContext() {
      const params = new URLSearchParams(window.location.search);
      let hashFromUrl = params.get("token_hash");
      let typeFromUrl = params.get("type") || "recovery";
      let emailFromUrl = params.get("email");

      if (hashFromUrl) {
        try {
          sessionStorage.setItem(
            storageKey,
            JSON.stringify({
              token_hash: hashFromUrl,
              type: typeFromUrl,
              email: emailFromUrl,
            })
          );
        } catch {
          // sessionStorage may be blocked; keep going with in-memory token.
        }
        // Strip secrets from the address bar after reading (keeps share/screenshot safer).
        window.history.replaceState({}, "", "/set-password");
      } else {
        try {
          const raw = sessionStorage.getItem(storageKey);
          if (raw) {
            const saved = JSON.parse(raw) as {
              token_hash?: string;
              type?: string;
              email?: string | null;
            };
            hashFromUrl = saved.token_hash || null;
            typeFromUrl = saved.type || "recovery";
            emailFromUrl = saved.email || null;
          }
        } catch {
          // ignore
        }
      }

      if (hashFromUrl) {
        hasInviteTokenRef.current = true;
        setTokenHash(hashFromUrl);
        setTokenType(typeFromUrl);
        if (emailFromUrl) {
          setAccountEmail(emailFromUrl.trim().toLowerCase());
        }
        setCanSetPassword(true);
        setReady(true);
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      if (user?.email) {
        setAccountEmail(user.email);
        setCanSetPassword(true);
      } else {
        setAccountEmail(null);
        setCanSetPassword(false);
      }
      setReady(true);
    }

    void loadInviteContext();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      // Invite token flow does not need a session until form submit.
      if (hasInviteTokenRef.current) return;
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN" || event === "INITIAL_SESSION") {
        const email = session?.user?.email ?? null;
        if (email) {
          setAccountEmail(email);
          setCanSetPassword(true);
        }
        setReady(true);
      }
      if (event === "SIGNED_OUT") {
        setAccountEmail(null);
        setCanSetPassword(false);
        setReady(true);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!canSetPassword || (!accountEmail && !confirmEmail.trim())) {
      setError("This link has expired or is invalid. Ask your admin to send a new invite.");
      return;
    }

    const emailToConfirm = confirmEmail.trim().toLowerCase();
    if (accountEmail && emailToConfirm !== accountEmail.trim().toLowerCase()) {
      setError(
        "Email does not match the account for this invite link. Check the address shown above and try again."
      );
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmedEmail: emailToConfirm,
          password,
          ...(tokenHash
            ? {
                token_hash: tokenHash,
                type: tokenType,
              }
            : {}),
        }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          typeof body.error === "string" ? body.error : `Could not save password (${res.status})`
        );
        return;
      }

      try {
        sessionStorage.removeItem("da_invite_token");
      } catch {
        // ignore
      }

      window.location.href = "/app";
    } catch (err: any) {
      const msg = String(err?.message ?? "");
      if (msg === "Failed to fetch" || msg === "fetch failed" || msg.includes("NetworkError")) {
        setError("Could not reach the server. Check your connection and try again.");
        return;
      }
      setError(err?.message || "Could not update password.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className={`da-landing da-login-page ${archivo.variable} ${inter.variable} ${ibmPlexMono.variable}`}
    >
      <div className="da-tape" aria-hidden="true">
        <div className="da-tape-inner">
          {[...tickerItems, ...tickerItems].map(([vehicle, gross, days, up], index) => (
            <span className="da-tape-item" key={`${vehicle}-${index}`}>
              {vehicle} · <b className={up ? "da-up" : "da-dn"}>{gross}</b> · {days}
            </span>
          ))}
        </div>
      </div>

      <nav className="da-nav">
        <div className="da-wrap da-nav-in">
          <DealerAcqLogo href="/" />
          <div className="da-nav-actions">
            <a className="da-nav-text" href="/demo">
              View Demo
            </a>
            <a className="da-nav-text da-nav-login" href="/login">
              Log in
            </a>
            <a className="da-btn da-btn-green" href="/signup">
              Sign up
            </a>
          </div>
        </div>
      </nav>

      <main className="da-login-main">
        <div className="da-login-glow" aria-hidden="true" />
        <section className="da-login-shell" aria-labelledby="set-password-heading">
          <div className="da-login-copy">
            <div className="da-eyebrow">Secure account setup</div>
            <h1 id="set-password-heading">
              Create your <span className="da-hl">password.</span>
            </h1>
            <p>
              Confirm the email on this invite, choose a password, and you&apos;ll be signed in to
              DealerACQ.
            </p>
            <div className="da-login-proof">
              <span className="da-login-proof-dot" />
              This link only works for the account it was sent to
            </div>
          </div>

          <div className="da-login-card">
            <div className="da-login-card-bar">
              <span>DEALERACQ · SET PASSWORD</span>
              <div className="da-term-dots" aria-hidden="true">
                <span className="da-dot da-dot-a" />
                <span className="da-dot da-dot-b" />
                <span className="da-dot" />
              </div>
            </div>
            <div className="da-login-card-body">
              <div className="da-login-card-heading">
                <span className="da-sec-eyebrow">Invite / reset</span>
                <h2>Create your password</h2>
              </div>

              {!ready ? (
                <p className="da-login-note">Checking your invite link…</p>
              ) : !canSetPassword ? (
                <div className="space-y-3">
                  <div className="da-login-error" role="alert">
                    This link has expired or is invalid. Ask your admin to send a new invite email.
                  </div>
                  <p className="da-login-signup">
                    <a href="/login">Back to sign in →</a>
                  </p>
                </div>
              ) : (
                <>
                  {error ? (
                    <div className="da-login-error" role="alert">
                      {error}
                    </div>
                  ) : null}

                  {accountEmail ? (
                    <p className="da-login-note" style={{ marginBottom: "1rem" }}>
                      Setting password for{" "}
                      <strong style={{ color: "var(--da-text, #0f172a)" }}>{accountEmail}</strong>
                    </p>
                  ) : (
                    <p className="da-login-note" style={{ marginBottom: "1rem" }}>
                      Enter the email this invite was sent to, then choose a password.
                    </p>
                  )}

                  <form className="da-login-form" onSubmit={handleSubmit}>
                    <label>
                      <span>Confirm email</span>
                      <input
                        name="confirm_email"
                        type="email"
                        required
                        autoComplete="email"
                        placeholder="Type the email this invite was sent to"
                        value={confirmEmail}
                        onChange={(e) => setConfirmEmail(e.target.value)}
                      />
                    </label>
                    <label>
                      <span>New password</span>
                      <input
                        name="password"
                        type="password"
                        required
                        minLength={8}
                        autoComplete="new-password"
                        placeholder="At least 8 characters"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                    </label>
                    <label>
                      <span>Confirm password</span>
                      <input
                        name="confirm_password"
                        type="password"
                        required
                        minLength={8}
                        autoComplete="new-password"
                        placeholder="Re-enter password"
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                      />
                    </label>
                    <button
                      type="submit"
                      className="da-btn da-btn-green da-login-submit"
                      disabled={submitting}
                    >
                      {submitting ? "Saving…" : "Save password"}
                    </button>
                  </form>

                  <p className="da-login-signup">
                    Already set up? <a href="/login">Sign in →</a>
                  </p>
                </>
              )}
            </div>
          </div>
        </section>
      </main>

      <footer className="da-footer da-login-footer">
        <div className="da-wrap da-foot-in">
          <span>© 2026 DealerACQ · dealeracq.com</span>
          <span>BUY THE RIGHT CARS. PROVE IT WITH DATA.</span>
        </div>
      </footer>
    </div>
  );
}

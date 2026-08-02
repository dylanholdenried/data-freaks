"use client";

import { useEffect, useState } from "react";
import { Archivo, IBM_Plex_Mono, Inter } from "next/font/google";
import { z } from "zod";
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

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

export default function LoginPage() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("error");
    if (!code) return;
    if (code === "invite_link_invalid") {
      setError(
        "That invite or reset link is invalid or expired. Ask your admin to resend it, or sign in below if you already set a password."
      );
    } else if (code === "auth_callback_failed") {
      setError("Sign-in link failed. Try again or use email and password.");
    } else if (code === "auth_misconfigured") {
      setError("Authentication is misconfigured. Contact support.");
    }
  }, []);

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
            <a
              className="da-nav-text da-nav-login da-nav-current"
              href="/login"
              aria-current="page"
            >
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
        <section className="da-login-shell" aria-labelledby="login-heading">
          <div className="da-login-copy">
            <div className="da-eyebrow">Secure dealer access</div>
            <h1 id="login-heading">
              Welcome back to <span className="da-hl">DealerACQ.</span>
            </h1>
            <p>
              Sign in to log deals, track gross and pace, and turn your store&apos;s history into
              acquisition intelligence.
            </p>
            <div className="da-login-proof">
              <span className="da-login-proof-dot" />
              Your data stays private to your dealer group
            </div>
          </div>

          <div className="da-login-card">
            <div className="da-login-card-bar">
              <span>DEALERACQ · AUTHENTICATION</span>
              <div className="da-term-dots" aria-hidden="true">
                <span className="da-dot da-dot-a" />
                <span className="da-dot da-dot-b" />
                <span className="da-dot" />
              </div>
            </div>
            <div className="da-login-card-body">
              <div className="da-login-card-heading">
                <span className="da-sec-eyebrow">Account login</span>
                <h2>Sign in to DealerACQ</h2>
              </div>

              {error && (
                <div className="da-login-error" role="alert">
                  {error}
                </div>
              )}

            <form
              className="da-login-form"
              onSubmit={(e) => {
                e.preventDefault();
                handleSubmit(new FormData(e.currentTarget));
              }}
            >
              <label>
                <span>Email</span>
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@dealership.com"
                />
              </label>
              <label>
                <span>Password</span>
                <input
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  placeholder="Enter your password"
                />
              </label>
              <button type="submit" className="da-btn da-btn-green da-login-submit" disabled={submitting}>
                {submitting ? "Signing in..." : "Sign in"}
              </button>
            </form>

              <div className="da-login-divider">
                <span>OR USE A MAGIC LINK</span>
              </div>

            <form
              className="da-login-form"
              onSubmit={(e) => {
                e.preventDefault();
                handleMagicLink(new FormData(e.currentTarget));
              }}
            >
              <label>
                <span>Magic link</span>
                <input name="magic_email" type="email" placeholder="Email for one-click sign-in" />
              </label>
              <button type="submit" className="da-btn da-btn-ghost da-login-submit" disabled={submitting}>
                Send magic link
              </button>
            </form>

              <p className="da-login-note">
                Google sign-in and password reset can be enabled via Supabase Auth settings. This
                screen is wired to the same project keys.
              </p>
              <p className="da-login-signup">
                Need an account? <a href="/signup">Request access →</a>
              </p>
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


"use client";

import { useState } from "react";
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
    <div
      className={`da-landing da-login-page da-signup-page ${archivo.variable} ${inter.variable} ${ibmPlexMono.variable}`}
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
          <div className="da-nav-links">
            <a href="/#how">How it works</a>
            <a href="/#pricing">Pricing</a>
            <a href="/#founder">Who built it</a>
          </div>
          <div className="da-nav-actions">
            <a className="da-nav-text" href="/demo">
              View Demo
            </a>
            <a className="da-nav-text" href="/login">
              Log in
            </a>
            <a className="da-btn da-btn-amber" href="/signup" aria-current="page">
              Sign up
            </a>
          </div>
        </div>
      </nav>

      <main className="da-login-main da-signup-main">
        <div className="da-login-glow" aria-hidden="true" />
        <section className="da-signup-shell" aria-labelledby="signup-heading">
          <div className="da-login-copy da-signup-copy">
            <div className="da-eyebrow">Start logging free</div>
            <h1 id="signup-heading">
              Put your deal history <span className="da-hl">to work.</span>
            </h1>
            <p>
              Create your DealerACQ account and start building the clean sales log that powers
              smarter acquisition decisions.
            </p>
            <div className="da-signup-benefits">
              <div>
                <span>01</span>
                Free sales log, forever
              </div>
              <div>
                <span>02</span>
                Unlimited users
              </div>
              <div>
                <span>03</span>
                No credit card required
              </div>
            </div>
          </div>

          <div className="da-login-card da-signup-card">
            <div className="da-login-card-bar">
              <span>DEALERACQ · NEW ACCOUNT</span>
              <div className="da-term-dots" aria-hidden="true">
                <span className="da-dot da-dot-a" />
                <span className="da-dot da-dot-b" />
                <span className="da-dot" />
              </div>
            </div>
            <div className="da-login-card-body da-signup-card-body">
              <div className="da-login-card-heading">
                <span className="da-sec-eyebrow">Request access</span>
                <h2>Create your DealerACQ login</h2>
              </div>

              {success ? (
                <div className="da-signup-success" role="status">
                  <div className="da-signup-success-mark">✓</div>
                  <p className="da-signup-success-title">
                    Account created. Your access is currently pending.
                  </p>
                  <p>
                    We&apos;ve registered your request with the DealerACQ team. Once your dealer group
                    is configured and approved, you&apos;ll be able to sign in at{" "}
                    <a href="/login">/login</a> and access the sales log.
                  </p>
                </div>
              ) : (
                <form
                  className="da-signup-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSubmit(new FormData(e.currentTarget));
                  }}
                >
                  <div className="da-signup-grid">
                    <label>
                      <span>First name</span>
                      <input name="first_name" required autoComplete="given-name" />
                    </label>
                    <label>
                      <span>Last name</span>
                      <input name="last_name" required autoComplete="family-name" />
                    </label>
                  </div>

                  <div className="da-signup-grid">
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
                        autoComplete="new-password"
                        placeholder="8 characters minimum"
                      />
                    </label>
                  </div>

                  <label>
                    <span>Title / role</span>
                    <input name="title" placeholder="Partner, COO, GSM, etc." />
                  </label>

                  <fieldset className="da-signup-fieldset">
                    <legend>Dealer group access</legend>
                    <div className="da-signup-options">
                      <label>
                        <input
                          type="radio"
                          name="dealer_group_mode"
                          value="new"
                          defaultChecked
                        />
                        <span>Request a new dealer group</span>
                      </label>
                      <label>
                        <input type="radio" name="dealer_group_mode" value="existing" />
                        <span>Request access to an existing DealerACQ group</span>
                      </label>
                    </div>
                    <div className="da-signup-grid">
                      <label>
                        <span>Dealer group name</span>
                        <input name="dealer_group_name" placeholder="Your Auto Group" />
                      </label>
                      <label>
                        <span>Existing group ID (optional)</span>
                        <input
                          name="existing_group_id"
                          placeholder="If you know the internal group ID"
                        />
                      </label>
                    </div>
                    <div className="da-signup-grid">
                      <label>
                        <span>Number of stores</span>
                        <input name="number_of_stores" type="number" min={1} placeholder="e.g. 3" />
                      </label>
                      <label>
                        <span>Dealer group website</span>
                        <input
                          name="website"
                          type="text"
                          placeholder="exampleautogroup.com"
                        />
                      </label>
                    </div>
                  </fieldset>

                  {error && (
                    <div className="da-login-error" role="alert">
                      {error}
                    </div>
                  )}

                  <div className="da-signup-submit-row">
                    <p>
                      Your account will be created immediately and marked as{" "}
                      <strong>pending</strong> until a DealerACQ admin approves access.
                    </p>
                    <button
                      type="submit"
                      className="da-btn da-btn-amber da-signup-submit"
                      disabled={submitting}
                    >
                      {submitting ? "Creating..." : "Create account"}
                    </button>
                  </div>
                </form>
              )}
              {!success && (
                <p className="da-login-signup da-signup-login-link">
                  Already have an account? <a href="/login">Log in →</a>
                </p>
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


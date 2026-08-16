"use client";

import { useState } from "react";
import { faqItems } from "../data";

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section className="da-problem">
      <div className="da-wrap" style={{ maxWidth: 820 }}>
        <div className="da-sec-eyebrow">Straight answers</div>
        <h2>What dealers ask before they scan it a second time.</h2>

        <div className="mt-10 divide-y divide-[var(--da-line)] border-y border-[var(--da-line)]">
          {faqItems.map((item, index) => {
            const isOpen = open === index;
            return (
              <div key={item.q}>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? null : index)}
                  className="flex w-full items-center justify-between gap-4 py-5 text-left"
                >
                  <span className="text-[18px] font-bold leading-snug [font-family:var(--da-display)]">
                    {item.q}
                  </span>
                  <span
                    aria-hidden="true"
                    className="shrink-0 text-[20px] text-[var(--da-amber)] [font-family:var(--da-mono)]"
                  >
                    {isOpen ? "−" : "+"}
                  </span>
                </button>
                {isOpen ? (
                  <p className="pb-5 pr-10 text-[15.5px] leading-relaxed text-[var(--da-muted)]">
                    {item.a}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

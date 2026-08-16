import Link from "next/link";

export function Hero() {
  return (
    <header className="da-wrap" style={{ paddingTop: 64, paddingBottom: 56 }}>
      <div className="da-eyebrow">20 Group · Acquisition intelligence</div>
      <h1>
        Know what to buy <span className="da-hl">before you raise your hand.</span>
      </h1>
      <p className="da-sub" style={{ maxWidth: 680 }}>
        DealerACQ turns your closed-deal log into acquisition intelligence: which makes, models,
        price bands, and sources actually gross, and which ones rot on the lot. Built and used
        daily by a working acquisition manager who buys ~100 units a month.
      </p>
      <div className="da-hero-ctas">
        <Link href="/signup" className="da-btn da-btn-green da-btn-lg">
          Create your free account
        </Link>
        <a href="#screens" className="da-btn da-btn-ghost da-btn-lg">
          See how we use it ↓
        </a>
      </div>
    </header>
  );
}

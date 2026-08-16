import Link from "next/link";

export function BottomCta() {
  return (
    <>
      <section className="da-final da-wrap">
        <div className="da-sec-eyebrow">Get on it</div>
        <h2>Want to see it on your own deals?</h2>
        <p className="da-sec-sub">
          Signing up is free for 20 Group dealers. Dylan will reach out personally to get your
          stores set up.
        </p>
        <Link href="/signup" className="da-btn da-btn-green da-btn-lg">
          Create your free account
        </Link>
        <p className="da-micro mt-6">
          Or email Dylan directly —{" "}
          <a
            href="mailto:dylan@dealeracq.com"
            className="underline underline-offset-4"
            style={{ color: "var(--da-amber)" }}
          >
            dylan@dealeracq.com
          </a>
        </p>
      </section>
      <footer className="da-footer">
        <div className="da-wrap da-foot-in">
          <span>© 2026 DealerACQ · dealeracq.com</span>
          <span>BUY THE RIGHT CARS. PROVE IT WITH DATA.</span>
        </div>
      </footer>
    </>
  );
}

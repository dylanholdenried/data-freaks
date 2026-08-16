const CARDS = [
  {
    kicker: "Front profit",
    title: "What we actually hold",
    body: "Front after pack, recon, and buy fee — not the number on the lane card. Models that only look cheap in the book get scored down.",
    hot: false,
  },
  {
    kicker: "Back profit",
    title: "Where F&I lands",
    body: "Finance and product on the models and price bands that actually penetrate. That's the gross the auction size doesn't show.",
    hot: true,
  },
  {
    kicker: "Average turn",
    title: "Days to the next one",
    body: "How fast it leaves. A clean 30-day car beats a fat-front unit that sits. Turn is the tax nobody books until the unit is aged.",
    hot: false,
  },
  {
    kicker: "Trade %",
    title: "The cheapest next unit",
    body: "Retail deals that bring a trade refill the lot from the service drive. High trade % is a buy signal, not a footnote.",
    hot: false,
  },
] as const;

export function Thesis() {
  return (
    <section className="da-problem">
      <div className="da-wrap">
        <div className="da-sec-eyebrow">The buy-box</div>
        <h2 style={{ maxWidth: 820 }}>The buy-box tells us what to restock.</h2>
        <p className="da-sec-sub" style={{ maxWidth: 760 }}>
          We score every model off our own closed deals — front profit, back profit, average turn,
          and trade %. That ranking is how we know which cars make money and which ones we should
          be hunting. Same list whether we&apos;re walking a trade, buying private party, bidding
          in the lane, or taking units from a rental company.
        </p>
        <div className="mt-11 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CARDS.map((card) => (
            <div className={`da-rung${card.hot ? " da-rung-hot" : ""}`} key={card.kicker}>
              <span className="da-rung-num">{card.kicker}</span>
              <h3>{card.title}</h3>
              <p>{card.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

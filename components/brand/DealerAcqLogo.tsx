import Link from "next/link";

type LogoVariant = "wordmark" | "mark" | "lockup";

type DealerAcqLogoProps = {
  href?: string;
  /** Force a single variant. Default is responsive: mark on mobile, wordmark/lockup on md+. */
  variant?: LogoVariant;
  /** When true (default), show mark below md and wordmark/lockup at md+. Ignored if only one size is needed via className overrides. */
  responsive?: boolean;
  /** Shell headers use lockup on desktop instead of wordmark. */
  desktopVariant?: "wordmark" | "lockup";
  className?: string;
};

function SignalBars({ size }: { size: "sm" | "lg" }) {
  return (
    <span className={`da-logo-bars da-logo-bars--${size}`} aria-hidden="true">
      <span className="da-logo-bar da-logo-bar--red" />
      <span className="da-logo-bar da-logo-bar--amber" />
      <span className="da-logo-bar da-logo-bar--green" />
    </span>
  );
}

function Wordmark() {
  return (
    <span className="da-logo-wordmark">
      <span className="da-logo-word">
        <span className="da-logo-dealer">Dealer</span>
        <span className="da-acq">ACQ</span>
      </span>
      <span className="da-logo-tape" aria-hidden="true">
        <span className="da-logo-tape-run" />
        <SignalBars size="lg" />
      </span>
    </span>
  );
}

function Mark() {
  return (
    <span className="da-logo-mark">
      <span className="da-acq da-logo-mark-acq">ACQ</span>
      <SignalBars size="sm" />
    </span>
  );
}

function Lockup() {
  return (
    <span className="da-logo-lockup">
      <Mark />
      <span className="da-logo-lockup-label">DealerACQ</span>
    </span>
  );
}

function LogoInner({
  variant,
}: {
  variant: LogoVariant;
}) {
  if (variant === "mark") return <Mark />;
  if (variant === "lockup") return <Lockup />;
  return <Wordmark />;
}

export default function DealerAcqLogo({
  href = "/",
  variant,
  responsive = true,
  desktopVariant = "wordmark",
  className = "",
}: DealerAcqLogoProps) {
  const content =
    variant || !responsive ? (
      <LogoInner variant={variant ?? desktopVariant} />
    ) : (
      <>
        <span className="da-logo-mobile">
          <Mark />
        </span>
        <span className="da-logo-desktop">
          <LogoInner variant={desktopVariant} />
        </span>
      </>
    );

  const classes = ["da-brand-logo", className].filter(Boolean).join(" ");

  if (href) {
    return (
      <Link href={href} className={classes} aria-label="DealerACQ home">
        {content}
      </Link>
    );
  }

  return (
    <span className={classes} aria-label="DealerACQ">
      {content}
    </span>
  );
}

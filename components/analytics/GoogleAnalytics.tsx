import Script from "next/script";

/** Public GA4 measurement ID. Fallback so production builds always emit the tag. */
const DEFAULT_GA_MEASUREMENT_ID = "G-GK8XBP9LDR";

function isValidMeasurementId(id: string): boolean {
  return /^G-[A-Z0-9]+$/i.test(id);
}

/**
 * Server-rendered gtag snippet so Google's site checker sees it in the HTML.
 * Client-only injection is invisible to that crawler. No user_id or deal data.
 */
export default function GoogleAnalytics({
  measurementId,
}: {
  measurementId?: string;
}) {
  const id = (measurementId?.trim() || DEFAULT_GA_MEASUREMENT_ID).trim();
  if (!isValidMeasurementId(id)) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`}
        strategy="afterInteractive"
      />
      <Script id="google-analytics" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', ${JSON.stringify(id)});
        `}
      </Script>
    </>
  );
}

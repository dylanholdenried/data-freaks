"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";

const PRIVATE_PATH_PREFIXES = [
  "/app",
  "/admin",
  "/mfa",
  "/set-password",
  "/awaiting-approval",
  "/auth",
];

function isPrivatePath(pathname: string | null): boolean {
  if (!pathname) return true;
  return PRIVATE_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

function isValidMeasurementId(id: string): boolean {
  return /^G-[A-Z0-9]+$/i.test(id);
}

export default function GoogleAnalytics({
  measurementId,
}: {
  measurementId?: string;
}) {
  const pathname = usePathname();
  const id = measurementId?.trim();

  if (!id || !isValidMeasurementId(id) || isPrivatePath(pathname)) {
    return null;
  }

  const encodedId = JSON.stringify(id);

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
          gtag('config', ${encodedId});
        `}
      </Script>
    </>
  );
}

import type { Metadata } from "next";
import { Archivo, IBM_Plex_Mono, Inter } from "next/font/google";
import { AppTour } from "./components/AppTour";
import { BottomCta } from "./components/BottomCta";
import { Faq } from "./components/Faq";
import { Hero } from "./components/Hero";
import { StickyHeader } from "./components/StickyHeader";
import { Thesis } from "./components/Thesis";

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

export const metadata: Metadata = {
  title: "20 Group | DealerACQ",
  robots: { index: false, follow: false },
};

export default function TwentyGroupOfferPage() {
  return (
    <div
      className={`da-landing overflow-x-hidden ${archivo.variable} ${inter.variable} ${ibmPlexMono.variable}`}
    >
      <StickyHeader />
      <Hero />
      <AppTour />
      <Thesis />
      <Faq />
      <BottomCta />
    </div>
  );
}

import { Archivo, IBM_Plex_Mono, Inter } from "next/font/google";

export const archivo = Archivo({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-da-display",
});

export const inter = Inter({
  subsets: ["latin"],
  variable: "--font-da-body",
});

export const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-da-mono",
});

export const daFontVariables = `${archivo.variable} ${inter.variable} ${ibmPlexMono.variable}`;

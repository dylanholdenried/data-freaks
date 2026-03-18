import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "Data Freaks – Dealership Sales Log & Acquisition Intelligence",
  description: "Data Freaks turns dealership sales logs into acquisition intelligence and cleaner KPIs."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground">
        <div className="flex min-h-screen flex-col">
          <main className="flex-1">{children}</main>
          <footer className="border-t border-border bg-white">
            <div className="container flex flex-col gap-3 py-6 md:flex-row md:items-center md:justify-between">
              <p className="text-sm text-muted-foreground">
                © {new Date().getFullYear()} Data Freaks. All rights reserved.
              </p>
              <div className="flex gap-2">
                <a
                  href="/demo"
                  className="text-sm font-medium text-primary hover:underline underline-offset-4"
                >
                  View Demo
                </a>
                <a
                  href="/signup"
                  className="text-sm font-medium text-primary hover:underline underline-offset-4"
                >
                  Sign up
                </a>
              </div>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}


import type { Metadata } from "next";
import { Fraunces, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  display: "swap",
});

const ibmPlex = IBM_Plex_Sans({
  variable: "--font-ibm-plex",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Lumen — Clinical Trial Pre-Screening Copilot",
  description:
    "Criterion-by-criterion pre-screening for research coordinators — cited evidence, actionable gaps, geo-aware trial discovery.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${ibmPlex.variable} ${ibmPlexMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <nav className="relative border-b border-rule bg-paper/80 backdrop-blur-sm">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4 sm:px-8">
            <Link
              href="/"
              className="group flex items-baseline gap-2.5 lumen-focus rounded-sm"
            >
              <span
                className="font-display text-xl font-semibold tracking-tight text-ink"
                style={{ fontFamily: "var(--font-fraunces)" }}
              >
                Lumen
              </span>
              <span className="hidden text-[10px] font-medium uppercase tracking-[0.2em] text-ink-faint sm:inline">
                Pre-screening copilot
              </span>
            </Link>
            <div className="flex items-center gap-1">
              <Link
                href="/results?patientSlug=hero"
                className="rounded-md px-3 py-1.5 text-sm font-medium text-ink-muted transition-colors hover:bg-parchment-deep hover:text-ink lumen-focus"
              >
                Results
              </Link>
            </div>
          </div>
          <div
            className="absolute bottom-0 left-0 h-px w-full bg-gradient-to-r from-transparent via-copper/40 to-transparent"
            aria-hidden
          />
        </nav>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-rule bg-paper/60">
          <div className="mx-auto max-w-5xl px-5 py-5 sm:px-8">
            <p className="text-center text-xs text-ink-faint">
              De-identified patient records · Evidence cited from clinical
              documentation
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}

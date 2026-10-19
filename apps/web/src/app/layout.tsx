import type { Metadata, Viewport } from "next";
import { Geist_Mono, Instrument_Serif, Rubik } from "next/font/google";
import type { ReactNode } from "react";

import { LogoDefs } from "@/components/logo";
import { SiteBackdrop } from "@/components/site-backdrop";
import { SmoothScroll } from "@/components/smooth-scroll";
import { GlassFilter } from "@/components/ui/liquid-glass-button";

import "./globals.css";

// Type system: Rubik for interface text and headings, Instrument Serif
// italic for single accent words, Geist Mono for machine values (ids,
// statuses, money, endpoints).
const sans = Rubik({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-rubik",
  display: "swap",
});
const mono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});
const display = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-instrument",
  display: "swap",
});

export const metadata: Metadata = {
  title: "FinPal — Zero blind spends",
  description:
    "Agent-assisted purchasing evaluated against your rules before PayPal.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#040509" },
    { media: "(prefers-color-scheme: light)", color: "#edf0f5" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${sans.variable} ${mono.variable} ${display.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('finpal-theme')==='light'?'light':'dark';document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t}catch(e){document.documentElement.dataset.theme='dark'}`,
          }}
        />
      </head>
      <body>
        <SiteBackdrop />
        {/* Shared SVG filter for every liquid glass button. */}
        <GlassFilter />
        <LogoDefs />
        <SmoothScroll>
          <div className="site-content">{children}</div>
        </SmoothScroll>
      </body>
    </html>
  );
}

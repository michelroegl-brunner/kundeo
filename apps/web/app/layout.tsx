import type { Metadata } from "next";
import { Public_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

// Public Sans (300–800) for all UI/display; IBM Plex Mono (400–600) for
// numerals, dates, IDs and code. Exposed as --font-sans / --font-mono via the
// stacks in globals.css.
const publicSans = Public_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-public-sans",
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-ibm-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Kundeo",
  description: "Open-Source-CRM für den DACH-Markt.",
  icons: { icon: "/kundeo-icon.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="de"
      className={`${publicSans.variable} ${ibmPlexMono.variable}`}
    >
      <body className="min-h-screen bg-surface-page font-sans text-content antialiased">
        {children}
      </body>
    </html>
  );
}

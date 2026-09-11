import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kundeo",
  description: "Open-source CRM for the DACH market.",
  icons: { icon: "/brand/icon.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de">
      <body className="min-h-screen bg-white text-neutral-900 antialiased dark:bg-neutral-950 dark:text-neutral-100">
        {children}
      </body>
    </html>
  );
}

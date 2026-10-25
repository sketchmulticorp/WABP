import type { Metadata } from "next";
import { Geist } from "next/font/google";

import "./globals.css";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
});

export const metadata: Metadata = {
  title: "WhatsApp SaaS Platform",
  description: "Official WhatsApp messaging, contacts, campaigns, inbox, and automation.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html className={geist.variable} lang="en">
      <body>{children}</body>
    </html>
  );
}

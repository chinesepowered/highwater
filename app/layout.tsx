import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Highwater — mutual-aid dispatch for coordinators and their agents",
  description:
    "A live map of who needs help and who can give it during a flood. Coordinators drag pins and set urgency; the dispatch agent logs, matches and broadcasts through WebMCP tools on the same board.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} antialiased`}>{children}</body>
    </html>
  );
}

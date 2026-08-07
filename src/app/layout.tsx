import type { Metadata, Viewport } from "next";
import { caprasimo, figtree } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Boek de Bus — plan een rit",
  description:
    "Kies je dagen en vraag de bus aan. Jan en Els hakken de knoop door.",
  robots: {
    // A private household tool; there is nothing here to index.
    index: false,
    follow: false,
  },
};

export const viewport: Viewport = {
  // --color-neutral-200, the ground the phone frame sits on. Has to be a
  // literal: the browser reads this before any stylesheet.
  themeColor: "#eee7db",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="nl" className={`${caprasimo.variable} ${figtree.variable}`}>
      <body>{children}</body>
    </html>
  );
}

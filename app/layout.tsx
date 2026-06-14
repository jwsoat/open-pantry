import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Open Pantry — home grocery inventory & shopping list",
  description:
    "Free, self-hosted home grocery inventory with expiry tracking and a shopping list. Your data stays on your machine.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <div className="site-header__inner">
            <Link href="/" className="brand">
              Open<span>Pantry</span>
            </Link>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}

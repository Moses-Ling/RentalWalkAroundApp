import "./globals.css";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = { title: "Rental Walk-Around", description: "Move-in / move-out condition reports" };
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <main className="mx-auto max-w-xl px-4 pb-24 pt-4">{children}</main>
      </body>
    </html>
  );
}

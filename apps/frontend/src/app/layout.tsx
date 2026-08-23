import type { Metadata } from "next";
import { PT_Sans, Roboto_Slab } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

// Self-hosted and preloaded by next/font, so there is no cross-origin @import
// chain (app.css → fonts.googleapis.com → fonts.gstatic.com) on first paint.
// globals.css wires these variables into --font-heading / --font-body.
const robotoSlab = Roboto_Slab({
  variable: "--font-roboto-slab",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  display: "swap",
});

const ptSans = PT_Sans({
  variable: "--font-pt-sans",
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "BRANCH",
  description: "Accounting platform for BRANCH",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${robotoSlab.variable} ${ptSans.variable}`}
    >
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import { Bodoni_Moda, JetBrains_Mono, Inter } from "next/font/google";
import { CustomCursor } from "@/components/custom-cursor";
import { Starfield } from "@/components/starfield";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import "./globals.css";

const bodoni = Bodoni_Moda({
  variable: "--font-bodoni",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  style: ["normal", "italic"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const siteUrl = "https://nosignal.solar";
const siteDescription =
  "Learn game modding the right way — Frida internals, Python tooling, and reverse-engineering fundamentals for your own projects.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "nosignal",
    template: "%s · nosignal",
  },
  description: siteDescription,
  openGraph: {
    title: "nosignal",
    description: siteDescription,
    url: siteUrl,
    siteName: "nosignal",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "nosignal",
    description: siteDescription,
  },
};

export const viewport: Viewport = {
  themeColor: "#08080B",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${bodoni.variable} ${jetbrainsMono.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col text-foreground">
        <Starfield />
        <CustomCursor />
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}

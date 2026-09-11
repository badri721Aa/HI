import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Bodoni_Moda, JetBrains_Mono, Inter } from "next/font/google";
import { CustomCursor } from "@/components/custom-cursor";
import { Starfield } from "@/components/starfield";
import { Grain } from "@/components/grain";
import { LiquidGlassFilter } from "@/components/liquid-glass-filter";
import { ThemeProvider, THEME_INIT_SCRIPT } from "@/components/theme-provider";
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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f5fa" },
    { media: "(prefers-color-scheme: dark)", color: "#08080b" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${bodoni.variable} ${jetbrainsMono.variable} ${inter.variable} h-full antialiased`}
    >
      <head>
        <Script id="theme-init" strategy="beforeInteractive">
          {THEME_INIT_SCRIPT}
        </Script>
      </head>
      <body className="min-h-full flex flex-col text-foreground" suppressHydrationWarning>
        <ThemeProvider>
          <LiquidGlassFilter />
          <Starfield />
          <Grain />
          <CustomCursor />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}

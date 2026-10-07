import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "../globals.css";
import { fontVariables } from "../fonts";
import { LOCALES, dirFor, getDictionary, isLocale } from "@/lib/i18n";
import { layoutMetadata, siteViewport } from "@/lib/seo";
import { AppProviders } from "@/components/providers/app-providers";
import { ServiceWorkerRegister } from "@/components/providers/sw-register";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { CartDrawer } from "@/components/commerce/cart-drawer";
import { QuickView } from "@/components/commerce/quick-view";
import { Toaster } from "@/components/commerce/toaster";
import { SceneRoot } from "@/components/3d/scene-root-loader";

export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: LayoutProps<"/[lang]">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  return layoutMetadata(lang);
}

export const viewport: Viewport = siteViewport;

export default async function RootLayout({ children, params }: LayoutProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const t = getDictionary(lang);

  return (
    <html lang={lang} dir={dirFor(lang)} className={fontVariables}>
      <body>
        <AppProviders locale={lang}>
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-fg focus:px-4 focus:py-2 focus:text-ink-950"
          >
            {t.common.skipToContent}
          </a>
          <SiteHeader />
          <main id="main" tabIndex={-1} className="outline-none">
            {children}
          </main>
          <SiteFooter />
          <CartDrawer />
          <QuickView />
          <Toaster />
          <SceneRoot />
        </AppProviders>
        <ServiceWorkerRegister />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}

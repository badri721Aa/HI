import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { AiChat } from "@/components/ai-chat";

/** Chrome for regular content pages — header, footer, and the AI chat
 * widget. Deliberately NOT shared with /login or /auth/* (root layout
 * only) — a sign-in screen reads as cluttered with the full marketing
 * nav and a floating chat bubble competing for attention. */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
      <AiChat />
    </div>
  );
}

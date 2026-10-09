"use client";

import { useEffect } from "react";
import { trackEvent } from "@/lib/telemetry";
import { RotateCcw } from "lucide-react";
import { useI18n } from "@/components/providers/i18n-provider";
import { Button, ButtonLink } from "@/components/ui/button";
import { WhatsAppIcon } from "@/components/ui/icons";
import { GridBackdrop, PrintedCode } from "@/components/seo/printed-code";
import { WHATSAPP_LINES } from "@/lib/site";
import { buildHelloMessage, generateWhatsAppLink } from "@/lib/whatsapp";

/** Error boundary for pages inside the [lang] layout (header, footer and providers stay). */
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const { locale, t } = useI18n();
  const copy = t.site.error;
  const help = generateWhatsAppLink(WHATSAPP_LINES["bh-primary"].e164, buildHelloMessage(locale));

  useEffect(() => {
    // The digest matches the server log entry for errors thrown on the server.
    console.error("[3dbh] page error", error.digest ?? "", error);
    trackEvent("client_error", { where: "page", name: error.name, digest: error.digest ?? "", path: window.location.pathname });
  }, [error]);

  return (
    <section aria-labelledby="error-title" className="relative isolate overflow-hidden">
      <GridBackdrop />
      <div className="shell flex min-h-[100svh] flex-col justify-center pt-28 pb-20 md:pt-36 md:pb-28">
        <div className="max-w-xl">
          <p aria-hidden="true" className="text-[clamp(5rem,16vw,9rem)] leading-none text-fg">
            <PrintedCode code="500" progress={0.34} />
          </p>

          <h1
            id="error-title"
            className="mt-10 text-[clamp(2.125rem,4.6vw,3.5rem)] font-semibold leading-[1.02] tracking-[-0.035em] text-fg"
          >
            {copy.title}
          </h1>
          <p className="mt-5 max-w-md text-[1.0625rem] leading-relaxed text-fg-muted">{copy.body}</p>

          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Button size="lg" onClick={() => retry()}>
              <RotateCcw aria-hidden="true" strokeWidth={1.5} className="size-5" />
              {copy.retry}
            </Button>
            <ButtonLink href={help} variant="secondary" size="lg">
              <WhatsAppIcon className="size-5" />
              {t.common.actions.chatWhatsApp}
            </ButtonLink>
          </div>

          {error.digest ? (
            <p className="mt-8 font-mono text-sm text-fg-subtle" dir="ltr">
              {error.digest}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

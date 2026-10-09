"use client";

import { Fragment, useId, useState, type MouseEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Paperclip } from "lucide-react";
import type { MaterialId, Region } from "@/types";
import { MATERIALS } from "@/content/catalog";
import { useI18n } from "@/components/providers/i18n-provider";
import { SectionHeader } from "@/components/ui/section-header";
import { buttonStyles } from "@/components/ui/button";
import { WhatsAppIcon } from "@/components/ui/icons";
import { Reveal } from "@/components/motion/reveal";
import { QtyStepper } from "@/components/commerce/qty-stepper";
import {
  CharCount,
  Field,
  RegionChoice,
  Select,
  describedBy,
  enterToNextField,
  focusField,
  inputStyles,
} from "@/components/commerce/checkout-form";
import { LinePicker, useWhatsAppLine } from "@/components/commerce/line-picker";
import { REGION_CONFIG, site } from "@/lib/site";
import { useRegion } from "@/lib/hooks/use-region";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";
import { useUI } from "@/lib/store/ui";
import { usePrefs } from "@/lib/store/prefs";
import {
  CUSTOM_LIMITS,
  LIMITS,
  buildCustomRequestMessage,
  buildHelloMessage,
  createOrderRef,
  generateWhatsAppLink,
  isWithinUrlLimit,
  sanitizeText,
} from "@/lib/whatsapp";
import { trackCustomSent } from "@/lib/whatsapp/track";
import { playSound } from "@/lib/sound";
import { cn } from "@/lib/utils";

const EASE = [0.16, 1, 0.3, 1] as const;
const MAX_CUSTOM_QTY = 50;
const pad = (n: number) => String(n).padStart(2, "0");

type CustomField = "what" | "name" | "city";
/** Document order: the first invalid one gets focus on send. */
const CUSTOM_FIELDS: readonly CustomField[] = ["what", "name", "city"];
type CustomError = "what" | "name" | "nameShort" | "city" | "tooLong";

/**
 * 04 · Custom prints. The pitch and a few examples on one side; on the
 * other, a short brief that becomes a WhatsApp message to the region's line,
 * where photos and 3D files follow.
 */
export function CustomPrint() {
  const { t } = useI18n();
  const copy = t.commerce.custom;

  return (
    <section id="custom" aria-labelledby="custom-title" className="relative py-28 md:py-40">
      {/* grid-cols-1 is minmax(0, 1fr): the form can't push the column wider than a 360px screen. */}
      <div className="shell grid grid-cols-1 gap-14 lg:grid-cols-12 lg:gap-x-6">
        <div className="lg:sticky lg:top-28 lg:col-span-5 lg:self-start">
          <SectionHeader index="04" eyebrow={copy.eyebrow} title={copy.title} body={copy.body} id="custom-title" />

          <Reveal delay={0.08} y={12}>
            <ul className="mt-12 grid grid-cols-2 gap-x-6 border-b border-line font-mono text-[0.8125rem] leading-snug">
              {copy.examples.map((example, i) => (
                <li key={example} className="flex items-baseline gap-3 border-t border-line py-3.5">
                  <span dir="ltr" className="tabular text-platinum">{pad(i + 1)}</span>
                  <span className="text-fg">{example}</span>
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal delay={0.14} y={12}>
            <p className="mt-8 flex max-w-md items-start gap-3 text-[0.9375rem] leading-relaxed text-fg-muted">
              <Paperclip aria-hidden strokeWidth={1.5} className="mt-1 size-4 shrink-0 text-silver" />
              <span>{copy.note}</span>
            </p>
          </Reveal>
        </div>

        <div className="lg:col-span-7 lg:col-start-6 xl:col-span-6 xl:col-start-7">
          <Reveal delay={0.06}>
            <CustomForm />
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/** "3DBH-7K3Q2" once the visitor starts the brief; a dotted placeholder until then. */
function RefReadout({ value }: { value: string | null }) {
  const reduced = useReducedMotion();
  return (
    <span dir="ltr" className="font-mono text-xs tabular text-fg-muted">
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={value ?? "pending"}
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, transition: { duration: 0.12 } }}
          transition={{ duration: 0.35, ease: EASE }}
          className="inline-block"
        >
          {value ?? (
            <>
              {site.orderPrefix}-<span className="opacity-40">·····</span>
            </>
          )}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

function CustomForm() {
  const { t, locale } = useI18n();
  const copy = t.commerce.custom;
  const cartCopy = t.commerce.cart;
  const region = useRegion();
  const line = useWhatsAppLine(region);
  const setPrefsRegion = usePrefs((s) => s.setRegion);
  const toast = useUI((s) => s.toast);
  const reduced = useReducedMotion();
  const baseId = useId();
  const id = (field: string) => `${baseId}-${field}`;

  const [what, setWhat] = useState("");
  const [size, setSize] = useState("");
  const [material, setMaterial] = useState<MaterialId | "unsure">("unsure");
  const [colour, setColour] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [neededBy, setNeededBy] = useState("");
  const [name, setName] = useState("");
  const [cityChoice, setCityChoice] = useState("");
  const [requestRef, setRequestRef] = useState<string | null>(null);
  const [touched, setTouched] = useState<ReadonlySet<CustomField>>(() => new Set());

  // A city from the other region (after a region switch) counts as not chosen.
  const cities = REGION_CONFIG[region].cities;
  const city = cities.some((c) => c.id === cityChoice) ? cityChoice : "";

  const message = requestRef
    ? buildCustomRequestMessage({
        ref: requestRef,
        region,
        locale,
        description: what,
        size,
        material,
        colour,
        quantity,
        neededBy,
        customer: { name, city },
      })
    : null;
  // Before any interaction (and without JS) the link still opens a plain chat with the line.
  const href = generateWhatsAppLink(line.e164, message ?? buildHelloMessage(locale));

  const errors: Partial<Record<CustomField, CustomError>> = {};
  if (sanitizeText(what, CUSTOM_LIMITS.description).length < 3) errors.what = "what";
  else if (!isWithinUrlLimit(href)) errors.what = "tooLong";
  const nameLength = sanitizeText(name, LIMITS.name).length;
  if (nameLength === 0) errors.name = "name";
  else if (nameLength < 2) errors.name = "nameShort";
  if (!city) errors.city = "city";

  const shown = (field: CustomField) => (touched.has(field) ? errors[field] : undefined);
  const errMessage = (field: CustomField) => {
    const key = shown(field);
    return key ? copy.errors[key] : undefined;
  };
  const errId = (field: CustomField) => `${id(field)}-error`;
  const touch = (field: CustomField) => setTouched((prev) => (prev.has(field) ? prev : new Set(prev).add(field)));

  /** The request's reference is minted on first interaction: client-only, never during prerender. */
  const begin = () => {
    if (!requestRef) setRequestRef(createOrderRef());
  };

  const changeRegion = (next: Region) => {
    if (next !== region) playSound("switch");
    setPrefsRegion(next, true);
  };

  const onSend = (e: MouseEvent<HTMLAnchorElement>) => {
    begin();
    setTouched(new Set(CUSTOM_FIELDS));
    const first = CUSTOM_FIELDS.find((f) => errors[f]);
    if (first || !message) {
      e.preventDefault();
      playSound("tap");
      if (first) focusField(document.getElementById(id(first)), reduced);
      return;
    }
    playSound("send");
    toast({ title: cartCopy.sentTitle, body: copy.sentBody, ref: requestRef ?? "" });
    trackCustomSent({ region, line: line.id, lang: locale });
  };

  const aria = (field: CustomField, ...extra: (string | undefined)[]) => ({
    "aria-invalid": shown(field) ? true : undefined,
    "aria-describedby": describedBy(...extra, shown(field) && errId(field)),
  });

  const whatCountId = `${id("what")}-count`;

  return (
    <form
      data-testid="custom-form"
      noValidate
      aria-labelledby={id("title")}
      onSubmit={(e) => e.preventDefault()}
      onKeyDown={enterToNextField}
      onFocus={begin}
      className="relative rounded-2xl border border-line bg-ink-900 p-5 shadow-[inset_0_1px_0_0_rgb(255_255_255/0.05)] sm:p-7 md:p-9"
    >
      <div className="flex items-center justify-between gap-4 border-b border-line pb-5">
        <p id={id("title")} className="eyebrow">
          {copy.requestLabel}
        </p>
        <RefReadout value={requestRef} />
      </div>

      <div className="mt-7 grid gap-6 sm:grid-cols-2 sm:gap-x-4">
        <Field
          className="sm:col-span-2"
          id={id("what")}
          label={copy.what}
          aside={<CharCount id={whatCountId} value={what.length} max={CUSTOM_LIMITS.description} />}
          error={errMessage("what")}
          errorId={errId("what")}
          errorTestId="error-custom-what"
        >
          <textarea
            id={id("what")}
            name="description"
            data-testid="custom-what"
            required
            rows={4}
            maxLength={CUSTOM_LIMITS.description}
            placeholder={copy.whatPlaceholder}
            value={what}
            onChange={(e) => {
              begin();
              setWhat(e.target.value);
            }}
            onBlur={() => touch("what")}
            {...aria("what", whatCountId)}
            className={cn(inputStyles, "min-h-32 resize-none py-3 leading-relaxed")}
          />
        </Field>

        <Field id={id("size")} label={copy.size} optional={cartCopy.optional}>
          <input
            id={id("size")}
            name="size"
            type="text"
            maxLength={CUSTOM_LIMITS.size}
            placeholder={copy.sizePlaceholder}
            value={size}
            onChange={(e) => setSize(e.target.value)}
            className={cn(inputStyles, "h-12")}
          />
        </Field>

        <Field id={id("colour")} label={copy.colour} optional={cartCopy.optional}>
          <input
            id={id("colour")}
            name="colour"
            type="text"
            maxLength={CUSTOM_LIMITS.colour}
            placeholder={copy.colourPlaceholder}
            value={colour}
            onChange={(e) => setColour(e.target.value)}
            className={cn(inputStyles, "h-12")}
          />
        </Field>

        <Field id={id("material")} label={copy.material}>
          <Select
            id={id("material")}
            name="material"
            data-testid="custom-material"
            value={material}
            onChange={(e) => setMaterial(e.target.value as MaterialId | "unsure")}
          >
            <option value="unsure">{copy.materialUnsure}</option>
            {MATERIALS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name[locale]}
              </option>
            ))}
          </Select>
        </Field>

        <div>
          <p className="text-sm font-medium text-fg">{copy.quantity}</p>
          <div className="mt-2 flex h-12 items-center">
            <QtyStepper
              value={quantity}
              max={MAX_CUSTOM_QTY}
              label={copy.quantity}
              onChange={(n) => {
                begin();
                setQuantity(n);
              }}
            />
          </div>
        </div>

        <Field className="sm:col-span-2" id={id("neededBy")} label={copy.neededBy} optional={cartCopy.optional}>
          <input
            id={id("neededBy")}
            name="neededBy"
            type="text"
            maxLength={CUSTOM_LIMITS.neededBy}
            placeholder={copy.neededByPlaceholder}
            value={neededBy}
            onChange={(e) => setNeededBy(e.target.value)}
            className={cn(inputStyles, "h-12")}
          />
        </Field>
      </div>

      <div className="mt-9 border-t border-line pt-7">
        <p className="eyebrow">{copy.details}</p>

        {/* Where it's for decides the line and the city list, so it's chosen here, not only in the header. */}
        <div className="mt-5">
          <p id={id("region")} className="text-sm font-medium text-fg">
            {cartCopy.region}
          </p>
          <RegionChoice
            region={region}
            onChange={changeRegion}
            labelledBy={id("region")}
            testIdPrefix="custom-"
            className="mt-2 sm:max-w-sm"
          />
        </div>

        {REGION_CONFIG[region].lines.length > 1 ? (
          <div className="mt-6">
            <p className="text-sm font-medium text-fg">{cartCopy.sendTo}</p>
            <LinePicker region={region} testIdPrefix="custom-" label={cartCopy.sendTo} className="mt-2 sm:max-w-md" />
          </div>
        ) : null}

        <div className="mt-6 grid gap-6 sm:grid-cols-2 sm:gap-x-4">
          <Field
            id={id("name")}
            label={copy.name}
            error={errMessage("name")}
            errorId={errId("name")}
            errorTestId="error-custom-name"
          >
            <input
              id={id("name")}
              name="name"
              data-testid="custom-name"
              type="text"
              required
              autoComplete="name"
              maxLength={LIMITS.name}
              value={name}
              onChange={(e) => {
                begin();
                setName(e.target.value);
              }}
              onBlur={() => touch("name")}
              {...aria("name")}
              className={cn(inputStyles, "h-12")}
            />
          </Field>

          <Field
            id={id("city")}
            label={copy.city}
            error={errMessage("city")}
            errorId={errId("city")}
            errorTestId="error-custom-city"
          >
            <Select
              id={id("city")}
              name="city"
              data-testid="custom-city"
              required
              autoComplete="address-level2"
              value={city}
              onChange={(e) => {
                begin();
                setCityChoice(e.target.value);
                touch("city");
              }}
              onBlur={() => touch("city")}
              {...aria("city")}
            >
              <option value="" disabled>
                {cartCopy.cityPlaceholder}
              </option>
              {cities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name[locale]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </div>

      <div className="mt-9 border-t border-line pt-6">
        <p id={id("dest")} className="text-sm text-fg-muted">
          {copy.sendingTo}{" "}
          {/* "Bahrain · Line 1 · +973 3985 8885", with room around each separator. */}
          {[...line.label[locale].split(" · "), line.display].map((part, i, parts) => (
            <Fragment key={i}>
              {i === parts.length - 1 ? (
                <span dir="ltr" className="font-mono tabular text-fg">
                  {part}
                </span>
              ) : (
                <span className="text-fg">{part}</span>
              )}
              {i < parts.length - 1 ? (
                <span aria-hidden className="mx-1.5 text-fg-muted">
                  ·
                </span>
              ) : null}
            </Fragment>
          ))}
        </p>

        <a
          data-testid="custom-send"
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-describedby={id("dest")}
          onClick={onSend}
          onAuxClick={(e) => {
            if (e.button === 1) onSend(e);
          }}
          className={buttonStyles({
            variant: "primary",
            size: "lg",
            // On a narrow phone the label wraps instead of widening the form.
            className: "mt-6 w-full max-sm:h-auto max-sm:min-h-13 max-sm:whitespace-normal max-sm:px-5 max-sm:py-3 max-sm:text-center sm:w-auto",
          })}
        >
          <WhatsAppIcon className="size-5" />
          {copy.send}
        </a>
      </div>
    </form>
  );
}

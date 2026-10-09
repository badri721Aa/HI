import { Instrument_Sans, JetBrains_Mono, Tajawal } from "next/font/google";

// Weight axis only: nothing uses font-stretch, and the width axis doubles the file.
export const instrument = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument",
  display: "swap",
});

export const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-jetbrains",
  display: "swap",
});

/*
 * Not preloaded: the root layout is shared by /en and /ar, so a preload would
 * fetch every Arabic weight on English pages too (where only the language
 * switch's label is Arabic). The unicode-range rules load it as soon as
 * Arabic text renders.
 */
export const tajawal = Tajawal({
  subsets: ["arabic"],
  weight: ["400", "500", "700"],
  variable: "--font-tajawal",
  display: "swap",
  preload: false,
});

export const fontVariables = `${instrument.variable} ${jetbrains.variable} ${tajawal.variable}`;

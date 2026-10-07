/**
 * Reads the pixel size from a WebP, PNG or JPEG header, so catalog tests can
 * check declared image sizes against the real files without an image library.
 */
export interface ImageSize {
  format: "webp" | "png" | "jpeg";
  width: number;
  height: number;
}

const ascii = (buf: Uint8Array, start: number, end: number) => String.fromCharCode(...buf.subarray(start, end));
const u16le = (buf: Uint8Array, i: number) => buf[i] | (buf[i + 1] << 8);
const u24le = (buf: Uint8Array, i: number) => buf[i] | (buf[i + 1] << 8) | (buf[i + 2] << 16);
const u16be = (buf: Uint8Array, i: number) => (buf[i] << 8) | buf[i + 1];
const u32be = (buf: Uint8Array, i: number) => ((buf[i] << 24) >>> 0) + (buf[i + 1] << 16) + (buf[i + 2] << 8) + buf[i + 3];

function webpSize(buf: Uint8Array): ImageSize | null {
  if (ascii(buf, 0, 4) !== "RIFF" || ascii(buf, 8, 12) !== "WEBP") return null;
  const chunk = ascii(buf, 12, 16);
  if (chunk === "VP8 ") {
    // Frame tag (3 bytes), start code 9d 01 2a, then 14-bit width and height.
    if (buf[23] !== 0x9d || buf[24] !== 0x01 || buf[25] !== 0x2a) return null;
    return { format: "webp", width: u16le(buf, 26) & 0x3fff, height: u16le(buf, 28) & 0x3fff };
  }
  if (chunk === "VP8L") {
    if (buf[20] !== 0x2f) return null;
    const bits = buf[21] | (buf[22] << 8) | (buf[23] << 16) | (buf[24] << 24);
    return { format: "webp", width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (chunk === "VP8X") {
    return { format: "webp", width: u24le(buf, 24) + 1, height: u24le(buf, 27) + 1 };
  }
  return null;
}

function pngSize(buf: Uint8Array): ImageSize | null {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (!signature.every((b, i) => buf[i] === b) || ascii(buf, 12, 16) !== "IHDR") return null;
  return { format: "png", width: u32be(buf, 16), height: u32be(buf, 20) };
}

function jpegSize(buf: Uint8Array): ImageSize | null {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1];
    const length = u16be(buf, i + 2);
    // SOF0–SOF15 except DHT (C4), JPG (C8) and DAC (CC).
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { format: "jpeg", width: u16be(buf, i + 7), height: u16be(buf, i + 5) };
    }
    i += 2 + length;
  }
  return null;
}

export function imageSize(buf: Uint8Array): ImageSize | null {
  return webpSize(buf) ?? pngSize(buf) ?? jpegSize(buf);
}

/** Decodes a base64 data URI into bytes and its declared MIME type. */
export function decodeDataUri(uri: string): { mime: string; bytes: Uint8Array } | null {
  const match = /^data:([\w/+.-]+);base64,([A-Za-z0-9+/]+={0,2})$/.exec(uri);
  if (!match) return null;
  return { mime: match[1], bytes: new Uint8Array(Buffer.from(match[2], "base64")) };
}

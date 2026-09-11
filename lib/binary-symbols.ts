export interface BinarySymbol {
  name: string
  /** File-relative virtual address / RVA, hex-formatted for display. */
  address: string
}

export interface ParsedBinary {
  format: "ELF" | "PE"
  arch: string
  symbols: BinarySymbol[]
}

function readCString(view: DataView, offset: number): string {
  let end = offset
  while (end < view.byteLength && view.getUint8(end) !== 0) end++
  const bytes = new Uint8Array(view.buffer, view.byteOffset + offset, end - offset)
  return new TextDecoder("ascii").decode(bytes)
}

/** ELF dynamic symbol table — what `.so` files (Android/Linux IL2CPP
 * builds) export. Mirrors what Frida's Module.enumerateExports() would
 * show you at runtime, read statically from the file instead. */
function parseElf(view: DataView): ParsedBinary {
  const is64 = view.getUint8(4) === 2
  const littleEndian = view.getUint8(5) === 1
  const le = littleEndian

  const eMachine = view.getUint16(18, le)
  const archMap: Record<number, string> = { 3: "x86", 40: "ARM", 62: "x86-64", 183: "ARM64" }
  const arch = archMap[eMachine] ?? `machine 0x${eMachine.toString(16)}`

  const shoff = is64 ? Number(view.getBigUint64(40, le)) : view.getUint32(32, le)
  const shentsize = view.getUint16(is64 ? 58 : 46, le)
  const shnum = view.getUint16(is64 ? 60 : 48, le)

  interface Section {
    type: number
    link: number
    offset: number
    entsize: number
    size: number
  }
  const sections: Section[] = []
  for (let i = 0; i < shnum; i++) {
    const base = shoff + i * shentsize
    if (is64) {
      sections.push({
        type: view.getUint32(base + 4, le),
        link: view.getUint32(base + 40, le),
        offset: Number(view.getBigUint64(base + 24, le)),
        size: Number(view.getBigUint64(base + 32, le)),
        entsize: Number(view.getBigUint64(base + 56, le)),
      })
    } else {
      sections.push({
        type: view.getUint32(base + 4, le),
        link: view.getUint32(base + 40, le),
        offset: view.getUint32(base + 16, le),
        size: view.getUint32(base + 20, le),
        entsize: view.getUint32(base + 36, le),
      })
    }
  }

  const SHT_DYNSYM = 11
  const dynsym = sections.find((s) => s.type === SHT_DYNSYM)
  if (!dynsym) return { format: "ELF", arch, symbols: [] }
  const strtab = sections[dynsym.link]
  if (!strtab) return { format: "ELF", arch, symbols: [] }

  const symbols: BinarySymbol[] = []
  const entsize = dynsym.entsize || (is64 ? 24 : 16)
  const count = Math.floor(dynsym.size / entsize)

  for (let i = 0; i < count; i++) {
    const base = dynsym.offset + i * entsize
    let nameOff: number
    let value: bigint | number
    if (is64) {
      nameOff = view.getUint32(base, le)
      value = view.getBigUint64(base + 8, le)
    } else {
      nameOff = view.getUint32(base, le)
      value = view.getUint32(base + 4, le)
    }
    if (nameOff === 0) continue
    const name = readCString(view, strtab.offset + nameOff)
    if (!name) continue
    symbols.push({ name, address: `0x${value.toString(16)}` })
  }

  return { format: "ELF", arch, symbols }
}

/** PE export directory table — what `.dll` files (Windows IL2CPP builds,
 * GameAssembly.dll) export by name. */
function parsePe(view: DataView): ParsedBinary {
  const le = true
  const peOffset = view.getUint32(0x3c, le)
  const machine = view.getUint16(peOffset + 4, le)
  const archMap: Record<number, string> = { 0x14c: "x86", 0x8664: "x86-64", 0xaa64: "ARM64" }
  const arch = archMap[machine] ?? `machine 0x${machine.toString(16)}`

  const numSections = view.getUint16(peOffset + 6, le)
  const optHeaderSize = view.getUint16(peOffset + 20, le)
  const optHeaderOffset = peOffset + 24
  const magic = view.getUint16(optHeaderOffset, le)
  const isPe32Plus = magic === 0x20b

  // DataDirectory[0] (export table) sits right after a fixed run of
  // standard + Windows-specific optional-header fields, whose length
  // differs between PE32 and PE32+.
  const dataDirOffset = optHeaderOffset + (isPe32Plus ? 112 : 96)
  const exportRva = view.getUint32(dataDirOffset, le)
  const exportSize = view.getUint32(dataDirOffset + 4, le)

  const sectionTableOffset = optHeaderOffset + optHeaderSize
  interface Section {
    va: number
    rawOffset: number
    rawSize: number
  }
  const sections: Section[] = []
  for (let i = 0; i < numSections; i++) {
    const base = sectionTableOffset + i * 40
    sections.push({
      va: view.getUint32(base + 12, le),
      rawSize: view.getUint32(base + 16, le),
      rawOffset: view.getUint32(base + 20, le),
    })
  }

  const rvaToOffset = (rva: number): number | null => {
    for (const s of sections) {
      if (rva >= s.va && rva < s.va + s.rawSize) return s.rawOffset + (rva - s.va)
    }
    return null
  }

  if (!exportRva || !exportSize) return { format: "PE", arch, symbols: [] }
  const exportOffset = rvaToOffset(exportRva)
  if (exportOffset === null) return { format: "PE", arch, symbols: [] }

  const numberOfNames = view.getUint32(exportOffset + 24, le)
  const addressOfNamesRva = view.getUint32(exportOffset + 32, le)
  const namesOffset = rvaToOffset(addressOfNamesRva)
  if (namesOffset === null) return { format: "PE", arch, symbols: [] }

  const symbols: BinarySymbol[] = []
  for (let i = 0; i < numberOfNames; i++) {
    const nameRva = view.getUint32(namesOffset + i * 4, le)
    const nameOffset = rvaToOffset(nameRva)
    if (nameOffset === null) continue
    const name = readCString(view, nameOffset)
    if (name) symbols.push({ name, address: `rva 0x${nameRva.toString(16)}` })
  }

  return { format: "PE", arch, symbols }
}

/** Parses a `.so` (ELF) or `.dll` (PE) file's exported symbol table.
 * Runs entirely client-side — the file never leaves the browser. */
export function parseBinarySymbols(buffer: ArrayBuffer): ParsedBinary {
  const view = new DataView(buffer)
  if (view.byteLength >= 4 && view.getUint32(0, false) === 0x7f454c46) {
    return parseElf(view)
  }
  if (view.byteLength >= 2 && view.getUint16(0, true) === 0x5a4d) {
    return parsePe(view)
  }
  throw new Error("Not a recognized ELF (.so) or PE (.dll) file.")
}

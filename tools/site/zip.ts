// Minimal zip reader for .vsix files in the browser — central directory + local
// headers, stored (0) or deflated (8) entries. No zip64 (vsix theme packages are
// tiny). Inflate is injected so the same code runs in the browser
// (DecompressionStream) and in tests (node:zlib).
export interface ZipEntry { name: string; method: number; compressedSize: number; size: number; offset: number }

const SIG_EOCD = 0x06054b50, SIG_CD = 0x02014b50, SIG_LOCAL = 0x04034b50;

export function readCentralDirectory(buf: Uint8Array): ZipEntry[] {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
    if (dv.getUint32(i, true) === SIG_EOCD) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("not a zip (no end-of-central-directory)");
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const out: ZipEntry[] = [];
  const td = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== SIG_CD) throw new Error("corrupt central directory");
    const method = dv.getUint16(p + 10, true);
    const compressedSize = dv.getUint32(p + 20, true);
    const size = dv.getUint32(p + 24, true);
    const nameLen = dv.getUint16(p + 28, true), extraLen = dv.getUint16(p + 30, true), commentLen = dv.getUint16(p + 32, true);
    const offset = dv.getUint32(p + 42, true);
    const name = td.decode(buf.subarray(p + 46, p + 46 + nameLen));
    out.push({ name, method, compressedSize, size, offset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

export type InflateRaw = (data: Uint8Array) => Promise<Uint8Array>;

export async function extractEntry(buf: Uint8Array, e: ZipEntry, inflateRaw: InflateRaw): Promise<Uint8Array> {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (dv.getUint32(e.offset, true) !== SIG_LOCAL) throw new Error(`corrupt local header for ${e.name}`);
  const nameLen = dv.getUint16(e.offset + 26, true), extraLen = dv.getUint16(e.offset + 28, true);
  const start = e.offset + 30 + nameLen + extraLen;
  const data = buf.subarray(start, start + e.compressedSize);
  if (e.method === 0) return data;
  if (e.method === 8) return inflateRaw(data);
  throw new Error(`unsupported zip compression method ${e.method} for ${e.name}`);
}

/** Browser inflate via the streams API (raw deflate, as zip stores it). */
export async function inflateRawWeb(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("deflate-raw");
  const res = new Response(new Blob([data as BlobPart]).stream().pipeThrough(ds));
  return new Uint8Array(await res.arrayBuffer());
}

export async function readTextEntry(buf: Uint8Array, entries: ZipEntry[], name: string, inflateRaw: InflateRaw): Promise<string | null> {
  const norm = name.replace(/^\.\//, "").replace(/\/\.\//g, "/");
  const e = entries.find((x) => x.name === norm);
  if (!e) return null;
  return new TextDecoder().decode(await extractEntry(buf, e, inflateRaw));
}

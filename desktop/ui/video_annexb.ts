/** Bounded Annex-B access-unit parser for the experimental Android screen encoder. */
const LIMIT = 4 * 1024 * 1024;
const PREFIX = new Uint8Array([0, 0, 0, 1]);
export interface AccessUnit { bytes: Uint8Array; key: boolean; codec: string; }

function startCodes(bytes: Uint8Array): { at: number; length: number }[] {
  const offsets: { at: number; length: number }[] = [];
  for (let i = 0; i + 2 < bytes.length; i++) {
    if (bytes[i] || bytes[i + 1]) continue;
    if (bytes[i + 2] === 1) { offsets.push({ at: i, length: 3 }); i += 2; }
    else if (i + 3 < bytes.length && bytes[i + 2] === 0 && bytes[i + 3] === 1) { offsets.push({ at: i, length: 4 }); i += 3; }
  }
  return offsets;
}

export class AnnexBParser {
  private tail = new Uint8Array(0);
  private unit: Uint8Array[] = [];
  private unitBytes = 0;
  private hasSlice = false;
  private isKey = false;
  private sps: Uint8Array | null = null;
  private pps: Uint8Array | null = null;

  push(chunk: Uint8Array): AccessUnit[] {
    if (this.tail.length + chunk.length > LIMIT) throw new Error('Video NAL buffer limit exceeded');
    const bytes = new Uint8Array(this.tail.length + chunk.length);
    bytes.set(this.tail); bytes.set(chunk, this.tail.length);
    const offsets = startCodes(bytes);
    if (!offsets.length) { this.tail = bytes; return []; }
    const units: AccessUnit[] = [];
    for (let i = 0; i + 1 < offsets.length; i++) {
      const offset = offsets[i];
      this.nal(bytes.slice(offset.at + offset.length, offsets[i + 1].at), units);
    }
    this.tail = bytes.slice(offsets[offsets.length - 1].at);
    return units;
  }

  private nal(nal: Uint8Array, out: AccessUnit[]): void {
    if (!nal.length) return;
    const type = nal[0] & 31;
    const slice = type === 1 || type === 5;
    if (type >= 2 && type <= 4) throw new Error('Unsupported partitioned video slices');
    if (slice && nal.length < 2) throw new Error('Incomplete video slice');
    // first_mb_in_slice is an unsigned Exp-Golomb; zero is encoded as the first bit 1.
    if (this.hasSlice && (type === 9 || type === 7 || type === 8 || type === 6 || (slice && (nal[1] & 128) !== 0))) this.emit(out);
    if (type === 7) { if (nal.length < 4) throw new Error('Invalid video SPS'); this.sps = nal; }
    if (type === 8) this.pps = nal;
    this.unitBytes += nal.length + 4;
    if (this.unitBytes > LIMIT) throw new Error('Video access-unit size limit exceeded');
    this.unit.push(nal);
    if (slice) { this.hasSlice = true; this.isKey ||= type === 5; }
  }

  private emit(out: AccessUnit[]): void {
    if (!this.hasSlice) return;
    if (this.sps && this.pps) {
      const codec = 'avc1.' + Array.from(this.sps.subarray(1, 4), v => v.toString(16).padStart(2, '0')).join('');
      const nals = this.isKey ? [this.sps, this.pps, ...this.unit.filter(nal => ![7, 8].includes(nal[0] & 31))] : this.unit;
      const length = nals.reduce((sum, nal) => sum + 4 + nal.length, 0);
      if (length > LIMIT) throw new Error('Video access-unit size limit exceeded');
      const bytes = new Uint8Array(length);
      let cursor = 0;
      for (const nal of nals) { bytes.set(PREFIX, cursor); bytes.set(nal, cursor + 4); cursor += 4 + nal.length; }
      out.push({ bytes, key: this.isKey, codec });
    }
    this.unit = []; this.unitBytes = 0; this.hasSlice = false; this.isKey = false;
  }
}

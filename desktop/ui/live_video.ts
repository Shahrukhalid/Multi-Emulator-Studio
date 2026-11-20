import { AnnexBParser } from './video_annexb.js';
import type { IApiClient } from './api.js';

/** One explicitly requested, bounded encoded stream; caller restores PNG on termination. */
export class LiveVideo {
  private token: string | null = null;
  private decoder: VideoDecoder | null = null;
  private closed = false;
  private timer: number | null = null;
  private parser = new AnnexBParser();
  private codec = '';
  private timestamp = 0;
  private lastFrame = 0;
  private frames = 0;
  private firstFrame = 0;

  constructor(private api: IApiClient, private id: string, private canvas: HTMLCanvasElement,
    private onFrame: (width: number, height: number, fps: number | null) => void, private onEnd: (reason: string) => void) {}

  async start(): Promise<void> {
    if (typeof VideoDecoder === 'undefined' || typeof EncodedVideoChunk === 'undefined') { this.end('Video decoder unavailable; PNG refresh restored.'); return; }
    try {
      const token = await this.api.dispatch<string>({ action: 'video_start', id: this.id });
      if (this.closed) { await this.api.dispatch({ action: 'video_stop', id: this.id, token }).catch(() => {}); return; }
      this.token = token;
      this.lastFrame = performance.now();
      this.decoder = new VideoDecoder({ output: frame => {
        try {
          if (this.closed) return;
          if (this.canvas.width !== frame.displayWidth || this.canvas.height !== frame.displayHeight) {
            this.canvas.width = frame.displayWidth; this.canvas.height = frame.displayHeight;
          }
          const context = this.canvas.getContext('2d');
          if (!context) { this.end('Canvas unavailable; PNG refresh restored.'); return; }
          context.drawImage(frame, 0, 0);
          const now = performance.now(); this.lastFrame = now;
          if (!this.frames) this.firstFrame = now;
          const elapsed = now - this.firstFrame;
          this.frames++;
          this.onFrame(frame.displayWidth, frame.displayHeight, elapsed > 0 && this.frames > 1 ? (this.frames - 1) * 1000 / elapsed : null);
        } catch { this.end('Video presentation failed; PNG refresh restored.'); }
        finally { frame.close(); }
      }, error: () => this.end(`Video decoding failed; PNG refresh restored.`) });
      void this.read();
    } catch { this.end('Native video unavailable; PNG refresh restored.'); }
  }

  private async read(): Promise<void> {
    if (this.closed || !this.token || !this.decoder) return;
    try {
      if (performance.now() - this.lastFrame > 5000) throw new Error('No video frames');
      if (this.decoder.decodeQueueSize < 8) {
        const packet = new Uint8Array(await this.api.videoRead(this.id, this.token));
        if (this.closed) return;
        if (packet[0] === 2) { this.end('Video session ended; PNG refresh restored.'); return; }
        if (packet[0] === 1) for (const unit of this.parser.push(packet.subarray(1))) {
          if (!this.codec) {
            if (!unit.key) continue;
            this.decoder.configure({ codec: unit.codec, optimizeForLatency: true });
            this.codec = unit.codec;
          }
          if (unit.codec !== this.codec || this.decoder.decodeQueueSize >= 16) throw new Error('Video decoder synchronization lost');
          this.timestamp += 33333;
          this.decoder.decode(new EncodedVideoChunk({ type: unit.key ? 'key' : 'delta', timestamp: this.timestamp, data: new Uint8Array(unit.bytes) }));
        }
      }
      if (!this.closed) this.timer = window.setTimeout(() => void this.read(), 15);
    } catch { this.end('Video interrupted; PNG refresh restored.'); }
  }

  stop(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.timer !== null) window.clearTimeout(this.timer);
    if (this.decoder && this.decoder.state !== 'closed') this.decoder.close();
    if (this.token) void this.api.dispatch({ action: 'video_stop', id: this.id, token: this.token }).catch(() => {});
  }
  private end(reason: string): void { if (!this.closed) { this.stop(); this.onEnd(reason); } }
}

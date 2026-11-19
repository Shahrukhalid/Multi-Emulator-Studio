import { IApiClient } from '../api.js';
import { Device, GoogleApps, NavigationKey, TouchInput } from '../types.js';
import { FrameScheduler, FrameMetrics } from '../frame_scheduler.js';
import { LiveVideo } from '../live_video.js';

export class PhoneViewer {
  // One bounded capture at a time across the entire local workspace.
  private static scheduler = new FrameScheduler();
  private static nextPanel = 0;
  private readonly panelId = String(++PhoneViewer.nextPanel);
  private readonly metrics = new FrameMetrics();
  readonly element = document.createElement('div');
  private closed = false;
  private timer: number | null = null;
  private frame: { width: number; height: number } | null = null;
  private frameUrl: string | null = null;
  private video: LiveVideo | null = null;
  private visible = false;
  private observer: IntersectionObserver | null = null;
  private busy = false;
  private capturing = false;
  private failures = 0;
  private terminal = false;
  private checkedApps = false;
  private apps: GoogleApps | null = null;
  private start: { x: number; y: number; width: number; height: number } | null = null;
  private visibilityChanged = () => { this.metrics.reset(); if (document.hidden) this.stopVideo('Video paused while hidden.'); this.schedule(0); };

  constructor(private api: IApiClient, private device: Device, onClose: () => void) {
    this.element.className = 'phone-panel';
    this.element.innerHTML = `<section class="phone-viewer" role="region" aria-label="Android device screen">
      <header class="modal-title-bar"><h2 class="phone-title"></h2><button class="btn-overflow-menu phone-close" aria-label="Close">×</button></header>
      <div class="phone-display"><p class="phone-status" role="status">Waiting for Android…</p><img class="phone-frame" alt="Live Android screen" draggable="false" hidden /><canvas class="phone-video-frame" aria-label="Experimental live video" hidden></canvas></div>
      <nav class="phone-navigation" aria-label="Android navigation">
        <button data-key="back" aria-label="Back" title="Back" disabled>◁</button>
        <button data-key="home" aria-label="Home" title="Home" disabled>○</button>
        <button data-key="recents" aria-label="Recent apps" title="Recent apps" disabled>□</button>
      </nav><div class="phone-hardware" aria-label="Device controls">
        <button data-key="volume_down" disabled>Volume −</button>
        <button data-key="volume_up" disabled>Volume +</button>
        <button data-key="power" disabled>Power</button>
      </div><button class="phone-app-check" disabled>Check Play Store &amp; YouTube</button><button class="phone-app-check phone-youtube-store" hidden disabled>Get YouTube from Play Store</button><button class="phone-app-check phone-video-toggle" disabled>Try live video (30s)</button><p class="phone-app-status" role="status"></p><p class="phone-viewer-note" role="status">Local screen refresh · click to tap, drag to swipe</p><p class="phone-frame-metrics" aria-label="Screen refresh performance">Waiting for frames</p>
    </section>`;
    this.element.querySelector('.phone-title')!.textContent = device.spec.name;
    this.element.querySelector('.phone-close')!.addEventListener('click', onClose);
    this.element.querySelector('.phone-app-check')!.addEventListener('click', () => void this.checkApps());
    this.element.querySelector('.phone-youtube-store')!.addEventListener('click', () => void this.send({ action: 'open_youtube_store', id: this.device.id }));
    this.element.querySelector('.phone-video-toggle')!.addEventListener('click', () => this.video ? this.stopVideo('PNG refresh restored.') : this.startVideo());
    for (const image of Array.from(this.element.querySelectorAll<HTMLElement>('.phone-frame, .phone-video-frame'))) {
    image.addEventListener('pointerdown', e => {
      if (!this.frame || this.busy || e.button !== 0) return;
      this.start = { ...this.point(e, image), width: this.frame.width, height: this.frame.height };
      image.setPointerCapture(e.pointerId);
    });
    image.addEventListener('pointercancel', () => { this.start = null; });
    image.addEventListener('pointerup', e => {
      const start = this.start;
      this.start = null;
      if (!start || !this.frame || start.width !== this.frame.width || start.height !== this.frame.height) return;
      const end = this.point(e, image);
      const input: TouchInput = Math.hypot(end.x - start.x, end.y - start.y) < 15
        ? { kind: 'tap', ...end }
        : { kind: 'swipe', x: start.x, y: start.y, end_x: end.x, end_y: end.y };
      void this.send({ action: 'touch', id: this.device.id, input });
    });
    }
    this.element.querySelectorAll<HTMLButtonElement>('[data-key]').forEach(button => {
      button.addEventListener('click', () => {
        void this.send({ action: 'navigate', id: this.device.id, key: button.dataset.key as NavigationKey });
      });
    });
  }

  begin(): void {
    document.addEventListener('visibilitychange', this.visibilityChanged);
    this.observer = new IntersectionObserver(entries => {
      this.visible = entries.some(entry => entry.isIntersecting);
      if (!this.visible) { this.metrics.reset(); this.stopVideo('Video paused while hidden.'); }
      this.schedule(0);
    });
    this.observer.observe(this.element);
  }
  dispose(): void {
    this.closed = true;
    this.stopVideo('');
    PhoneViewer.scheduler.cancel(this.panelId);
    this.observer?.disconnect();
    if (this.frameUrl) URL.revokeObjectURL(this.frameUrl);
    document.removeEventListener('visibilitychange', this.visibilityChanged);
    if (this.timer !== null) window.clearTimeout(this.timer);
  }

  private schedule(delay: number): void {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
    if (this.closed || this.terminal || !this.visible || document.hidden || this.busy || this.capturing || this.video) {
      PhoneViewer.scheduler.cancel(this.panelId);
      return;
    }
    this.timer = window.setTimeout(() => { this.timer = null; void this.refresh(); }, delay);
  }

  private updateControls(): void {
    this.element.querySelectorAll<HTMLButtonElement>('[data-key]').forEach(b => {
      b.disabled = !this.frame || this.busy;
    });
    (this.element.querySelector('.phone-app-check') as HTMLButtonElement).disabled = !this.frame || this.busy;
    const store = this.element.querySelector('.phone-youtube-store') as HTMLButtonElement;
    store.hidden = !this.apps?.play_store || !!this.apps.youtube;
    store.disabled = !this.frame || this.busy;
    const video = this.element.querySelector('.phone-video-toggle') as HTMLButtonElement;
    video.disabled = !this.video && (!this.frame || this.busy || this.capturing || !this.visible);
    video.textContent = this.video ? 'Stop live video' : 'Try live video (30s)';
  }

  private startVideo(): void {
    if (this.video || !this.frame || this.closed || this.busy || this.capturing || !this.visible || document.hidden) return;
    const canvas = this.element.querySelector<HTMLCanvasElement>('.phone-video-frame')!;
    const image = this.element.querySelector<HTMLImageElement>('.phone-frame')!;
    const native = this.frame;
    const stream = new LiveVideo(this.api, this.device.id, canvas, (width, height, fps) => {
      if (this.video !== stream || this.closed) return;
      if (Math.abs(width / height - native.width / native.height) > 0.03) { this.stopVideo('Screen orientation changed; PNG refresh restored.'); return; }
      canvas.hidden = false; image.hidden = true;
      this.element.querySelector('.phone-frame-metrics')!.textContent = `Experimental video · ${fps === null ? 'Measuring' : fps.toFixed(1) + ' decoded frames/s'}`;
    }, reason => { if (this.video === stream) this.stopVideo(reason); });
    this.video = stream;
    this.start = null;
    this.schedule(0);
    this.updateControls();
    this.element.querySelector('.phone-viewer-note')!.textContent = 'Starting experimental encoded video…';
    void stream.start();
  }

  private stopVideo(reason: string): void {
    if (!this.video) return;
    const stream = this.video; this.video = null;
    stream.stop();
    this.start = null;
    this.element.querySelector<HTMLCanvasElement>('.phone-video-frame')!.hidden = true;
    this.element.querySelector<HTMLImageElement>('.phone-frame')!.hidden = !this.frame;
    this.element.querySelector('.phone-viewer-note')!.textContent = reason || 'Local screen refresh';
    this.metrics.reset(); this.updateControls(); this.schedule(0);
  }

  private async checkApps(): Promise<void> {
    if (!this.frame || this.busy || this.closed) return;
    this.busy = true;
    this.updateControls();
    const status = this.element.querySelector('.phone-app-status')!;
    status.textContent = 'Checking installed apps…';
    try {
      const apps = await this.api.dispatch<GoogleApps>({ action: 'google_apps', id: this.device.id });
      this.apps = apps;
      status.textContent = `Play Store: ${apps.play_store ? 'installed' : 'missing'} · YouTube: ${apps.youtube_preinstalled ? 'preinstalled' : apps.youtube ? 'installed' : 'missing — install via Play Store'}`;
    } catch { status.textContent = 'App check failed; try again after Android is ready.'; }
    finally { this.busy = false; this.updateControls(); this.schedule(0); }
  }

  private point(e: PointerEvent, image: HTMLElement): { x: number; y: number } {
    const box = image.getBoundingClientRect();
    const { width, height } = this.frame!;
    return { x: Math.max(0, Math.min(width - 1, Math.floor((e.clientX - box.left) / box.width * width))), y: Math.max(0, Math.min(height - 1, Math.floor((e.clientY - box.top) / box.height * height))) };
  }

  private async send(request: { action: 'navigate'; id: string; key: NavigationKey } | { action: 'touch'; id: string; input: TouchInput } | { action: 'open_youtube_store'; id: string }): Promise<void> {
    if (!this.frame || this.busy || this.closed) return;
    this.busy = true;
    this.schedule(0);
    this.updateControls();
    const note = this.element.querySelector('.phone-viewer-note')!;
    try { await this.api.dispatch<boolean>(request); }
    catch { note.textContent = 'Input failed. Try again when the device responds.'; }
    finally { this.busy = false; this.updateControls(); this.schedule(0); }
  }

  private async refresh(): Promise<void> {
    if (this.closed || this.terminal || !this.visible || this.capturing || this.busy || document.hidden || this.video) {
      PhoneViewer.scheduler.cancel(this.panelId);
      return;
    }
    if (!PhoneViewer.scheduler.acquire(this.panelId)) { this.schedule(40); return; }
    this.capturing = true;
    const started = performance.now();
    const status = this.element.querySelector('.phone-status')!;
    const image = this.element.querySelector('.phone-frame') as HTMLImageElement;
    try {
      const bytes = await this.api.screenPng(this.device.id);
      if (this.closed || !this.visible || document.hidden) return;
      if (!(bytes instanceof ArrayBuffer) || bytes.byteLength < 24 || bytes.byteLength > 16 * 1024 * 1024) throw new Error('Invalid screen response');
      const header = new DataView(bytes);
      const frame = { width: header.getUint32(16), height: header.getUint32(20) };
      const src = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
      try {
        const decoded = new Image();
        decoded.src = src;
        await decoded.decode();
        if (this.closed || !this.visible || document.hidden) { URL.revokeObjectURL(src); return; }
        if (decoded.naturalWidth !== frame.width || decoded.naturalHeight !== frame.height) throw new Error('Invalid frame dimensions');
        image.src = src;
        if (this.frameUrl) URL.revokeObjectURL(this.frameUrl);
        this.frameUrl = src;
      } catch (error) {
        URL.revokeObjectURL(src);
        throw error;
      }
      this.frame = frame;
      this.failures = 0;
      image.hidden = false;
      status.textContent = '';
      const now = performance.now();
      this.metrics.record(now, now - started, bytes.byteLength);
      const stats = this.metrics.snapshot();
      this.element.querySelector('.phone-frame-metrics')!.textContent = `${stats.fps === null ? 'Measuring' : stats.fps.toFixed(1) + ' frames/s'} · ${Math.round(stats.averageMs)} ms capture + decode · ${Math.round(stats.averageBytes / 1024)} KiB/frame`;
    } catch (err: unknown) {
      if (this.closed) return;
      this.failures += 1;
      this.metrics.reset();
      this.element.querySelector('.phone-frame-metrics')!.textContent = 'Refresh interrupted';
      this.frame = null;
      this.start = null;
      this.updateControls();
      // Keep the last frame visible but non-interactive during a transient failure.
      const message = (err as { message?: string }).message || String(err);
      status.textContent = `Waiting for device: ${message.split('\n')[0].slice(0, 240)}`;
      const cached = (await this.api.health().catch(() => [])).find(s => s.id === this.device.id);
      const state = this.failures >= 3 && (cached?.state === 'stopped' || cached?.state === 'crashed')
        ? await this.api.getDeviceStatus(this.device.id).catch(() => null) : null;
      if (this.closed) return;
      if (state?.state === 'stopped' || state?.state === 'crashed') {
        status.textContent = state.state === 'stopped' ? 'Device stopped. Close this view to start again.' : 'Device stopped unexpectedly. See device diagnostics.';
        this.terminal = true;
        image.hidden = true;
        return;
      }
    } finally {
      PhoneViewer.scheduler.release(this.panelId);
      this.capturing = false;
      this.updateControls();
      if (this.frame && !this.checkedApps && !this.closed && !this.busy) {
        this.checkedApps = true;
        void this.checkApps();
      }
      this.schedule(this.failures ? Math.min(4000, 500 * 2 ** Math.min(this.failures, 3)) : 100);
    }
  }
}

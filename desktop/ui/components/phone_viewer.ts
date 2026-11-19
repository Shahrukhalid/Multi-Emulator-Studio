import { IApiClient } from '../api.js';
import { Device, GoogleApps, NavigationKey, ScreenFrame, TouchInput } from '../types.js';

export class PhoneViewer {
  // One bounded capture at a time across the entire local workspace.
  private static captureActive = false;
  readonly element = document.createElement('div');
  private closed = false;
  private timer: number | null = null;
  private frame: ScreenFrame | null = null;
  private busy = false;
  private capturing = false;
  private failures = 0;
  private terminal = false;
  private checkedApps = false;
  private start: { x: number; y: number; width: number; height: number } | null = null;
  private visibilityChanged = () => this.schedule(0);

  constructor(private api: IApiClient, private device: Device, onClose: () => void) {
    this.element.className = 'phone-panel';
    this.element.innerHTML = `<section class="phone-viewer" role="region" aria-label="Android device screen">
      <header class="modal-title-bar"><h2 class="phone-title"></h2><button class="btn-overflow-menu phone-close" aria-label="Close">×</button></header>
      <div class="phone-display"><p class="phone-status" role="status">Waiting for Android…</p><img class="phone-frame" alt="Live Android screen" draggable="false" hidden /></div>
      <nav class="phone-navigation" aria-label="Android navigation">
        <button data-key="back" aria-label="Back" title="Back" disabled>◁</button>
        <button data-key="home" aria-label="Home" title="Home" disabled>○</button>
        <button data-key="recents" aria-label="Recent apps" title="Recent apps" disabled>□</button>
      </nav><div class="phone-hardware" aria-label="Device controls">
        <button data-key="volume_down" disabled>Volume −</button>
        <button data-key="volume_up" disabled>Volume +</button>
        <button data-key="power" disabled>Power</button>
      </div><button class="phone-app-check" disabled>Check Play Store &amp; YouTube</button><p class="phone-app-status" role="status"></p><p class="phone-viewer-note" role="status">Local screen refresh · click to tap, drag to swipe</p>
    </section>`;
    this.element.querySelector('.phone-title')!.textContent = device.spec.name;
    this.element.querySelector('.phone-close')!.addEventListener('click', onClose);
    this.element.querySelector('.phone-app-check')!.addEventListener('click', () => void this.checkApps());
    const image = this.element.querySelector('.phone-frame') as HTMLImageElement;
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
    this.element.querySelectorAll<HTMLButtonElement>('[data-key]').forEach(button => {
      button.addEventListener('click', () => {
        void this.send({ action: 'navigate', id: this.device.id, key: button.dataset.key as NavigationKey });
      });
    });
  }

  begin(): void {
    document.addEventListener('visibilitychange', this.visibilityChanged);
    this.schedule(0);
  }
  dispose(): void {
    this.closed = true;
    document.removeEventListener('visibilitychange', this.visibilityChanged);
    if (this.timer !== null) window.clearTimeout(this.timer);
  }

  private schedule(delay: number): void {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
    if (this.closed || this.terminal || document.hidden || this.busy || this.capturing) return;
    this.timer = window.setTimeout(() => { this.timer = null; void this.refresh(); }, delay);
  }

  private updateControls(): void {
    this.element.querySelectorAll<HTMLButtonElement>('[data-key]').forEach(b => {
      b.disabled = !this.frame || this.busy;
    });
    (this.element.querySelector('.phone-app-check') as HTMLButtonElement).disabled = !this.frame || this.busy;
  }

  private async checkApps(): Promise<void> {
    if (!this.frame || this.busy || this.closed) return;
    this.busy = true;
    this.updateControls();
    const status = this.element.querySelector('.phone-app-status')!;
    status.textContent = 'Checking installed apps…';
    try {
      const apps = await this.api.dispatch<GoogleApps>({ action: 'google_apps', id: this.device.id });
      status.textContent = `Play Store: ${apps.play_store ? 'installed' : 'missing'} · YouTube: ${apps.youtube ? 'installed' : 'missing — install via Play Store'}`;
    } catch { status.textContent = 'App check failed; try again after Android is ready.'; }
    finally { this.busy = false; this.updateControls(); this.schedule(0); }
  }

  private point(e: PointerEvent, image: HTMLImageElement): { x: number; y: number } {
    const box = image.getBoundingClientRect();
    const { width, height } = this.frame!;
    return { x: Math.max(0, Math.min(width - 1, Math.floor((e.clientX - box.left) / box.width * width))), y: Math.max(0, Math.min(height - 1, Math.floor((e.clientY - box.top) / box.height * height))) };
  }

  private async send(request: { action: 'navigate'; id: string; key: NavigationKey } | { action: 'touch'; id: string; input: TouchInput }): Promise<void> {
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
    if (this.closed || this.terminal || this.capturing || this.busy || document.hidden) return;
    if (PhoneViewer.captureActive) { this.schedule(100); return; }
    PhoneViewer.captureActive = true;
    this.capturing = true;
    const status = this.element.querySelector('.phone-status')!;
    const image = this.element.querySelector('.phone-frame') as HTMLImageElement;
    try {
      const frame = await this.api.dispatch<ScreenFrame>({ action: 'screen', id: this.device.id });
      if (this.closed) return;
      const src = `data:image/png;base64,${frame.png_base64}`;
      if (image.src !== src) {
        const decoded = new Image();
        decoded.src = src;
        await decoded.decode();
        if (this.closed) return;
        image.src = src;
      }
      this.frame = frame;
      this.failures = 0;
      image.hidden = false;
      status.textContent = '';
    } catch (err: unknown) {
      if (this.closed) return;
      this.failures += 1;
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
      PhoneViewer.captureActive = false;
      this.capturing = false;
      this.updateControls();
      if (this.frame && !this.checkedApps && !this.closed && !this.busy) {
        this.checkedApps = true;
        void this.checkApps();
      }
      this.schedule(this.failures ? Math.min(4000, 500 * 2 ** Math.min(this.failures, 3)) : 250);
    }
  }
}

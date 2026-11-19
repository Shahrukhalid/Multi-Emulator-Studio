import { IApiClient } from '../api.js';
import { Device, NavigationKey, ScreenFrame, TouchInput } from '../types.js';

export class PhoneViewer {
  readonly element = document.createElement('div');
  private closed = false;
  private timer: number | null = null;
  private frame: ScreenFrame | null = null;
  private busy = false;
  private start: { x: number; y: number } | null = null;

  constructor(private api: IApiClient, private device: Device, onClose: () => void) {
    this.element.className = 'modal-backdrop';
    this.element.innerHTML = `<section class="modal-window phone-viewer" role="dialog" aria-label="Android device screen">
      <header class="modal-title-bar"><h2 id="phone-title"></h2><button class="btn-overflow-menu" id="phone-close" aria-label="Close">×</button></header>
      <div class="phone-display"><p id="phone-status" role="status">Waiting for Android…</p><img id="phone-frame" alt="Live Android screen" draggable="false" hidden /></div>
      <nav class="phone-navigation" aria-label="Android navigation">
        <button data-key="back" aria-label="Back" title="Back" disabled>◁</button>
        <button data-key="home" aria-label="Home" title="Home" disabled>○</button>
        <button data-key="recents" aria-label="Recent apps" title="Recent apps" disabled>□</button>
      </nav><p class="phone-viewer-note">Local screen refresh · click to tap, drag to swipe</p>
    </section>`;
    this.element.querySelector('#phone-title')!.textContent = device.spec.name;
    this.element.querySelector('#phone-close')!.addEventListener('click', onClose);
    const image = this.element.querySelector('#phone-frame') as HTMLImageElement;
    image.addEventListener('pointerdown', e => {
      if (!this.frame || this.busy || e.button !== 0) return;
      this.start = this.point(e, image);
      image.setPointerCapture(e.pointerId);
    });
    image.addEventListener('pointercancel', () => { this.start = null; });
    image.addEventListener('pointerup', e => {
      const start = this.start;
      this.start = null;
      if (!start || !this.frame) return;
      const end = this.point(e, image);
      const input: TouchInput = Math.hypot(end.x - start.x, end.y - start.y) < 15
        ? { kind: 'tap', ...end }
        : { kind: 'swipe', ...start, end_x: end.x, end_y: end.y };
      void this.send({ action: 'touch', id: this.device.id, input });
    });
    this.element.querySelectorAll<HTMLButtonElement>('[data-key]').forEach(button => {
      button.addEventListener('click', () => {
        void this.send({ action: 'navigate', id: this.device.id, key: button.dataset.key as NavigationKey });
      });
    });
  }

  begin(): void { void this.refresh(); }
  dispose(): void {
    this.closed = true;
    if (this.timer !== null) window.clearTimeout(this.timer);
  }

  private point(e: PointerEvent, image: HTMLImageElement): { x: number; y: number } {
    const box = image.getBoundingClientRect();
    const { width, height } = this.frame!;
    return { x: Math.max(0, Math.min(width - 1, Math.floor((e.clientX - box.left) / box.width * width))), y: Math.max(0, Math.min(height - 1, Math.floor((e.clientY - box.top) / box.height * height))) };
  }

  private async send(request: { action: 'navigate'; id: string; key: NavigationKey } | { action: 'touch'; id: string; input: TouchInput }): Promise<void> {
    if (!this.frame || this.busy || this.closed) return;
    this.busy = true;
    try { await this.api.dispatch<boolean>(request); }
    catch { this.element.querySelector('#phone-status')!.textContent = 'Input failed; waiting for the device.'; }
    finally { this.busy = false; }
  }

  private async refresh(): Promise<void> {
    if (this.closed) return;
    const status = this.element.querySelector('#phone-status')!;
    const image = this.element.querySelector('#phone-frame') as HTMLImageElement;
    try {
      const frame = await this.api.dispatch<ScreenFrame>({ action: 'screen', id: this.device.id });
      if (this.closed) return;
      this.frame = frame;
      image.src = `data:image/png;base64,${frame.png_base64}`;
      image.hidden = false;
      status.textContent = '';
    } catch (err: unknown) {
      if (this.closed) return;
      this.frame = null;
      image.hidden = true;
      const message = (err as { message?: string }).message || String(err);
      status.textContent = `Waiting for device: ${message.split('\n')[0].slice(0, 240)}`;
      const state = await this.api.getDeviceStatus(this.device.id).catch(() => null);
      if (this.closed) return;
      if (state?.state === 'stopped' || state?.state === 'crashed') {
        status.textContent = state.state === 'stopped' ? 'Device stopped. Close this view to start again.' : 'Device stopped unexpectedly. See device diagnostics.';
        this.element.querySelectorAll<HTMLButtonElement>('[data-key]').forEach(b => { b.disabled = true; });
        return;
      }
    }
    this.element.querySelectorAll<HTMLButtonElement>('[data-key]').forEach(b => { b.disabled = !this.frame; });
    if (!this.closed) this.timer = window.setTimeout(() => void this.refresh(), 750);
  }
}

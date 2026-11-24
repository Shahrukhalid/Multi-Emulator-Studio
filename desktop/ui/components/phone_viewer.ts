import { IApiClient } from '../api.js';
import { Device, GoogleApps, NavigationKey, TouchInput } from '../types.js';
import { FrameScheduler, FrameMetrics, nextCaptureDelay } from '../frame_scheduler.js';
import { LiveVideo } from '../live_video.js';
import { Icons } from '../icons.js';

export class PhoneViewer {
  private static scheduler = new FrameScheduler(2);
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
  private currentOrientation: 'portrait' | 'landscape' = 'portrait';
  private isLogcatOpen = false;
  private logcatTimer: number | null = null;
  private rawLogcat = '';
  private logcatLevel = 'all';
  private logcatSearch = '';

  private visibilityChanged = () => {
    this.metrics.reset();
    if (document.hidden) this.stopVideo('Video paused while hidden.');
    this.schedule(0);
  };

  constructor(
    private api: IApiClient,
    private device: Device,
    onClose: () => void,
    private onInstallApk?: (device: Device) => void,
    private onOpenLocation?: (device: Device) => void
  ) {
    this.element.className = 'phone-panel';
    this.element.innerHTML = `
      <section class="phone-viewer-workstation" role="region" aria-label="Android workstation">
        <!-- Floating Tool Rail (LambdaTest style) -->
        <aside class="floating-tool-rail" aria-label="Device quick actions">
          <button class="rail-btn" data-action="location" title="Set Geolocation & Proxy" aria-label="Location">
            ${Icons.location}
            <span class="rail-tooltip">Location</span>
          </button>
          <button class="rail-btn" data-action="logcat" title="Toggle App Logs" aria-label="App Logs">
            ${Icons.terminal}
            <span class="rail-tooltip">App Logs</span>
          </button>
          <button class="rail-btn" data-action="rotate" title="Rotate Device" aria-label="Rotate">
            ${Icons.rotate}
            <span class="rail-tooltip">Rotate</span>
          </button>
          <button class="rail-btn" data-action="screenshot" title="Take Screenshot" aria-label="Screenshot">
            ${Icons.camera}
            <span class="rail-tooltip">Screenshot</span>
          </button>
          <button class="rail-btn" data-action="install_apk" title="Install APK" aria-label="Install APK">
            ${Icons.download}
            <span class="rail-tooltip">Install APK</span>
          </button>
          <div class="rail-divider"></div>
          <button class="rail-btn" data-key="back" title="Back" aria-label="Back">◁</button>
          <button class="rail-btn" data-key="home" title="Home" aria-label="Home">○</button>
          <button class="rail-btn" data-key="recents" title="Recents" aria-label="Recents">□</button>
          <div class="rail-divider"></div>
          <button class="rail-btn danger" data-key="power" title="Power" aria-label="Power">⏻</button>
        </aside>

        <!-- Device Center Shell -->
        <div class="phone-center-stage">
          <header class="modal-title-bar">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="status-indicator ready"></span>
              <h2 class="phone-title">${this.escapeHtml(device.spec.name)}</h2>
              <span class="badge-subtle">${device.spec.hardware_profile}</span>
            </div>
            <button class="btn-overflow-menu phone-close" aria-label="Close">×</button>
          </header>

          <div class="phone-shell">
            <div class="phone-display">
              <div class="phone-notch"></div>
              <p class="phone-status" role="status">Connecting to Android...</p>
              <img class="phone-frame" alt="Live Android screen" draggable="false" hidden />
              <canvas class="phone-video-frame" aria-label="Experimental live video" hidden></canvas>
            </div>

            <nav class="phone-navigation" aria-label="Android navigation">
              <button data-key="back" aria-label="Back" title="Back" disabled>◁</button>
              <button data-key="home" aria-label="Home" title="Home" disabled>○</button>
              <button data-key="recents" aria-label="Recent apps" title="Recent apps" disabled>□</button>
            </nav>
          </div>

          <div class="phone-hardware" aria-label="Device controls">
            <button data-key="volume_down" disabled>Vol −</button>
            <button data-key="volume_up" disabled>Vol +</button>
            <button data-key="power" disabled>Power</button>
          </div>

          <div class="phone-toolbar-footer">
            <button class="phone-app-check" disabled>Check Apps</button>
            <button class="phone-app-check phone-youtube-store" hidden disabled>Play Store</button>
            <button class="phone-app-check phone-video-toggle" disabled>Live video (30s)</button>
          </div>

          <p class="phone-app-status" role="status"></p>
          <p class="phone-viewer-note" role="status">Local screen refresh · click to tap, drag to swipe</p>
          <p class="phone-frame-metrics" aria-label="Screen refresh performance">Waiting for frames</p>
        </div>

        <!-- Collapsible App Logs Drawer (LambdaTest style) -->
        <aside class="logcat-drawer" id="logcat-drawer" hidden>
          <div class="logcat-header">
            <div class="logcat-title-group">
              <span class="logcat-indicator"></span>
              <h3>App Logs</h3>
              <span class="logcat-badge" id="logcat-count">0 lines</span>
            </div>
            <button class="btn-overflow-menu" id="btn-logcat-close" title="Close Logs">×</button>
          </div>

          <div class="logcat-controls">
            <select class="form-select-input logcat-level-select" id="logcat-level" aria-label="Filter log level">
              <option value="all">All Logs (Verbose)</option>
              <option value="D">Debug</option>
              <option value="I">Info</option>
              <option value="W">Warn</option>
              <option value="E">Error</option>
            </select>
            <input type="text" class="form-text-input logcat-search-input" id="logcat-search" placeholder="Filter logs..." aria-label="Filter logs" />
            <button class="btn-tool-secondary" id="btn-logcat-clear" title="Clear console">Clear</button>
          </div>

          <div class="logcat-body" id="logcat-body">
            <pre class="logcat-content" id="logcat-content">Connecting to device logcat...</pre>
          </div>
        </aside>
      </section>
    `;

    this.setScreenShape(device.spec.width, device.spec.height);
    this.element.querySelector('.phone-close')!.addEventListener('click', onClose);
    this.element.querySelector('.phone-app-check')!.addEventListener('click', () => void this.checkApps());
    this.element.querySelector('.phone-youtube-store')!.addEventListener('click', () => void this.send({ action: 'open_youtube_store', id: this.device.id }));
    this.element.querySelector('.phone-video-toggle')!.addEventListener('click', () => this.video ? this.stopVideo('PNG refresh restored.') : this.startVideo());

    // Floating rail actions
    this.element.querySelector('[data-action="location"]')?.addEventListener('click', () => {
      this.onOpenLocation?.(this.device);
    });
    this.element.querySelector('[data-action="logcat"]')?.addEventListener('click', () => {
      this.toggleLogcatDrawer();
    });
    this.element.querySelector('[data-action="rotate"]')?.addEventListener('click', () => {
      void this.handleRotate();
    });
    this.element.querySelector('[data-action="screenshot"]')?.addEventListener('click', () => {
      void this.handleScreenshot();
    });
    this.element.querySelector('[data-action="install_apk"]')?.addEventListener('click', () => {
      this.onInstallApk?.(this.device);
    });

    // Logcat Drawer events
    this.element.querySelector('#btn-logcat-close')?.addEventListener('click', () => {
      this.toggleLogcatDrawer(false);
    });
    const levelSelect = this.element.querySelector('#logcat-level') as HTMLSelectElement;
    levelSelect?.addEventListener('change', () => {
      this.logcatLevel = levelSelect.value;
      this.renderLogcatLines();
    });
    const searchInput = this.element.querySelector('#logcat-search') as HTMLInputElement;
    searchInput?.addEventListener('input', () => {
      this.logcatSearch = searchInput.value.toLowerCase().trim();
      this.renderLogcatLines();
    });
    this.element.querySelector('#btn-logcat-clear')?.addEventListener('click', () => {
      this.rawLogcat = '';
      this.renderLogcatLines();
    });

    // Touch & Pointer handlers
    for (const image of Array.from(this.element.querySelectorAll<HTMLElement>('.phone-frame, .phone-video-frame'))) {
      image.addEventListener('pointerdown', (e) => {
        if (!this.frame || this.busy || e.button !== 0) return;
        this.start = { ...this.point(e, image), width: this.frame.width, height: this.frame.height };
        image.setPointerCapture(e.pointerId);
      });
      image.addEventListener('pointercancel', () => {
        this.start = null;
      });
      image.addEventListener('pointerup', (e) => {
        const start = this.start;
        this.start = null;
        if (!start || !this.frame || start.width !== this.frame.width || start.height !== this.frame.height) return;
        const end = this.point(e, image);
        const input: TouchInput =
          Math.hypot(end.x - start.x, end.y - start.y) < 15
            ? { kind: 'tap', ...end }
            : { kind: 'swipe', x: start.x, y: start.y, end_x: end.x, end_y: end.y };
        void this.send({ action: 'touch', id: this.device.id, input });
      });
    }

    // Navigation buttons
    this.element.querySelectorAll<HTMLButtonElement>('[data-key]').forEach((button) => {
      button.addEventListener('click', () => {
        void this.send({ action: 'navigate', id: this.device.id, key: button.dataset.key as NavigationKey });
      });
    });
  }

  private toggleLogcatDrawer(force?: boolean): void {
    const drawer = this.element.querySelector('#logcat-drawer') as HTMLElement;
    if (!drawer) return;
    this.isLogcatOpen = force !== undefined ? force : !this.isLogcatOpen;
    drawer.hidden = !this.isLogcatOpen;

    if (this.isLogcatOpen) {
      void this.fetchLogcat();
      if (!this.logcatTimer) {
        this.logcatTimer = window.setInterval(() => void this.fetchLogcat(), 2500);
      }
    } else {
      if (this.logcatTimer) {
        clearInterval(this.logcatTimer);
        this.logcatTimer = null;
      }
    }
  }

  private async fetchLogcat(): Promise<void> {
    if (!this.isLogcatOpen || this.closed) return;
    try {
      const logs = await this.api.getLogcat(this.device.id, 250);
      if (logs) {
        this.rawLogcat = logs;
        this.renderLogcatLines();
      }
    } catch {
      // Ignore background logcat fetch failure
    }
  }

  private renderLogcatLines(): void {
    const content = this.element.querySelector('#logcat-content') as HTMLElement;
    const countBadge = this.element.querySelector('#logcat-count') as HTMLElement;
    if (!content) return;

    if (!this.rawLogcat) {
      content.textContent = 'No logcat entries captured.';
      if (countBadge) countBadge.textContent = '0 lines';
      return;
    }

    const lines = this.rawLogcat.split('\n');
    const filtered = lines.filter((line) => {
      if (this.logcatLevel !== 'all') {
        const levelChar = ` ${this.logcatLevel} `;
        if (!line.includes(levelChar) && !line.includes(`/${this.logcatLevel}`)) {
          return false;
        }
      }
      if (this.logcatSearch) {
        return line.toLowerCase().includes(this.logcatSearch);
      }
      return true;
    });

    if (countBadge) countBadge.textContent = `${filtered.length} lines`;

    // Render formatted lines
    content.innerHTML = filtered
      .map((line) => {
        let cls = 'log-verbose';
        if (line.includes(' E ') || line.includes('/E')) cls = 'log-error';
        else if (line.includes(' W ') || line.includes('/W')) cls = 'log-warn';
        else if (line.includes(' I ') || line.includes('/I')) cls = 'log-info';
        else if (line.includes(' D ') || line.includes('/D')) cls = 'log-debug';

        return `<div class="log-line ${cls}">${this.escapeHtml(line)}</div>`;
      })
      .join('');

    const body = this.element.querySelector('#logcat-body');
    if (body) {
      body.scrollTop = body.scrollHeight;
    }
  }

  private async handleRotate(): Promise<void> {
    const next = this.currentOrientation === 'portrait' ? 'landscape' : 'portrait';
    this.currentOrientation = next;
    try {
      await this.api.rotateDevice(this.device.id, next);
      const note = this.element.querySelector('.phone-viewer-note');
      if (note) note.textContent = `Rotated to ${next}`;
      // Invert screen dimensions
      if (this.frame) {
        this.setScreenShape(this.frame.height, this.frame.width);
      }
    } catch {
      // Fallback
    }
  }

  private async handleScreenshot(): Promise<void> {
    try {
      const bytes = await this.api.screenPng(this.device.id);
      const blob = new Blob([bytes], { type: 'image/png' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${this.device.spec.name.toLowerCase().replace(/\s+/g, '-')}-screenshot-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      const note = this.element.querySelector('.phone-viewer-note');
      if (note) note.textContent = 'Screenshot capture failed';
    }
  }

  private setScreenShape(width: number, height: number): void {
    const ratio = width / height;
    if (!Number.isFinite(ratio) || ratio <= 0) return;
    this.element.style.setProperty('--phone-aspect', String(ratio));
    this.element.style.setProperty('--phone-width', `${Math.round(560 * ratio)}px`);
  }

  begin(): void {
    document.addEventListener('visibilitychange', this.visibilityChanged);
    this.observer = new IntersectionObserver((entries) => {
      this.visible = entries.some((entry) => entry.isIntersecting);
      if (!this.visible) {
        this.metrics.reset();
        this.stopVideo('Video paused while hidden.');
      }
      this.schedule(0);
    });
    this.observer.observe(this.element);
  }

  dispose(): void {
    this.closed = true;
    this.stopVideo('');
    if (this.logcatTimer) {
      clearInterval(this.logcatTimer);
      this.logcatTimer = null;
    }
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
    this.timer = window.setTimeout(() => {
      this.timer = null;
      void this.refresh();
    }, delay);
  }

  private updateControls(): void {
    this.element.querySelectorAll<HTMLButtonElement>('[data-key], .rail-btn[data-key]').forEach((b) => {
      b.disabled = !this.frame || this.busy;
    });
    const checkBtn = this.element.querySelector('.phone-app-check') as HTMLButtonElement;
    if (checkBtn) checkBtn.disabled = !this.frame || this.busy;
    const store = this.element.querySelector('.phone-youtube-store') as HTMLButtonElement;
    if (store) {
      store.hidden = !this.apps?.play_store || !!this.apps.youtube;
      store.disabled = !this.frame || this.busy;
    }
    const video = this.element.querySelector('.phone-video-toggle') as HTMLButtonElement;
    if (video) {
      video.disabled = !this.video && (!this.frame || this.busy || this.capturing || !this.visible);
      video.textContent = this.video ? 'Stop live video' : 'Live video (30s)';
    }
  }

  private startVideo(): void {
    if (this.video || !this.frame || this.closed || this.busy || this.capturing || !this.visible || document.hidden) return;
    const canvas = this.element.querySelector<HTMLCanvasElement>('.phone-video-frame')!;
    const image = this.element.querySelector<HTMLImageElement>('.phone-frame')!;
    const native = this.frame;
    const stream = new LiveVideo(
      this.api,
      this.device.id,
      canvas,
      (width, height, fps) => {
        if (this.video !== stream || this.closed) return;
        if (Math.abs(width / height - native.width / native.height) > 0.03) {
          this.stopVideo('Screen orientation changed; PNG refresh restored.');
          return;
        }
        canvas.hidden = false;
        image.hidden = true;
        this.element.querySelector('.phone-frame-metrics')!.textContent = `Live video · ${
          fps === null ? 'Measuring' : fps.toFixed(1) + ' decoded frames/s'
        }`;
      },
      (reason) => {
        if (this.video === stream) this.stopVideo(reason);
      }
    );
    this.video = stream;
    this.start = null;
    this.schedule(0);
    this.updateControls();
    this.element.querySelector('.phone-viewer-note')!.textContent = 'Starting live video…';
    void stream.start();
  }

  private stopVideo(reason: string): void {
    if (!this.video) return;
    const stream = this.video;
    this.video = null;
    stream.stop();
    this.start = null;
    this.element.querySelector<HTMLCanvasElement>('.phone-video-frame')!.hidden = true;
    this.element.querySelector<HTMLImageElement>('.phone-frame')!.hidden = !this.frame;
    this.element.querySelector('.phone-viewer-note')!.textContent = reason || 'Local screen refresh';
    this.metrics.reset();
    this.updateControls();
    this.schedule(0);
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
      status.textContent = `Play Store: ${apps.play_store ? 'installed' : 'missing'} · YouTube: ${
        apps.youtube_preinstalled ? 'preinstalled' : apps.youtube ? 'installed' : 'missing'
      }`;
    } catch {
      status.textContent = 'App check failed; try again after Android is ready.';
    } finally {
      this.busy = false;
      this.updateControls();
      this.schedule(0);
    }
  }

  private point(e: PointerEvent, image: HTMLElement): { x: number; y: number } {
    const box = image.getBoundingClientRect();
    const { width, height } = this.frame!;
    return {
      x: Math.max(0, Math.min(width - 1, Math.floor(((e.clientX - box.left) / box.width) * width))),
      y: Math.max(0, Math.min(height - 1, Math.floor(((e.clientY - box.top) / box.height) * height)))
    };
  }

  private async send(
    request:
      | { action: 'navigate'; id: string; key: NavigationKey }
      | { action: 'touch'; id: string; input: TouchInput }
      | { action: 'open_youtube_store'; id: string }
  ): Promise<void> {
    if (!this.frame || this.busy || this.closed) return;
    this.busy = true;
    this.schedule(0);
    this.updateControls();
    const note = this.element.querySelector('.phone-viewer-note')!;
    try {
      await this.api.dispatch<boolean>(request);
    } catch {
      note.textContent = 'Input failed. Try again when the device responds.';
    } finally {
      this.busy = false;
      this.updateControls();
      this.schedule(0);
    }
  }

  private async refresh(): Promise<void> {
    if (this.closed || this.terminal || !this.visible || this.capturing || this.busy || document.hidden || this.video) {
      PhoneViewer.scheduler.cancel(this.panelId);
      return;
    }
    if (!PhoneViewer.scheduler.acquire(this.panelId)) {
      this.schedule(40);
      return;
    }
    this.capturing = true;
    const started = performance.now();
    const status = this.element.querySelector('.phone-status')!;
    const image = this.element.querySelector('.phone-frame') as HTMLImageElement;
    try {
      const bytes = await this.api.screenPng(this.device.id);
      if (this.closed || !this.visible || document.hidden) return;
      if (!(bytes instanceof ArrayBuffer) || bytes.byteLength < 24 || bytes.byteLength > 32 * 1024 * 1024) {
        throw new Error('Invalid screen response');
      }
      const header = new DataView(bytes);
      const frame = { width: header.getUint32(16), height: header.getUint32(20) };
      const src = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
      try {
        const decoded = new Image();
        decoded.src = src;
        await decoded.decode();
        if (this.closed || !this.visible || document.hidden) {
          URL.revokeObjectURL(src);
          return;
        }
        if (decoded.naturalWidth !== frame.width || decoded.naturalHeight !== frame.height) {
          throw new Error('Invalid frame dimensions');
        }
        image.src = src;
        if (this.frameUrl) URL.revokeObjectURL(this.frameUrl);
        this.frameUrl = src;
      } catch (error) {
        URL.revokeObjectURL(src);
        throw error;
      }
      this.frame = frame;
      this.setScreenShape(frame.width, frame.height);
      this.failures = 0;
      image.hidden = false;
      status.textContent = '';
      const now = performance.now();
      this.metrics.record(now, now - started, bytes.byteLength);
      const stats = this.metrics.snapshot();
      this.element.querySelector('.phone-frame-metrics')!.textContent = `${
        stats.fps === null ? 'Measuring' : stats.fps.toFixed(1) + ' frames/s'
      } · ${Math.round(stats.averageMs)} ms capture + decode · ${Math.round(stats.averageBytes / 1024)} KiB/frame`;
    } catch (err: unknown) {
      if (this.closed) return;
      this.failures += 1;
      this.metrics.reset();
      this.element.querySelector('.phone-frame-metrics')!.textContent = 'Refresh interrupted';
      this.frame = null;
      this.start = null;
      this.updateControls();
      const message = (err as { message?: string }).message || String(err);
      status.textContent = `Reconnecting screen… ${message.split('\n')[0].slice(0, 120)}`;
      const cached = (await this.api.health().catch(() => [])).find((s) => s.id === this.device.id);
      const state =
        this.failures >= 3 && (cached?.state === 'stopped' || cached?.state === 'crashed')
          ? await this.api.getDeviceStatus(this.device.id).catch(() => null)
          : null;
      if (this.closed) return;
      if (state?.state === 'stopped' || state?.state === 'crashed') {
        status.textContent =
          state.state === 'stopped'
            ? 'Device stopped. Close this view to start again.'
            : 'Device stopped unexpectedly. See diagnostics.';
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
      this.schedule(nextCaptureDelay(performance.now() - started, this.failures));
    }
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

import { IApiClient } from '../api.js';
import { Device, GoogleApps, NavigationKey, TouchInput, MacroStep, MacroDefinition } from '../types.js';
import { FrameScheduler, FrameMetrics, nextCaptureDelay } from '../frame_scheduler.js';
import { LiveVideo } from '../live_video.js';
import { Icons } from '../icons.js';
import { toast } from '../toast.js';

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
  private isHostKeyboardActive = false;
  private isRecordingMacro = false;
  private recordedMacroSteps: MacroStep[] = [];
  private keyListener: ((e: KeyboardEvent) => void) | null = null;

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
          <button class="rail-btn" data-action="keyboard" title="Toggle Host Typing (Forward Keystrokes)" aria-label="Host Typing">
            <span style="font-size: 14px;">⌨</span>
            <span class="rail-tooltip">Host Typing</span>
          </button>
          <button class="rail-btn" data-action="clipboard" title="Device & Host Clipboard" aria-label="Clipboard">
            ${Icons.copy}
            <span class="rail-tooltip">Clipboard</span>
          </button>
          <button class="rail-btn" data-action="record_macro" title="Record Gesture Macro" aria-label="Record Macro">
            <span style="color: #ef4444; font-weight: bold; font-size: 16px;">⏺</span>
            <span class="rail-tooltip">Record Macro</span>
          </button>
          <button class="rail-btn" data-action="play_macro" title="Replay Gesture Macro" aria-label="Play Macro">
            <span style="color: #3b82f6; font-size: 14px;">▶</span>
            <span class="rail-tooltip">Play Macro</span>
          </button>
          <div class="rail-divider"></div>
          <button class="rail-btn" data-action="audio" title="Real-Time Audio & Sound Injection" aria-label="Audio">
            <span style="font-size: 14px;">🔊</span>
            <span class="rail-tooltip">Audio</span>
          </button>
          <button class="rail-btn" data-action="sensors" title="Biometrics & Hardware Sensors Hub" aria-label="Sensors">
            <span style="font-size: 14px;">🧬</span>
            <span class="rail-tooltip">Sensors</span>
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
              <div class="macro-rec-badge" id="macro-rec-badge" style="display:none; position:absolute; top:12px; left:12px; z-index:10; background:rgba(239,68,68,0.9); color:white; padding:4px 8px; border-radius:4px; font-size:11px; font-weight:600; align-items:center; gap:6px;"><span>🔴 REC</span><span id="macro-rec-count">0 steps</span></div>
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
    this.element.querySelector('[data-action="keyboard"]')?.addEventListener('click', () => {
      this.toggleHostKeyboard();
    });
    this.element.querySelector('[data-action="clipboard"]')?.addEventListener('click', () => {
      void this.showClipboardDialog();
    });
    this.element.querySelector('[data-action="record_macro"]')?.addEventListener('click', () => {
      void this.toggleMacroRecording();
    });
    this.element.querySelector('[data-action="play_macro"]')?.addEventListener('click', () => {
      void this.showPlayMacroDialog();
    });
    this.element.querySelector('[data-action="audio"]')?.addEventListener('click', () => {
      void this.showAudioDialog();
    });
    this.element.querySelector('[data-action="sensors"]')?.addEventListener('click', () => {
      void this.showSensorsDialog();
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
        if (this.isRecordingMacro) {
          this.recordedMacroSteps.push({
            step_number: this.recordedMacroSteps.length + 1,
            delay_after_ms: 300,
            ...(input.kind === 'tap'
              ? { type: 'tap', x: input.x, y: input.y }
              : { type: 'swipe', x: input.x, y: input.y, end_x: input.end_x, end_y: input.end_y, duration_ms: 250 })
          });
          this.updateMacroRecCount();
        }
        void this.send({ action: 'touch', id: this.device.id, input });
      });
    }

    // Navigation buttons
    this.element.querySelectorAll<HTMLButtonElement>('[data-key]').forEach((button) => {
      button.addEventListener('click', () => {
        const key = button.dataset.key as NavigationKey;
        if (this.isRecordingMacro) {
          this.recordedMacroSteps.push({
            step_number: this.recordedMacroSteps.length + 1,
            delay_after_ms: 300,
            type: 'navigation',
            key
          });
          this.updateMacroRecCount();
        }
        void this.send({ action: 'navigate', id: this.device.id, key });
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
    if (this.keyListener) {
      window.removeEventListener('keydown', this.keyListener);
      this.keyListener = null;
    }
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

  private updateMacroRecCount(): void {
    const countEl = this.element.querySelector('#macro-rec-count');
    if (countEl) countEl.textContent = `${this.recordedMacroSteps.length} steps`;
  }

  private toggleHostKeyboard(): void {
    this.isHostKeyboardActive = !this.isHostKeyboardActive;
    const btn = this.element.querySelector('[data-action="keyboard"]');
    if (btn) {
      if (this.isHostKeyboardActive) {
        btn.classList.add('active');
        toast.show('Host Typing enabled: Keystrokes forward directly to device.', 'info');
      } else {
        btn.classList.remove('active');
        toast.show('Host Typing disabled.', 'info');
      }
    }

    if (this.isHostKeyboardActive) {
      if (!this.keyListener) {
        this.keyListener = (e: KeyboardEvent) => {
          if (!this.isHostKeyboardActive || this.closed) return;
          const tag = (document.activeElement?.tagName || '').toLowerCase();
          if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

          e.preventDefault();
          let keycode: number | null = null;
          if (e.key === 'Enter') keycode = 66;
          else if (e.key === 'Backspace') keycode = 67;
          else if (e.key === 'Tab') keycode = 61;
          else if (e.key === 'Escape') keycode = 111;
          else if (e.key === ' ') keycode = 62;
          else if (e.key === 'ArrowUp') keycode = 19;
          else if (e.key === 'ArrowDown') keycode = 20;
          else if (e.key === 'ArrowLeft') keycode = 21;
          else if (e.key === 'ArrowRight') keycode = 22;

          if (keycode !== null) {
            if (this.isRecordingMacro) {
              this.recordedMacroSteps.push({
                step_number: this.recordedMacroSteps.length + 1,
                delay_after_ms: 200,
                type: 'key',
                keycode
              });
              this.updateMacroRecCount();
            }
            void this.api.inputKey(this.device.id, keycode);
          } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
            if (this.isRecordingMacro) {
              this.recordedMacroSteps.push({
                step_number: this.recordedMacroSteps.length + 1,
                delay_after_ms: 200,
                type: 'text',
                text: e.key
              });
              this.updateMacroRecCount();
            }
            void this.api.inputText(this.device.id, e.key);
          }
        };
        window.addEventListener('keydown', this.keyListener);
      }
    } else {
      if (this.keyListener) {
        window.removeEventListener('keydown', this.keyListener);
        this.keyListener = null;
      }
    }
  }

  private async showClipboardDialog(): Promise<void> {
    let currentClip = '';
    try {
      currentClip = await this.api.getClipboard(this.device.id);
    } catch {
      currentClip = '';
    }

    const text = window.prompt(
      'Synchronize Clipboard with Virtual Device:\n(Type text to push to device, or leave as-is to copy to host)',
      currentClip || ''
    );
    if (text !== null && text !== currentClip) {
      try {
        await this.api.setClipboard(this.device.id, text);
        toast.show('Pushed text to device clipboard', 'success');
      } catch (err: unknown) {
        toast.show(`Failed to set clipboard: ${(err as { message?: string }).message || String(err)}`, 'error');
      }
    } else if (text !== null && text === currentClip && currentClip) {
      navigator.clipboard.writeText(currentClip);
      toast.show('Device clipboard copied to host clipboard!', 'success');
    }
  }

  private async toggleMacroRecording(): Promise<void> {
    const badge = this.element.querySelector('#macro-rec-badge') as HTMLElement;
    const btn = this.element.querySelector('[data-action="record_macro"]');

    if (!this.isRecordingMacro) {
      this.isRecordingMacro = true;
      this.recordedMacroSteps = [];
      this.updateMacroRecCount();
      if (badge) badge.style.display = 'flex';
      btn?.classList.add('active');
      toast.show('Macro recording started! Click, drag, or type on the screen to record steps.', 'info');
    } else {
      this.isRecordingMacro = false;
      if (badge) badge.style.display = 'none';
      btn?.classList.remove('active');

      if (this.recordedMacroSteps.length === 0) {
        toast.show('Recording cancelled (0 steps captured).', 'warning');
        return;
      }

      const name = window.prompt(
        `Recorded ${this.recordedMacroSteps.length} gesture/input steps!\nEnter a name for this Macro:`,
        `Macro ${new Date().toLocaleTimeString()}`
      );
      if (!name || !name.trim()) return;

      const newMacro: MacroDefinition = {
        id: crypto.randomUUID(),
        name: name.trim(),
        description: `Recorded on ${this.device.spec.name} (${this.recordedMacroSteps.length} steps)`,
        created_at: new Date().toISOString(),
        steps: this.recordedMacroSteps
      };

      try {
        await this.api.saveMacro(newMacro);
        toast.show(`Macro "${newMacro.name}" saved successfully!`, 'success');
      } catch (err: unknown) {
        toast.show(`Failed to save macro: ${(err as { message?: string }).message || String(err)}`, 'error');
      }
    }
  }

  private async showPlayMacroDialog(): Promise<void> {
    try {
      const macros = await this.api.listMacros();
      if (macros.length === 0) {
        toast.show('No macros found.', 'warning');
        return;
      }

      const options = macros.map((m, i) => `${i + 1}. ${m.name} (${m.steps.length} steps)`).join('\n');
      const choice = window.prompt(`Select Macro to Replay on ${this.device.spec.name}:\n\n${options}\n\nEnter number (1-${macros.length}):`, '1');
      if (!choice) return;

      const idx = parseInt(choice.trim(), 10) - 1;
      if (isNaN(idx) || idx < 0 || idx >= macros.length) {
        toast.show('Invalid macro selection.', 'error');
        return;
      }

      const selected = macros[idx];
      toast.show(`Replaying "${selected.name}" on ${this.device.spec.name}...`, 'info');
      const result = await this.api.runMacro(selected.id, this.device.id);

      if (result.status === 'passed') {
        toast.show(`Macro "${result.macro_name}" finished: ${result.steps_completed}/${result.total_steps} steps passed in ${result.duration_ms}ms!`, 'success');
      } else {
        toast.show(`Macro execution stopped: ${result.failure_reason || 'Unknown failure'}`, 'error');
      }
    } catch (err: unknown) {
      toast.show(`Macro replay failed: ${(err as { message?: string }).message || String(err)}`, 'error');
    }
  }

  private async showAudioDialog(): Promise<void> {
    try {
      const state = await this.api.getAudioState(this.device.id);
      const samples = await this.api.getAudioSamples();

      const choice = window.prompt(
        `🔊 Audio Streaming & Sound Injection (${this.device.spec.name}):\n` +
        `Current Volume: ${state.output_volume}% (${state.muted ? 'MUTED' : 'ACTIVE'})\n\n` +
        `Options:\n` +
        `1. Set Volume (0 - 100)\n` +
        `2. Toggle Mute / Unmute\n` +
        `3. Inject Synthesized Sound Sample...\n\n` +
        `Enter option (1, 2, or 3):`,
        '1'
      );
      if (!choice) return;

      if (choice.trim() === '1') {
        const volStr = window.prompt(`Enter desired volume (0 - 100):`, String(state.output_volume));
        if (volStr !== null) {
          const vol = parseInt(volStr.trim(), 10);
          if (!isNaN(vol) && vol >= 0 && vol <= 100) {
            await this.api.setAudioState(this.device.id, vol, false);
            toast.show(`Device volume set to ${vol}%`, 'success');
          } else {
            toast.show('Volume must be between 0 and 100.', 'error');
          }
        }
      } else if (choice.trim() === '2') {
        const nextMuted = !state.muted;
        await this.api.setAudioState(this.device.id, state.output_volume, nextMuted);
        toast.show(`Device audio ${nextMuted ? 'muted' : 'unmuted'}.`, 'success');
      } else if (choice.trim() === '3') {
        const sampleList = samples.map((s, i) => `${i + 1}. [${s.category.toUpperCase()}] ${s.title} (${s.duration_ms}ms)`).join('\n');
        const sChoice = window.prompt(`Select Audio Sample to Inject:\n\n${sampleList}\n\nEnter number (1-${samples.length}):`, '1');
        if (!sChoice) return;
        const sIdx = parseInt(sChoice.trim(), 10) - 1;
        if (!isNaN(sIdx) && sIdx >= 0 && sIdx < samples.length) {
          const sample = samples[sIdx];
          toast.show(`Injecting "${sample.title}" into device audio buffer...`, 'info');
          await this.api.injectAudioSample(this.device.id, sample.id);
          toast.show(`Audio injection complete: "${sample.title}" played successfully!`, 'success');
        } else {
          toast.show('Invalid sample selection.', 'error');
        }
      }
    } catch (err: unknown) {
      toast.show(`Audio control error: ${(err as { message?: string }).message || String(err)}`, 'error');
    }
  }

  private async showSensorsDialog(): Promise<void> {
    try {
      const choice = window.prompt(
        `🧬 Biometrics & Hardware Sensors Simulator Hub (${this.device.spec.name}):\n\n` +
        `1. Biometrics: Fingerprint MATCH (Success)\n` +
        `2. Biometrics: Fingerprint REJECT (Fail / Unmatch)\n` +
        `3. Battery: 100% (AC Charging / Full)\n` +
        `4. Battery: 15% (Discharging / Low Battery)\n` +
        `5. Tilt Orientation: Flat Table (0° tilt)\n` +
        `6. Tilt Orientation: Portrait 45° Pitch\n` +
        `7. Tilt Orientation: Landscape 45° Roll\n` +
        `8. Proximity Sensor: Close / Near (0.5cm)\n\n` +
        `Enter option (1-8):`,
        '1'
      );
      if (!choice) return;

      switch (choice.trim()) {
        case '1':
          await this.api.simulateBiometrics(this.device.id, { type: 'match', finger_id: 1 });
          toast.show('Biometrics: Sent Fingerprint Match (ID 1)', 'success');
          break;
        case '2':
          await this.api.simulateBiometrics(this.device.id, { type: 'unmatch' });
          toast.show('Biometrics: Sent Fingerprint Reject', 'warning');
          break;
        case '3':
          await this.api.setBatteryState(this.device.id, {
            capacity_percent: 100,
            ac_plugged: true,
            status: 'Charging',
            health: 'Good'
          });
          toast.show('Battery set to 100% (AC Charging)', 'success');
          break;
        case '4':
          await this.api.setBatteryState(this.device.id, {
            capacity_percent: 15,
            ac_plugged: false,
            status: 'Discharging',
            health: 'Good'
          });
          toast.show('Battery set to 15% (Discharging / Warning alert)', 'warning');
          break;
        case '5':
          await this.api.setSensorState(this.device.id, { type: 'acceleration', x: 0, y: 9.81, z: 0 });
          toast.show('Sensor: Flat Table orientation applied', 'success');
          break;
        case '6':
          await this.api.setSensorState(this.device.id, { type: 'acceleration', x: 0, y: 6.94, z: 6.94 });
          toast.show('Sensor: 45° Portrait tilt applied', 'success');
          break;
        case '7':
          await this.api.setSensorState(this.device.id, { type: 'acceleration', x: 6.94, y: 6.94, z: 0 });
          toast.show('Sensor: 45° Landscape roll applied', 'success');
          break;
        case '8':
          await this.api.setSensorState(this.device.id, { type: 'proximity', distance_cm: 0.5 });
          toast.show('Sensor: Proximity NEAR (0.5cm) simulated', 'success');
          break;
        default:
          toast.show('Invalid sensor option.', 'error');
      }
    } catch (err: unknown) {
      toast.show(`Sensor simulation error: ${(err as { message?: string }).message || String(err)}`, 'error');
    }
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

import { Device, Status, parseFriendlyVersion, DeviceFormFactor } from '../types.js';
import { Illustrations } from '../illustrations.js';
import { Icons } from '../icons.js';

export interface DeviceCardCallbacks {
  onStart: (device: Device) => void;
  onOpen: (device: Device) => void;
  onStop: (device: Device) => void;
  onRestart: (device: Device) => void;
  onRename: (device: Device) => void;
  onDuplicate: (device: Device) => void;
  onInstallApk: (device: Device) => void;
  onDelete: (device: Device) => void;
}

export class DeviceCardComponent {
  private element: HTMLElement;
  private device: Device;
  private status: Status | null;
  private callbacks: DeviceCardCallbacks;
  private isMenuOpen = false;
  private isBusy = false;

  constructor(device: Device, status: Status | null, callbacks: DeviceCardCallbacks) {
    this.device = device;
    this.status = status;
    this.callbacks = callbacks;
    this.element = document.createElement('div');
    this.element.className = 'device-card-commercial';
    this.render();
  }

  getElement(): HTMLElement {
    return this.element;
  }

  updateStatus(status: Status): void {
    const changed = this.status?.state !== status.state || this.status?.diagnostic !== status.diagnostic;
    this.status = status;
    if (changed) this.render();
  }

  setBusy(busy: boolean): void {
    this.isBusy = busy;
    this.render();
  }

  private detectFormFactor(): DeviceFormFactor {
    const hp = this.device.spec.hardware_profile.toLowerCase();
    const w = this.device.spec.width;
    const h = this.device.spec.height;

    if (hp.includes('tablet') || (w >= 1600 && h >= 1200)) return 'tablet';
    if (hp.includes('fold') || Math.abs(w - h) < 400) return 'foldable';
    if (w >= 1440 || h >= 3000) return 'large_phone';
    return 'phone';
  }

  private render(): void {
    const { spec } = this.device;
    const friendly = parseFriendlyVersion(spec.image);
    const formFactor = this.detectFormFactor();

    const state = this.status?.state ?? 'unknown';
    const isRunning = state === 'ready';
    const isStarting = state === 'starting';
    const isQueued = state === 'queued';
    const isCrashed = state === 'crashed';

    // Illustration based on form factor
    let illustrationSvg = Illustrations.phone;
    if (formFactor === 'large_phone') illustrationSvg = Illustrations.largePhone;
    if (formFactor === 'tablet') illustrationSvg = Illustrations.tablet;
    if (formFactor === 'foldable') illustrationSvg = Illustrations.foldable;

    // Status label and dot
    let statusLabel = 'Stopped';
    let statusDotClass = 'stopped';
    if (isRunning) {
      statusLabel = this.status?.diagnostic ? 'Reconnecting' : 'Running';
      statusDotClass = 'ready';
    } else if (isStarting) {
      statusLabel = 'Starting...';
      statusDotClass = 'starting';
    } else if (isQueued) {
      statusLabel = 'Queued';
      statusDotClass = 'queued';
    } else if (isCrashed) {
      statusLabel = 'Error';
      statusDotClass = 'crashed';
    } else if (state === 'unknown' || state === 'stopping') {
      statusLabel = state === 'stopping' ? 'Stopping...' : 'Unknown';
    }

    // Primary Action Button
    let primaryBtnHtml = `
      <button class="btn-primary-action start" id="btn-primary-action" ${this.isBusy ? 'disabled' : ''}>
        ${Icons.play}
        <span>Start</span>
      </button>
    `;

    if (isRunning) {
      primaryBtnHtml = `
        <button class="btn-primary-action open" id="btn-primary-action" ${this.isBusy ? 'disabled' : ''}>
          ${Icons.external}
          <span>Open phone</span>
        </button>
      `;
    } else if (isStarting || isQueued || state === 'stopping') {
      primaryBtnHtml = `
        <button class="btn-primary-action start" id="btn-primary-action" disabled>
          <span>${isStarting ? 'Starting...' : isQueued ? 'Queued' : 'Stopping...'}</span>
        </button>
      `;
    } else if (isCrashed) {
      primaryBtnHtml = `
        <button class="btn-primary-action retry" id="btn-primary-action" ${this.isBusy ? 'disabled' : ''}>
          <span>Retry</span>
        </button>
      `;
    }

    this.element.innerHTML = `
      <div class="card-device-preview">
        ${illustrationSvg}
      </div>

      ${this.status?.diagnostic ? `<details class="device-diagnostic"><summary>${this.escapeHtml(this.status.diagnostic.split('\n')[0].slice(0, 160))}</summary><pre>${this.escapeHtml(this.status.diagnostic)}</pre></details>` : ''}

      <div class="device-header-row">
        <h3 class="device-card-title" title="${this.escapeHtml(spec.name)}">
          ${this.escapeHtml(spec.name)}
        </h3>
      </div>

      <div class="device-meta-row">
        <span class="device-os-tag">${friendly.versionName}</span>
        <span style="color: var(--text-tertiary);">·</span>
        <div class="device-status-indicator">
          <span class="status-dot ${statusDotClass}"></span>
          <span>${statusLabel}</span>
        </div>
      </div>

      <div class="device-card-footer">
        ${primaryBtnHtml}
        <button class="btn-overflow-menu" id="btn-more-actions" title="More options" aria-label="More options">
          ${Icons.dots}
        </button>
      </div>

      <!-- Context Menu Dropdown -->
      <div class="context-menu-popover" id="device-context-menu" style="display: ${this.isMenuOpen ? 'flex' : 'none'};">
        ${isRunning ? `<button class="context-menu-item" id="ctx-restart">Restart</button>` : ''}
        ${isRunning || isStarting || isQueued ? `<button class="context-menu-item" id="ctx-stop">${isQueued ? 'Cancel queued start' : 'Stop'}</button>` : ''}
        <button class="context-menu-item" id="ctx-apk" ${!isRunning ? 'disabled style="opacity: 0.5;"' : ''}>Install APK...</button>
        <button class="context-menu-item" id="ctx-rename">Rename...</button>
        <button class="context-menu-item" id="ctx-duplicate">Copy settings only</button>
        <div style="height: 1px; background: var(--border-subtle); margin: 3px 0;"></div>
        <button class="context-menu-item danger" id="ctx-delete" ${state !== 'stopped' && state !== 'crashed' ? 'disabled style="opacity: 0.5;"' : ''}>Delete</button>
      </div>
    `;

    // Hook listeners
    const primaryBtn = this.element.querySelector('#btn-primary-action');
    primaryBtn?.addEventListener('click', () => {
      if (isRunning) {
        this.callbacks.onOpen(this.device);
      } else {
        this.callbacks.onStart(this.device);
      }
    });

    const moreBtn = this.element.querySelector('#btn-more-actions');
    const menu = this.element.querySelector('#device-context-menu') as HTMLElement;

    moreBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.isMenuOpen = !this.isMenuOpen;
      menu.style.display = this.isMenuOpen ? 'flex' : 'none';
    });

    // Close menu when clicking outside
    this.element.onclick = () => {
      if (this.isMenuOpen) {
        this.isMenuOpen = false;
        menu.style.display = 'none';
      }
    };

    this.element.querySelector('#ctx-stop')?.addEventListener('click', () => {
      this.callbacks.onStop(this.device);
    });

    this.element.querySelector('#ctx-restart')?.addEventListener('click', () => {
      this.callbacks.onRestart(this.device);
    });

    this.element.querySelector('#ctx-apk')?.addEventListener('click', () => {
      this.callbacks.onInstallApk(this.device);
    });

    this.element.querySelector('#ctx-rename')?.addEventListener('click', () => {
      this.callbacks.onRename(this.device);
    });

    this.element.querySelector('#ctx-duplicate')?.addEventListener('click', () => {
      this.callbacks.onDuplicate(this.device);
    });

    this.element.querySelector('#ctx-delete')?.addEventListener('click', () => {
      this.callbacks.onDelete(this.device);
    });
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

import { Device, Status } from '../types.js';
import { Icons } from '../icons.js';

export interface ApkModalCallbacks {
  onInstall: (device: Device, apkPath: string) => Promise<void>;
  onClose: () => void;
}

export class ApkModalComponent {
  private element: HTMLElement;
  private device: Device;
  private status: Status | null;
  private callbacks: ApkModalCallbacks;
  private isInstalling = false;

  constructor(device: Device, status: Status | null, callbacks: ApkModalCallbacks) {
    this.device = device;
    this.status = status;
    this.callbacks = callbacks;
    this.element = document.createElement('div');
    this.element.className = 'modal-backdrop';
    this.render();
  }

  getElement(): HTMLElement {
    return this.element;
  }

  private render(): void {
    const isRunning = this.status?.state === 'ready';

    this.element.innerHTML = `
      <div class="modal-window" style="max-width: 480px;">
        <div class="modal-title-bar">
          <h2 class="modal-heading">Install Application (.apk)</h2>
          <button class="btn-overflow-menu" id="btn-apk-close" title="Close" aria-label="Close">
            ${Icons.close}
          </button>
        </div>

        <div class="modal-content">
          <div id="apk-err-banner" class="preview-banner" style="display: none; background: rgba(239, 68, 68, 0.1); border-color: rgba(239, 68, 68, 0.3); color: var(--color-danger); border-radius: 6px;"></div>

          <div style="font-size: 13px; color: var(--text-secondary);">
            Target device: <strong>${this.escapeHtml(this.device.spec.name)}</strong>
            ${!isRunning ? '<div style="color: var(--color-warning); margin-top: 4px;">Notice: Emulator must be started to complete installation.</div>' : ''}
          </div>

          <div class="form-block">
            <label class="form-label-title" for="apk-file-path">Local APK Path</label>
            <input class="form-text-input" id="apk-file-path" placeholder="C:\\path\\to\\app.apk" />
            <span class="form-helper-text">Enter the absolute path to a valid Android package file.</span>
          </div>

          <div id="apk-drag-box" style="border: 2px dashed var(--border-strong); border-radius: var(--radius-md); padding: 24px; text-align: center; cursor: pointer; transition: background 0.15s;">
            <div style="font-size: 13px; font-weight: 500;">Drag and drop an APK file here</div>
            <div style="font-size: 11px; color: var(--text-tertiary); margin-top: 4px;">If the desktop provides an absolute path, it will be filled in. Otherwise enter it above.</div>
          </div>
        </div>

        <div class="modal-actions">
          <button type="button" class="nav-item" id="btn-apk-cancel" style="padding: 8px 16px;">Cancel</button>
          <button type="button" class="btn-create-primary" id="btn-apk-submit" ${!isRunning ? 'disabled' : ''}>
            <span>Install APK</span>
          </button>
        </div>
      </div>
    `;

    const close = () => this.callbacks.onClose();
    this.element.querySelector('#btn-apk-close')?.addEventListener('click', close);
    this.element.querySelector('#btn-apk-cancel')?.addEventListener('click', close);

    const input = this.element.querySelector('#apk-file-path') as HTMLInputElement;
    const errBox = this.element.querySelector('#apk-err-banner') as HTMLElement;
    const submitBtn = this.element.querySelector('#btn-apk-submit') as HTMLButtonElement;
    const dropzone = this.element.querySelector('#apk-drag-box') as HTMLElement;

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.style.background = 'var(--bg-card-hover)';
    });
    dropzone.addEventListener('dragleave', () => {
      dropzone.style.background = 'transparent';
    });
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.style.background = 'transparent';
      if (e.dataTransfer?.files.length) {
        const file = e.dataTransfer.files[0];
        const path = (file as File & { path?: string }).path;
        if (path && isAbsoluteApkPath(path)) {
          input.value = path;
          errBox.style.display = 'none';
        } else {
          errBox.textContent = 'The webview did not provide a full file path. Enter the absolute APK path above.';
          errBox.style.display = 'block';
        }
      }
    });

    submitBtn.addEventListener('click', async () => {
      if (this.isInstalling) return;
      const path = input.value.trim();
      if (!path) {
        errBox.textContent = 'Please enter an APK file path.';
        errBox.style.display = 'block';
        return;
      }
      if (!isAbsoluteApkPath(path)) {
        errBox.textContent = 'Enter an absolute local path ending in .apk.';
        errBox.style.display = 'block';
        return;
      }

      errBox.style.display = 'none';
      this.isInstalling = true;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Installing on guest...';

      try {
        await this.callbacks.onInstall(this.device, path);
        close();
      } catch (err: unknown) {
        this.isInstalling = false;
        submitBtn.disabled = false;
        submitBtn.textContent = 'Install APK';
        errBox.textContent = (err as { message?: string }).message || String(err);
        errBox.style.display = 'block';
      }
    });
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

function isAbsoluteApkPath(path: string): boolean {
  return (path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path)) && path.toLowerCase().endsWith('.apk');
}

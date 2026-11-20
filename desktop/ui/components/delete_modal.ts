import { Device } from '../types.js';
import { Icons } from '../icons.js';

export interface DeleteModalCallbacks {
  onConfirmDelete: (device: Device) => Promise<void>;
  onClose: () => void;
}

export class DeleteModalComponent {
  private element: HTMLElement;
  private device: Device;
  private callbacks: DeleteModalCallbacks;
  private isDeleting = false;

  constructor(device: Device, callbacks: DeleteModalCallbacks) {
    this.device = device;
    this.callbacks = callbacks;
    this.element = document.createElement('div');
    this.element.className = 'modal-backdrop';
    this.render();
  }

  getElement(): HTMLElement {
    return this.element;
  }

  private render(): void {
    this.element.innerHTML = `
      <div class="modal-window" style="max-width: 440px;">
        <div class="modal-title-bar">
          <h2 class="modal-heading" style="color: var(--color-danger);">Delete Virtual Device?</h2>
          <button class="btn-overflow-menu" id="btn-del-close" title="Close" aria-label="Close">
            ${Icons.close}
          </button>
        </div>

        <div class="modal-content">
          <div id="del-err-banner" class="preview-banner" style="display: none; background: rgba(239, 68, 68, 0.1); border-color: rgba(239, 68, 68, 0.3); color: var(--color-danger); border-radius: 6px;"></div>

          <p style="font-size: 14px; font-weight: 500;">
            Are you sure you want to permanently delete <strong>${this.escapeHtml(this.device.spec.name)}</strong>?
          </p>

          <div style="background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.25); border-radius: var(--radius-sm); padding: 12px; font-size: 12px; color: var(--color-danger); line-height: 1.5;">
            <strong>Warning: Permanent Data Loss</strong><br />
            This will permanently erase all installed applications, guest settings, photos, and virtual storage for this device. This action cannot be undone.
          </div>
        </div>

        <div class="modal-actions">
          <button type="button" class="nav-item" id="btn-del-cancel" style="padding: 8px 16px;">Cancel</button>
          <button type="button" class="btn-create-primary" id="btn-del-confirm" style="background-color: var(--color-danger);">
            <span>Delete Permanently</span>
          </button>
        </div>
      </div>
    `;

    const close = () => this.callbacks.onClose();
    this.element.querySelector('#btn-del-close')?.addEventListener('click', close);
    this.element.querySelector('#btn-del-cancel')?.addEventListener('click', close);

    const confirmBtn = this.element.querySelector('#btn-del-confirm') as HTMLButtonElement;
    const errBox = this.element.querySelector('#del-err-banner') as HTMLElement;

    confirmBtn.addEventListener('click', async () => {
      if (this.isDeleting) return;
      this.isDeleting = true;
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Deleting...';

      try {
        await this.callbacks.onConfirmDelete(this.device);
        close();
      } catch (err: unknown) {
        this.isDeleting = false;
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Delete Permanently';
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

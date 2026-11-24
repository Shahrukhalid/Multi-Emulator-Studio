import { Device, GEO_LOCATION_PRESETS, GeoLocationPreset } from '../types.js';
import { Icons } from '../icons.js';

export interface LocationModalCallbacks {
  onApply: (latitude: number, longitude: number, timezone: string, proxy?: string) => Promise<void>;
  onClose: () => void;
}

export class LocationModalComponent {
  private element: HTMLElement;
  private device: Device;
  private callbacks: LocationModalCallbacks;
  private selectedPreset: GeoLocationPreset = GEO_LOCATION_PRESETS[0];
  private isApplying = false;

  constructor(device: Device, callbacks: LocationModalCallbacks) {
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
    const presetsHtml = GEO_LOCATION_PRESETS.map((p) => `
      <div class="geo-preset-card ${p.id === this.selectedPreset.id ? 'selected' : ''}" data-geo-id="${p.id}">
        <div class="geo-preset-header">
          <span class="geo-preset-flag">${p.flag}</span>
          <strong class="geo-preset-name">${p.name}</strong>
          <span class="geo-preset-latency">${p.latencyMs}ms</span>
        </div>
        <div class="geo-preset-meta">
          <span>${p.city}, ${p.country}</span>
          <code>${p.latitude.toFixed(4)}, ${p.longitude.toFixed(4)}</code>
        </div>
      </div>
    `).join('');

    this.element.innerHTML = `
      <div class="modal-window" style="max-width: 580px;">
        <div class="modal-title-bar">
          <div style="display: flex; align-items: center; gap: 8px;">
            <div style="color: var(--color-primary);">${Icons.location}</div>
            <h2 class="modal-heading">Device Location & Egress Proxy</h2>
          </div>
          <button class="btn-overflow-menu" id="btn-loc-close" title="Close" aria-label="Close">
            ${Icons.close}
          </button>
        </div>

        <div class="modal-content">
          <div id="loc-err-banner" class="preview-banner" style="display: none; background: rgba(239, 68, 68, 0.1); border-color: rgba(239, 68, 68, 0.3); color: var(--color-danger); border-radius: 6px;"></div>

          <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 12px;">
            Target device: <strong>${this.escapeHtml(this.device.spec.name)}</strong>.
            Synchronize GPS mock coordinates and Android system timezone to test multi-region features.
          </p>

          <label class="form-label-title">Quick Location Presets</label>
          <div class="geo-presets-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 16px;">
            ${presetsHtml}
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
            <div>
              <label class="form-helper-text" for="loc-lat">Latitude</label>
              <input type="number" step="0.0001" class="form-text-input" id="loc-lat" value="${this.selectedPreset.latitude}" />
            </div>
            <div>
              <label class="form-helper-text" for="loc-lon">Longitude</label>
              <input type="number" step="0.0001" class="form-text-input" id="loc-lon" value="${this.selectedPreset.longitude}" />
            </div>
          </div>

          <div class="form-block" style="margin-bottom: 12px;">
            <label class="form-helper-text" for="loc-tz">Android System Timezone</label>
            <input type="text" class="form-text-input" id="loc-tz" value="${this.selectedPreset.timezone}" />
          </div>

          <div class="form-block">
            <label class="form-helper-text" for="loc-proxy">Network Egress Proxy (HTTP / SOCKS5 - Optional)</label>
            <input type="text" class="form-text-input" id="loc-proxy" placeholder="http://proxy-us-east.edge.io:8080" value="${this.device.spec.proxy || ''}" />
            <span class="form-helper-text">Reroutes guest TCP packets through high-speed edge egress.</span>
          </div>
        </div>

        <div class="modal-actions">
          <button type="button" class="nav-item" id="btn-loc-cancel" style="padding: 8px 16px;">Cancel</button>
          <button type="button" class="btn-create-primary" id="btn-loc-submit">
            <span>Apply Location</span>
          </button>
        </div>
      </div>
    `;

    const close = () => this.callbacks.onClose();
    this.element.querySelector('#btn-loc-close')?.addEventListener('click', close);
    this.element.querySelector('#btn-loc-cancel')?.addEventListener('click', close);

    const latInput = this.element.querySelector('#loc-lat') as HTMLInputElement;
    const lonInput = this.element.querySelector('#loc-lon') as HTMLInputElement;
    const tzInput = this.element.querySelector('#loc-tz') as HTMLInputElement;
    const proxyInput = this.element.querySelector('#loc-proxy') as HTMLInputElement;
    const errBox = this.element.querySelector('#loc-err-banner') as HTMLElement;
    const submitBtn = this.element.querySelector('#btn-loc-submit') as HTMLButtonElement;

    this.element.querySelectorAll<HTMLElement>('.geo-preset-card').forEach((card) => {
      card.addEventListener('click', () => {
        const id = card.dataset.geoId;
        const preset = GEO_LOCATION_PRESETS.find((p) => p.id === id);
        if (preset) {
          this.selectedPreset = preset;
          latInput.value = String(preset.latitude);
          lonInput.value = String(preset.longitude);
          tzInput.value = preset.timezone;
          this.element.querySelectorAll('.geo-preset-card').forEach((c) => c.classList.remove('selected'));
          card.classList.add('selected');
        }
      });
    });

    submitBtn.addEventListener('click', async () => {
      if (this.isApplying) return;
      const lat = parseFloat(latInput.value);
      const lon = parseFloat(lonInput.value);
      const tz = tzInput.value.trim();
      const proxy = proxyInput.value.trim() || undefined;

      if (isNaN(lat) || lat < -90 || lat > 90) {
        errBox.textContent = 'Latitude must be between -90 and 90';
        errBox.style.display = 'block';
        return;
      }
      if (isNaN(lon) || lon < -180 || lon > 180) {
        errBox.textContent = 'Longitude must be between -180 and 180';
        errBox.style.display = 'block';
        return;
      }
      if (!tz) {
        errBox.textContent = 'Timezone is required (e.g. America/New_York)';
        errBox.style.display = 'block';
        return;
      }

      errBox.style.display = 'none';
      this.isApplying = true;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Applying...';

      try {
        await this.callbacks.onApply(lat, lon, tz, proxy);
        close();
      } catch (err: unknown) {
        this.isApplying = false;
        submitBtn.disabled = false;
        submitBtn.textContent = 'Apply Location';
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

import {
  DeviceSpec,
  DEVICE_PRESETS,
  DevicePreset,
  FriendlyVersion,
  parseFriendlyVersion,
  HostInfo,
  validateDeviceSpec
} from '../types.js';
import { Illustrations } from '../illustrations.js';
import { Icons } from '../icons.js';

export interface WizardCallbacks {
  onCreate: (spec: DeviceSpec, autoLaunch: boolean) => Promise<void>;
  onClose: () => void;
}

export class WizardComponent {
  private element: HTMLElement;
  private callbacks: WizardCallbacks;
  private installedImages: string[] = [];
  private hardwareProfiles: string[] = [];
  private host: HostInfo | null;

  private selectedPlatform: 'android' | 'ios' = 'android';
  private selectedPreset: DevicePreset = DEVICE_PRESETS[0];
  private selectedImage: string = '';
  private showAdvanced = false;
  private isSubmitting = false;

  constructor(
    installedImages: string[],
    hardwareProfiles: string[],
    host: HostInfo | null,
    callbacks: WizardCallbacks,
    initialPreset?: DevicePreset
  ) {
    this.installedImages = installedImages;
    this.hardwareProfiles = hardwareProfiles;
    this.host = host;
    this.callbacks = callbacks;
    if (initialPreset) this.selectedPreset = initialPreset;

    this.selectedImage = this.installedImages[0] || 'system-images;android-34;google_apis;x86_64';

    this.element = document.createElement('div');
    this.element.className = 'modal-backdrop';
    this.render();
  }

  getElement(): HTMLElement {
    return this.element;
  }

  private render(): void {
    const isMac = this.host?.os === 'macos';

    // Parse friendly versions from installed system images
    const friendlyVersions: FriendlyVersion[] = this.installedImages.map(parseFriendlyVersion);

    // If no images installed, provide default friendly fallback option
    const versionOptions =
      friendlyVersions.length > 0
        ? friendlyVersions
            .map(
              (v) =>
                `<option value="${this.escapeHtml(v.rawImage)}" ${
                  v.rawImage === this.selectedImage ? 'selected' : ''
                }>${v.versionName} (${v.tag})</option>`
            )
            .join('')
        : `<option value="system-images;android-34;google_apis;x86_64">Android 14 (Google APIs)</option>`;

    // Hardware profiles fallback
    const resolvedHardwareProfile =
      this.hardwareProfiles.includes(this.selectedPreset.hardwareProfileId)
        ? this.selectedPreset.hardwareProfileId
        : this.hardwareProfiles[0] || 'pixel_6';

    // Default recommended RAM and cores based on host
    const hostRamMb = this.host?.ram_mb ?? 16384;
    const defaultRam = Math.min(this.selectedPreset.recommendedRamMb, Math.max(2048, Math.floor(hostRamMb / 4)));
    const defaultCores = Math.min(this.selectedPreset.recommendedCores, Math.max(2, (this.host?.cores ?? 4) / 2));

    this.element.innerHTML = `
      <div class="modal-window">
        <div class="modal-title-bar">
          <h2 class="modal-heading">Create New Virtual Device</h2>
          <button class="btn-overflow-menu" id="btn-wizard-close" title="Close" aria-label="Close">
            ${Icons.close}
          </button>
        </div>

        <form class="modal-content" id="wizard-form-el">
          <div id="wizard-error-banner" class="preview-banner" style="display: none; background: rgba(239, 68, 68, 0.1); border-color: rgba(239, 68, 68, 0.3); color: var(--color-danger); border-radius: 6px;"></div>

          <!-- Step 1: Platform Selection -->
          <div class="form-block">
            <span class="form-label-title">1. Platform</span>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 4px;">
              <div class="device-choice-card ${this.selectedPlatform === 'android' ? 'selected' : ''}" id="plat-android">
                <div style="color: var(--color-success);">${Icons.android}</div>
                <div>
                  <div class="choice-name">Android</div>
                  <div class="choice-desc">Real Android emulator</div>
                </div>
              </div>

              <div class="device-choice-card ${isMac ? '' : 'disabled'}" id="plat-ios" style="${!isMac ? 'opacity: 0.5; cursor: not-allowed;' : ''}">
                <div style="color: var(--text-secondary);">${Icons.apple}</div>
                <div>
                  <div class="choice-name">iOS Simulator</div>
                  <div class="choice-desc">${isMac ? 'Apple Xcode' : 'macOS only'}</div>
                </div>
              </div>
            </div>
          </div>

          <!-- Step 2: Form Factor Choice -->
          <div class="form-block">
            <span class="form-label-title">2. Choose Device Form Factor</span>
            <div class="device-form-grid" style="margin-top: 4px;">
              ${DEVICE_PRESETS.map((preset) => {
                let iconArt = Illustrations.phone;
                if (preset.formFactor === 'large_phone') iconArt = Illustrations.largePhone;
                if (preset.formFactor === 'tablet') iconArt = Illustrations.tablet;
                if (preset.formFactor === 'foldable') iconArt = Illustrations.foldable;
                const isSelected = preset.id === this.selectedPreset.id;
                return `
                  <div class="device-choice-card ${isSelected ? 'selected' : ''}" data-preset-id="${preset.id}">
                    <div style="display: flex; align-items: center; justify-content: center; width: 36px;">
                      ${iconArt}
                    </div>
                    <div>
                      <div class="choice-name">${preset.name}</div>
                      <div class="choice-desc">${preset.width} × ${preset.height}</div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>

          <!-- Step 3: Operating System -->
          <div class="form-block">
            <label class="form-label-title" for="wiz-os-select">3. Android Version</label>
            <select class="form-select-input" id="wiz-os-select">
              ${versionOptions}
            </select>
            <span class="form-helper-text">Discovered compatible Android system images on your system.</span>
          </div>

          <!-- Step 4: Configuration -->
          <div class="form-block">
            <span class="form-label-title">4. Device Details</span>
            <div style="margin-top: 6px; display: flex; flex-direction: column; gap: 10px;">
              <div>
                <label class="form-helper-text" for="wiz-name-input">Device Name</label>
                <input class="form-text-input" id="wiz-name-input" value="${this.selectedPreset.name}" required />
              </div>

              <!-- Collapsible Advanced Settings -->
              <div>
                <button type="button" class="accordion-toggle" id="btn-toggle-advanced">
                  <span>${this.showAdvanced ? '− Hide Advanced Hardware Configuration' : '+ Show Advanced Hardware Configuration'}</span>
                </button>

                <div id="advanced-config-panel" style="display: ${this.showAdvanced ? 'flex' : 'none'}; flex-direction: column; gap: 12px; margin-top: 8px; padding: 14px; background: var(--bg-surface-subtle); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm);">
                  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                    <div>
                      <label class="form-helper-text" for="wiz-ram">RAM (MB)</label>
                      <input type="number" class="form-text-input" id="wiz-ram" value="${defaultRam}" min="1024" max="32768" />
                    </div>
                    <div>
                      <label class="form-helper-text" for="wiz-cores">CPU Cores</label>
                      <input type="number" class="form-text-input" id="wiz-cores" value="${defaultCores}" min="1" max="16" />
                    </div>
                  </div>

                  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                    <div>
                      <label class="form-helper-text" for="wiz-width">Width (px)</label>
                      <input type="number" class="form-text-input" id="wiz-width" value="${this.selectedPreset.width}" min="320" max="4320" />
                    </div>
                    <div>
                      <label class="form-helper-text" for="wiz-height">Height (px)</label>
                      <input type="number" class="form-text-input" id="wiz-height" value="${this.selectedPreset.height}" min="320" max="4320" />
                    </div>
                  </div>

                  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                    <div>
                      <label class="form-helper-text" for="wiz-disk">Storage Disk (MB)</label>
                      <input type="number" class="form-text-input" id="wiz-disk" value="8192" min="2048" max="131072" />
                    </div>
                    <div>
                      <label class="form-helper-text" for="wiz-locale">Language & Region</label>
                      <input type="text" class="form-text-input" id="wiz-locale" value="en-US" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </form>

        <div class="modal-actions">
          <button type="button" class="nav-item" id="btn-wizard-cancel" style="padding: 8px 16px;">Cancel</button>
          <button type="button" class="btn-create-primary" id="btn-wizard-submit">
            <span>Create & Launch Device</span>
          </button>
        </div>
      </div>
    `;

    // Presets selection
    this.element.querySelectorAll('[data-preset-id]').forEach((card) => {
      card.addEventListener('click', () => {
        const id = card.getAttribute('data-preset-id');
        const found = DEVICE_PRESETS.find((p) => p.id === id);
        if (found) {
          this.selectedPreset = found;
          const nameInput = this.element.querySelector('#wiz-name-input') as HTMLInputElement;
          if (nameInput) nameInput.value = found.name;
          const wInput = this.element.querySelector('#wiz-width') as HTMLInputElement;
          const hInput = this.element.querySelector('#wiz-height') as HTMLInputElement;
          if (wInput) wInput.value = String(found.width);
          if (hInput) hInput.value = String(found.height);
          this.render();
        }
      });
    });

    // Toggle Advanced
    this.element.querySelector('#btn-toggle-advanced')?.addEventListener('click', () => {
      this.showAdvanced = !this.showAdvanced;
      const panel = this.element.querySelector('#advanced-config-panel') as HTMLElement;
      const toggle = this.element.querySelector('#btn-toggle-advanced') as HTMLElement;
      if (panel) panel.style.display = this.showAdvanced ? 'flex' : 'none';
      if (toggle) toggle.textContent = this.showAdvanced ? '− Hide Advanced Hardware Configuration' : '+ Show Advanced Hardware Configuration';
    });

    // Close actions
    const close = () => this.callbacks.onClose();
    this.element.querySelector('#btn-wizard-close')?.addEventListener('click', close);
    this.element.querySelector('#btn-wizard-cancel')?.addEventListener('click', close);

    // Submit action
    const submitBtn = this.element.querySelector('#btn-wizard-submit') as HTMLButtonElement;
    submitBtn.addEventListener('click', async () => {
      if (this.isSubmitting) return;

      const nameInput = this.element.querySelector('#wiz-name-input') as HTMLInputElement;
      const osSelect = this.element.querySelector('#wiz-os-select') as HTMLSelectElement;
      const ramInput = this.element.querySelector('#wiz-ram') as HTMLInputElement;
      const coresInput = this.element.querySelector('#wiz-cores') as HTMLInputElement;
      const wInput = this.element.querySelector('#wiz-width') as HTMLInputElement;
      const hInput = this.element.querySelector('#wiz-height') as HTMLInputElement;
      const diskInput = this.element.querySelector('#wiz-disk') as HTMLInputElement;
      const localeInput = this.element.querySelector('#wiz-locale') as HTMLInputElement;
      const errBanner = this.element.querySelector('#wizard-error-banner') as HTMLElement;

      const spec: DeviceSpec = {
        name: nameInput.value.trim(),
        image: osSelect.value,
        hardware_profile: resolvedHardwareProfile,
        ram_mb: Number(ramInput?.value || defaultRam),
        cores: Number(coresInput?.value || defaultCores),
        width: Number(wInput?.value || this.selectedPreset.width),
        height: Number(hInput?.value || this.selectedPreset.height),
        disk_mb: Number(diskInput?.value || 8192),
        locale: localeInput?.value.trim() || 'en-US'
      };

      const validationErr = validateDeviceSpec(spec);
      if (validationErr) {
        errBanner.textContent = validationErr;
        errBanner.style.display = 'block';
        return;
      }

      errBanner.style.display = 'none';
      this.isSubmitting = true;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Creating Virtual Device...';

      try {
        await this.callbacks.onCreate(spec, true);
        close();
      } catch (err: unknown) {
        this.isSubmitting = false;
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create & Launch Device';
        errBanner.textContent = (err as { message?: string }).message || String(err);
        errBanner.style.display = 'block';
      }
    });
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

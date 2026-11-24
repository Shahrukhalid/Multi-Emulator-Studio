import {
  DeviceSpec,
  DEVICE_PRESETS,
  DevicePreset,
  FriendlyVersion,
  parseFriendlyVersion,
  HostInfo,
  validateDeviceSpec,
  GEO_LOCATION_PRESETS
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

  private currentStep = 1; // 1 to 5
  private selectedPlatform: 'android' | 'ios' = 'android';
  private selectedFormFactor: 'phone' | 'tablet' | 'foldable' = 'phone';
  private selectedPreset: DevicePreset = DEVICE_PRESETS[0];
  private selectedImage: string = '';
  private showAdvanced = false;
  private isSubmitting = false;

  private deviceName = 'Pixel 8 Pro - Test';
  private ramMb = 6144;
  private cores = 4;
  private diskMb = 8192;
  private selectedGeoPreset = GEO_LOCATION_PRESETS[0].id;
  private proxyUrl = '';

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
    if (initialPreset) {
      this.selectedPreset = initialPreset;
      this.deviceName = initialPreset.name;
    }

    this.selectedImage = this.installedImages[0] || '';

    this.element = document.createElement('div');
    this.element.className = 'modal-backdrop';
    this.render();
  }

  getElement(): HTMLElement {
    return this.element;
  }

  private render(): void {
    const isMac = this.host?.os === 'macos';
    const friendlyVersions: FriendlyVersion[] = this.installedImages.map(parseFriendlyVersion);

    const stepTitles = [
      'Choose Platform',
      'Choose Device Type',
      'Select a Template',
      'Configure Device',
      'Device Created!'
    ];

    const stepSubtitles = [
      'Select the operating system for your virtual device.',
      'Select a device form factor.',
      'Start with a pre-configured device template.',
      'Set basic hardware and proxy options.',
      'Your virtual device is ready to use.'
    ];

    this.element.innerHTML = `
      <div class="modal-window wizard-window">
        <div class="modal-title-bar">
          <div class="wizard-header-indicator">
            <span class="wizard-step-pill">Step ${this.currentStep} of 5</span>
            <h2 class="modal-heading">${stepTitles[this.currentStep - 1]}</h2>
          </div>
          <button class="btn-overflow-menu" id="btn-wizard-close" title="Close" aria-label="Close">
            ${Icons.close}
          </button>
        </div>

        <div class="wizard-subtitle">${stepSubtitles[this.currentStep - 1]}</div>

        <div class="modal-content wizard-body">
          <div id="wizard-error-banner" class="preview-banner" style="display: none; background: rgba(239, 68, 68, 0.1); border-color: rgba(239, 68, 68, 0.3); color: var(--color-danger); border-radius: 6px; margin-bottom: 12px;"></div>

          ${this.renderStepContent(isMac, friendlyVersions)}
        </div>

        <div class="modal-actions wizard-actions">
          ${this.renderStepActions()}
        </div>
      </div>
    `;

    this.bindEvents();
  }

  private renderStepContent(isMac: boolean, friendlyVersions: FriendlyVersion[]): string {
    if (this.currentStep === 1) {
      return `
        <div class="wizard-platform-grid">
          <div class="choice-platform-card ${this.selectedPlatform === 'android' ? 'selected' : ''}" id="card-plat-android">
            <div class="platform-icon-circle android">${Icons.android}</div>
            <div class="platform-text">
              <strong>Android</strong>
              <span>Phone, Tablet, Foldable</span>
            </div>
          </div>

          <div class="choice-platform-card ${this.selectedPlatform === 'ios' ? 'selected' : ''} ${!isMac ? 'disabled' : ''}" id="card-plat-ios">
            <div class="platform-icon-circle apple">${Icons.apple}</div>
            <div class="platform-text">
              <strong>iOS Simulator</strong>
              <span>${isMac ? 'Xcode iOS Simulators' : 'macOS Only'}</span>
            </div>
          </div>
        </div>
      `;
    }

    if (this.currentStep === 2) {
      return `
        <div class="wizard-formfactor-grid">
          <div class="choice-type-card ${this.selectedFormFactor === 'phone' ? 'selected' : ''}" data-formfactor="phone">
            <div class="type-icon">${Illustrations.phone}</div>
            <strong>Phone</strong>
            <span>Standard handheld</span>
          </div>

          <div class="choice-type-card ${this.selectedFormFactor === 'tablet' ? 'selected' : ''}" data-formfactor="tablet">
            <div class="type-icon">${Illustrations.tablet}</div>
            <strong>Tablet</strong>
            <span>Large display</span>
          </div>

          <div class="choice-type-card ${this.selectedFormFactor === 'foldable' ? 'selected' : ''}" data-formfactor="foldable">
            <div class="type-icon">${Illustrations.foldable}</div>
            <strong>Foldable</strong>
            <span>Dual screen</span>
          </div>
        </div>
      `;
    }

    if (this.currentStep === 3) {
      const presets = this.selectedPlatform === 'ios'
        ? [
            { id: 'ios-iphone-15-pro', name: 'iPhone 15 Pro', ram: '8 GB', res: '1179 × 2556', width: 1179, height: 2556, rec: true },
            { id: 'ios-iphone-15', name: 'iPhone 15', ram: '6 GB', res: '1179 × 2556', width: 1179, height: 2556, rec: false },
            { id: 'ios-ipad-air', name: 'iPad Air (5th gen)', ram: '8 GB', res: '1640 × 2360', width: 1640, height: 2360, rec: false }
          ]
        : DEVICE_PRESETS.map((p, idx) => ({
            id: p.id,
            name: p.name,
            ram: `${Math.round(p.recommendedRamMb / 1024)} GB`,
            res: `${p.width} × ${p.height}`,
            width: p.width,
            height: p.height,
            rec: idx === 0
          }));

      return `
        <div class="wizard-template-list">
          ${presets.map((p) => {
            const isSelected = this.selectedPreset.id === p.id || (this.selectedPlatform === 'ios' && this.deviceName.startsWith(p.name));
            return `
              <div class="wizard-template-item ${isSelected ? 'selected' : ''}" data-preset-id="${p.id}">
                <div class="template-item-left">
                  <div class="template-check-dot">${isSelected ? '✓' : ''}</div>
                  <div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <strong>${p.name}</strong>
                      ${p.rec ? '<span class="badge-recommended">Recommended</span>' : ''}
                    </div>
                    <span class="template-meta">${this.selectedPlatform === 'ios' ? 'iOS 17.4 · ' : 'Android 14/15 · '}${p.ram} RAM · 128 GB</span>
                  </div>
                </div>
                <span class="template-res">${p.res}</span>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }

    if (this.currentStep === 4) {
      const versionOptions = this.selectedPlatform === 'ios'
        ? `<option value="ios-17-4" selected>iOS 17.4 (Xcode CoreSimulator)</option><option value="ios-17-2">iOS 17.2 (Xcode CoreSimulator)</option>`
        : friendlyVersions.length > 0
          ? friendlyVersions.map((v) => `<option value="${this.escapeHtml(v.rawImage)}" ${v.rawImage === this.selectedImage ? 'selected' : ''}>${v.versionName} (${v.tag})</option>`).join('')
          : `<option value="">No compatible images installed</option>`;

      const geoOptions = GEO_LOCATION_PRESETS.map((g) =>
        `<option value="${g.id}" ${g.id === this.selectedGeoPreset ? 'selected' : ''}>${g.flag} ${g.name} (${g.city})</option>`
      ).join('');

      return `
        <div class="wizard-config-form">
          <div class="form-block">
            <label class="form-helper-text" for="wiz-name-input">Device Name</label>
            <input type="text" class="form-text-input" id="wiz-name-input" value="${this.escapeHtml(this.deviceName)}" />
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div>
              <label class="form-helper-text" for="wiz-ram-select">RAM Memory</label>
              <select class="form-select-input" id="wiz-ram-select">
                <option value="4096" ${this.ramMb === 4096 ? 'selected' : ''}>4 GB</option>
                <option value="6144" ${this.ramMb === 6144 ? 'selected' : ''}>6 GB (Recommended)</option>
                <option value="8192" ${this.ramMb === 8192 ? 'selected' : ''}>8 GB (High Performance)</option>
              </select>
            </div>
            <div>
              <label class="form-helper-text" for="wiz-disk-input">Storage Disk</label>
              <input type="number" class="form-text-input" id="wiz-disk-input" value="${this.diskMb}" min="4096" step="1024" />
            </div>
          </div>

          <div class="form-block">
            <label class="form-helper-text" for="wiz-os-select">System Image</label>
            <select class="form-select-input" id="wiz-os-select">
              ${versionOptions}
            </select>
          </div>

          <button type="button" class="btn-toggle-accordion" id="btn-toggle-advanced">
            ${this.showAdvanced ? '− Hide Advanced & Network Settings' : '+ Show Advanced & Network Settings'}
          </button>

          <div class="advanced-settings-panel" id="wiz-advanced-panel" style="display: ${this.showAdvanced ? 'flex' : 'none'}; flex-direction: column; gap: 10px; margin-top: 8px;">
            <div>
              <label class="form-helper-text" for="wiz-geo-select">Location / Geolocation Preset</label>
              <select class="form-select-input" id="wiz-geo-select">
                ${geoOptions}
              </select>
            </div>
            <div>
              <label class="form-helper-text" for="wiz-proxy-input">Network Egress Proxy (Optional)</label>
              <input type="text" class="form-text-input" id="wiz-proxy-input" placeholder="http://proxy-us.edge.net:8080" value="${this.escapeHtml(this.proxyUrl)}" />
            </div>
          </div>
        </div>
      `;
    }

    // Step 5: Created!
    return `
      <div class="wizard-success-stage">
        <div class="success-checkmark-circle">✓</div>
        <h2>Device Created!</h2>
        <p>Your virtual Android device <strong>${this.escapeHtml(this.deviceName)}</strong> is ready to use.</p>
      </div>
    `;
  }

  private renderStepActions(): string {
    const close = 'this.callbacks.onClose()';
    if (this.currentStep === 1) {
      return `
        <button type="button" class="nav-item" id="btn-step-cancel">Cancel</button>
        <button type="button" class="btn-create-primary" id="btn-step-next"><span>Next →</span></button>
      `;
    }
    if (this.currentStep === 2 || this.currentStep === 3) {
      return `
        <button type="button" class="nav-item" id="btn-step-back">← Back</button>
        <button type="button" class="btn-create-primary" id="btn-step-next"><span>Next →</span></button>
      `;
    }
    if (this.currentStep === 4) {
      return `
        <button type="button" class="nav-item" id="btn-step-back">← Back</button>
        <button type="button" class="btn-create-primary" id="btn-step-create" ${this.isSubmitting ? 'disabled' : ''}>
          <span>${this.isSubmitting ? 'Creating...' : 'Create Device'}</span>
        </button>
      `;
    }
    // Step 5
    return `
      <button type="button" class="nav-item" id="btn-step-another">Create Another</button>
      <button type="button" class="btn-create-primary" id="btn-step-start"><span>Start Device</span></button>
    `;
  }

  private bindEvents(): void {
    const close = () => this.callbacks.onClose();
    this.element.querySelector('#btn-wizard-close')?.addEventListener('click', close);
    this.element.querySelector('#btn-step-cancel')?.addEventListener('click', close);

    // Step 1
    this.element.querySelector('#card-plat-android')?.addEventListener('click', () => {
      this.selectedPlatform = 'android';
      this.render();
    });
    this.element.querySelector('#card-plat-ios')?.addEventListener('click', () => {
      this.selectedPlatform = 'ios';
      this.deviceName = 'iPhone 15 Pro - Simulator';
      this.selectedImage = 'ios-17-4';
      this.render();
    });

    // Step 2
    this.element.querySelectorAll<HTMLElement>('.choice-type-card').forEach((card) => {
      card.addEventListener('click', () => {
        this.selectedFormFactor = card.dataset.formfactor as typeof this.selectedFormFactor;
        const matching = DEVICE_PRESETS.find((p) => p.formFactor === this.selectedFormFactor);
        if (matching) {
          this.selectedPreset = matching;
          this.deviceName = matching.name;
        }
        this.render();
      });
    });

    // Step 3
    this.element.querySelectorAll<HTMLElement>('.wizard-template-item').forEach((item) => {
      item.addEventListener('click', () => {
        const id = item.dataset.presetId;
        const found = DEVICE_PRESETS.find((p) => p.id === id);
        if (found) {
          this.selectedPreset = found;
          this.deviceName = found.name;
          this.render();
        }
      });
    });

    // Step 4
    this.element.querySelector('#btn-toggle-advanced')?.addEventListener('click', () => {
      this.showAdvanced = !this.showAdvanced;
      const panel = this.element.querySelector('#wiz-advanced-panel') as HTMLElement;
      if (panel) panel.style.display = this.showAdvanced ? 'flex' : 'none';
      const btn = this.element.querySelector('#btn-toggle-advanced') as HTMLElement;
      if (btn) btn.textContent = this.showAdvanced ? '− Hide Advanced & Network Settings' : '+ Show Advanced & Network Settings';
    });

    // Next / Back buttons
    this.element.querySelector('#btn-step-next')?.addEventListener('click', () => {
      if (this.currentStep < 4) {
        this.currentStep += 1;
        this.render();
      }
    });

    this.element.querySelector('#btn-step-back')?.addEventListener('click', () => {
      if (this.currentStep > 1) {
        this.currentStep -= 1;
        this.render();
      }
    });

    // Create action
    this.element.querySelector('#btn-step-create')?.addEventListener('click', async () => {
      if (this.isSubmitting) return;

      const nameInput = this.element.querySelector('#wiz-name-input') as HTMLInputElement;
      const ramSelect = this.element.querySelector('#wiz-ram-select') as HTMLSelectElement;
      const diskInput = this.element.querySelector('#wiz-disk-input') as HTMLInputElement;
      const osSelect = this.element.querySelector('#wiz-os-select') as HTMLSelectElement;
      const geoSelect = this.element.querySelector('#wiz-geo-select') as HTMLSelectElement;
      const proxyInput = this.element.querySelector('#wiz-proxy-input') as HTMLInputElement;
      const errBanner = this.element.querySelector('#wizard-error-banner') as HTMLElement;

      if (nameInput) this.deviceName = nameInput.value.trim();
      if (ramSelect) this.ramMb = parseInt(ramSelect.value, 10);
      if (diskInput) this.diskMb = parseInt(diskInput.value, 10);
      if (osSelect) this.selectedImage = osSelect.value;
      if (geoSelect) this.selectedGeoPreset = geoSelect.value;
      if (proxyInput) this.proxyUrl = proxyInput.value.trim();

      const resolvedHardwareProfile =
        this.selectedPlatform === 'ios'
          ? 'sim-iphone-15-pro'
          : (this.hardwareProfiles.includes(this.selectedPreset.hardwareProfileId)
              ? this.selectedPreset.hardwareProfileId
              : this.hardwareProfiles[0] || '');

      const resolvedImage =
        this.selectedPlatform === 'ios'
          ? (this.selectedImage || 'ios-17-4')
          : this.selectedImage;

      const spec: DeviceSpec = {
        name: this.deviceName,
        image: resolvedImage,
        hardware_profile: resolvedHardwareProfile,
        ram_mb: this.ramMb,
        cores: this.cores,
        width: this.selectedPreset.width,
        height: this.selectedPreset.height,
        disk_mb: this.diskMb,
        locale: 'en-US',
        graphics_mode: 'auto',
        proxy: this.proxyUrl || undefined,
        location_preset: this.selectedGeoPreset || undefined
      };

      const valErr = validateDeviceSpec(spec);
      if (valErr) {
        errBanner.textContent = valErr;
        errBanner.style.display = 'block';
        return;
      }

      errBanner.style.display = 'none';
      this.isSubmitting = true;
      const btn = this.element.querySelector('#btn-step-create') as HTMLButtonElement;
      if (btn) btn.disabled = true;

      try {
        await this.callbacks.onCreate(spec, false);
        this.isSubmitting = false;
        this.currentStep = 5;
        this.render();
      } catch (err: unknown) {
        this.isSubmitting = false;
        if (btn) btn.disabled = false;
        errBanner.textContent = (err as { message?: string }).message || String(err);
        errBanner.style.display = 'block';
      }
    });

    // Step 5 actions
    this.element.querySelector('#btn-step-another')?.addEventListener('click', () => {
      this.currentStep = 1;
      this.deviceName = 'Pixel 8 Pro - Test';
      this.render();
    });

    this.element.querySelector('#btn-step-start')?.addEventListener('click', () => {
      close();
    });
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

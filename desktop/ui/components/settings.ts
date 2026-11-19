import { HostInfo, SdkInfo, NetworkReport } from '../types.js';

export interface SettingsCallbacks {
  onThemeChange: (theme: 'system' | 'dark' | 'light') => void;
  onDataDirChange: (path: string, sdkRoot?: string | null) => Promise<void>;
  onInstallRuntime: (sdkRoot: string) => Promise<void>;
  onPickSdkDirectory: () => Promise<string | null>;
  onCheckSdk: () => Promise<void>;
  onFetchLogs: () => Promise<string>;
}

export class SettingsComponent {
  private element: HTMLElement;
  private host: HostInfo | null;
  private sdk: SdkInfo | null;
  private accelerationText: string;
  private emulatorVersion = '';
  private runtimeDiagnostic = '';
  private installedImagesCount: number;
  private networkReport: NetworkReport | null;
  private callbacks: SettingsCallbacks;

  private currentTheme: 'system' | 'dark' | 'light' = 'dark';
  private developerMode = false;
  private dataDir = '';
  private sdkDir = '';
  private connected = false;
  private installing = false;

  constructor(
    host: HostInfo | null,
    sdk: SdkInfo | null,
    accelerationText: string,
    installedImagesCount: number,
    networkReport: NetworkReport | null,
    dataDir: string,
    sdkDir: string,
    callbacks: SettingsCallbacks
  ) {
    this.host = host;
    this.sdk = sdk;
    this.accelerationText = accelerationText;
    this.installedImagesCount = installedImagesCount;
    this.networkReport = networkReport;
    this.dataDir = dataDir;
    this.sdkDir = sdkDir;
    this.callbacks = callbacks;

    const savedTheme = localStorage.getItem('mes_theme_mode') as 'system' | 'dark' | 'light' | null;
    if (savedTheme) this.currentTheme = savedTheme;

    const savedDevMode = localStorage.getItem('mes_dev_mode') === 'true';
    this.developerMode = savedDevMode;

    this.element = document.createElement('div');
    this.element.className = 'settings-view';
    this.render();
  }

  getElement(): HTMLElement {
    return this.element;
  }

  setConnection(dataDir: string, connected: boolean): void {
    this.dataDir = dataDir;
    this.connected = connected;
    if (this.sdk) this.sdkDir = this.sdk.root;
    this.render();
  }

  updateData(
    host: HostInfo | null,
    sdk: SdkInfo | null,
    accelerationText: string,
    imagesCount: number,
    networkReport: NetworkReport | null,
    emulatorVersion: string,
    runtimeDiagnostic: string
  ): void {
    this.host = host;
    this.sdk = sdk;
    this.accelerationText = accelerationText;
    this.installedImagesCount = imagesCount;
    this.networkReport = networkReport;
    this.emulatorVersion = emulatorVersion;
    this.runtimeDiagnostic = runtimeDiagnostic;
    this.render();
  }

  private render(): void {
    const isSdkDetected = !!this.sdk;

    this.element.innerHTML = `
      <div class="view-header">
        <div>
          <h2 class="view-title">Settings</h2>
          <p class="view-subtitle">Manage application appearance, Android SDK runtime setup, and advanced options.</p>
        </div>
      </div>

      <!-- Section 1: Appearance & Storage -->
      <div class="settings-card">
        <h3 class="settings-card-title">General & Appearance</h3>

        <div class="setting-row">
          <div>
            <div style="font-weight: 500; font-size: 13px;">Application Theme</div>
            <div style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">
              Choose between light, dark, or automatic system appearance.
            </div>
          </div>
          <select class="form-select-input" id="setting-theme-select" style="max-width: 160px;">
            <option value="system" ${this.currentTheme === 'system' ? 'selected' : ''}>System Default</option>
            <option value="dark" ${this.currentTheme === 'dark' ? 'selected' : ''}>Dark</option>
            <option value="light" ${this.currentTheme === 'light' ? 'selected' : ''}>Light</option>
          </select>
        </div>

        <div class="setting-row">
          <div>
            <div style="font-weight: 500; font-size: 13px;">Device Storage Directory</div>
            <div style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">
              Path where SQLite metadata, locks, and user virtual devices reside.
            </div>
          </div>
          <div style="display: flex; gap: 8px; align-items: center;">
            <input class="form-text-input" id="setting-datadir-input" value="${this.escapeHtml(this.dataDir)}" readonly style="min-width: 280px; font-size: 11px; font-family: var(--font-mono);" />
          </div>
        </div>

        <div class="setting-row">
          <label for="setting-sdk-input">Android SDK directory</label>
          <input class="form-text-input" id="setting-sdk-input" value="${this.escapeHtml(this.sdkDir)}" placeholder="Path to installed official Android SDK" ${this.connected || this.installing ? 'readonly' : ''} />
          <button class="nav-item" id="btn-connect-sdk" ${this.connected || this.installing ? 'disabled' : ''}>${this.connected ? 'Connected' : 'Connect SDK'}</button>
          <button class="nav-item" id="btn-sdk-browse" ${this.connected || this.installing ? 'disabled' : ''}>Browse…</button>
        </div>
      </div>

      <!-- Section 2: Android Runtime & Toolchain Setup -->
      <div class="settings-card">
        <h3 class="settings-card-title">Android Runtime & Environment</h3>

        <div class="setting-row">
          <div>
            <div style="font-weight: 500; font-size: 13px;">Official SDK Toolchain</div>
            <div style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">
              ${
                isSdkDetected
                  ? `Located at <code style="font-size: 11px;">${this.escapeHtml(this.sdk?.root || '')}</code>`
                  : 'No official Android SDK detected in standard paths.'
              }
            </div>
          </div>
          <div>
            <span class="platform-badge ${isSdkDetected ? 'active' : 'notice'}">
              ${isSdkDetected ? '✓ Tools Ready' : 'Setup Required'}
            </span>
          </div>
        </div>

        <div class="setting-row">
          <div>
            <div style="font-weight: 500; font-size: 13px;">Hardware Acceleration</div>
            <div style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">
              Virtualization support for native emulator performance (WHPX / Hypervisor / KVM).
            </div>
          </div>
          <div>
            <span class="platform-badge ${this.accelerationText.split(/\r?\n/).some(line => line.trim() === '0') ? 'active' : 'notice'}">
              ${this.accelerationText.split(/\r?\n/).some(line => line.trim() === '0') ? '✓ Hardware Accelerated' : 'Acceleration not verified'}
            </span>
          </div>
        </div>

        <div class="setting-row">
          <div>
            <div style="font-weight: 500; font-size: 13px;">Emulator Version</div>
            <div class="form-helper-text">${this.escapeHtml(this.emulatorVersion.split(/\r?\n/).find(line => line.trim()) || 'Version not verified')}</div>
            <div class="form-helper-text">A successful acceleration or version probe does not establish guest boot readiness.</div>
            ${this.runtimeDiagnostic ? `<p class="form-helper-text">${this.escapeHtml(this.runtimeDiagnostic)}</p>` : ''}
          </div>
        </div>

        <div class="setting-row">
          <div>
            <div style="font-weight: 500; font-size: 13px;">System Images Catalog</div>
            <div style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">
              ${this.installedImagesCount} compatible system image(s) installed and ready.
            </div>
          </div>
          <button class="nav-item" id="btn-rescan-sdk" style="padding: 6px 12px; font-size: 12px; border: 1px solid var(--border-subtle);">
            Check Toolchain
          </button>
        </div>

        <!-- Setup Guidance -->
        <div style="margin-top: 16px; padding: 14px; background: var(--bg-surface-subtle); border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); font-size: 12px; line-height: 1.6;">
          <div style="font-weight: 600; margin-bottom: 4px;">Android SDK License Agreement:</div>
          <p style="color: var(--text-secondary); margin-bottom: 8px;">
            In accordance with Google terms of service, Android emulator images and development binaries cannot be redistributed without explicit license acceptance.
          </p>
          <p style="color: var(--text-secondary);">
            Install the official Android SDK command-line tools and a supported Java runtime first. Open Android Studio's SDK Manager, install Android Emulator, Android SDK Platform-Tools, and an Android system image matching your computer's CPU (ARM64 on Apple Silicon or x86_64 on supported Intel/AMD PCs). Review the license terms personally. If using command-line tools, review the licenses with:
          </p>
          <pre style="background: var(--bg-app); padding: 8px 12px; border-radius: 4px; border: 1px solid var(--border-subtle); font-family: var(--font-mono); margin-top: 6px; font-size: 11px;">sdkmanager --licenses</pre>
          <p style="color: var(--text-secondary);">Enter the existing command-line tools SDK directory above. After personally accepting the package licenses, select Install Android runtime to download the emulator, platform tools and Android 14 Google Play image for your CPU. If already connected, install a Google Play image in the official SDK Manager and then Check Toolchain.</p>
          <label style="display:block; margin-top:12px;">
            <input type="checkbox" id="runtime-license-confirm" ${this.connected || this.installing ? 'disabled' : ''} />
            I have reviewed and accepted the required SDK licenses using the official SDK Manager.
          </label>
          <button class="nav-item" id="btn-install-runtime" disabled style="margin-top:8px;">
            ${this.installing ? 'Installing Android runtime…' : 'Install Android runtime'}
          </button>
          <p id="runtime-install-result" role="status" class="form-helper-text"></p>
        </div>
      </div>

      <!-- Section 3: Developer Mode (Advanced Functions) -->
      <div class="settings-card">
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <div>
            <h3 class="settings-card-title" style="margin-bottom: 2px;">Developer Mode</h3>
            <p style="font-size: 12px; color: var(--text-secondary);">
              Expose low-level diagnostics, ADB ports, Logcat viewer, and network isolation telemetry.
            </p>
          </div>
          <label class="switch">
            <input type="checkbox" id="toggle-developer-mode" ${this.developerMode ? 'checked' : ''} />
            <span class="slider-round"></span>
          </label>
        </div>

        <div id="developer-tools-panel" style="display: ${this.developerMode ? 'block' : 'none'}; margin-top: 20px; border-top: 1px solid var(--border-subtle); padding-top: 16px;">
          <h4 style="font-size: 13px; font-weight: 600; margin-bottom: 8px;">Technical Diagnostics</h4>

          <div style="font-size: 12px; color: var(--text-secondary); line-height: 1.6; margin-bottom: 12px;">
            <strong>Network Isolation Architecture:</strong> ${
              this.networkReport?.note ||
              'Duplicate guest IPs can be expected in isolated NAT networks; public IP and MAC customization are not asserted.'
            }
          </div>

          <div style="display: flex; gap: 8px;">
            <button class="nav-item" id="btn-dev-inspect-logs" style="padding: 6px 12px; font-size: 12px; border: 1px solid var(--border-subtle);">
              Inspect Logcat Output
            </button>
          </div>

          <pre id="dev-logcat-box" style="display: none; background: #090d16; color: #e2e8f0; font-family: var(--font-mono); font-size: 11px; padding: 12px; border-radius: 6px; border: 1px solid var(--border-subtle); max-height: 240px; overflow-y: auto; margin-top: 10px;"></pre>
        </div>
      </div>
    `;

    // Theme select
    const themeSelect = this.element.querySelector('#setting-theme-select') as HTMLSelectElement;
    themeSelect?.addEventListener('change', () => {
      const val = themeSelect.value as 'system' | 'dark' | 'light';
      this.currentTheme = val;
      localStorage.setItem('mes_theme_mode', val);
      this.callbacks.onThemeChange(val);
    });

    // Connect after initial SDK discovery fails. Do not migrate live storage.
    const browse = this.element.querySelector('#btn-sdk-browse') as HTMLButtonElement;
    browse.addEventListener('click', async () => {
      if (this.connected || this.installing) return;
      browse.disabled = true;
      try {
        const selected = await this.callbacks.onPickSdkDirectory();
        if (selected && !this.connected && !this.installing) {
          this.sdkDir = selected;
          (this.element.querySelector('#setting-sdk-input') as HTMLInputElement).value = selected;
        }
      } catch (err: unknown) {
        const result = this.element.querySelector('#runtime-install-result') as HTMLElement;
        result.textContent = (err as { message?: string }).message || String(err);
      } finally {
        browse.disabled = this.connected || this.installing;
      }
    });
    this.element.querySelector('#btn-connect-sdk')?.addEventListener('click', async () => {
      if (this.installing) return;
      const input = this.element.querySelector('#setting-sdk-input') as HTMLInputElement;
      const button = this.element.querySelector('#btn-connect-sdk') as HTMLButtonElement;
      this.sdkDir = input.value.trim();
      button.disabled = true;
      try {
        await this.callbacks.onDataDirChange(this.dataDir, this.sdkDir || null);
      } finally {
        button.disabled = this.connected;
      }
    });

    const confirm = this.element.querySelector('#runtime-license-confirm') as HTMLInputElement;
    const install = this.element.querySelector('#btn-install-runtime') as HTMLButtonElement;
    const connect = this.element.querySelector('#btn-connect-sdk') as HTMLButtonElement;
    const result = this.element.querySelector('#runtime-install-result') as HTMLElement;
    confirm?.addEventListener('change', () => {
      install.disabled = !confirm.checked || this.connected || this.installing;
    });
    install?.addEventListener('click', async () => {
      if (this.installing || this.connected || !confirm.checked) return;
      const input = this.element.querySelector('#setting-sdk-input') as HTMLInputElement;
      const root = input.value.trim();
      if (!root) {
        result.textContent = 'Enter the existing SDK directory first.';
        return;
      }
      this.installing = true;
      this.sdkDir = root;
      install.disabled = true;
      connect.disabled = true;
      confirm.disabled = true;
      input.readOnly = true;
      result.textContent = 'Downloading official packages. This may take up to 30 minutes.';
      try {
        await this.callbacks.onInstallRuntime(root);
        result.textContent = 'Android runtime installed and connected.';
      } catch (err: unknown) {
        result.textContent = 'Setup failed: ' + ((err as { message?: string }).message || String(err));
      } finally {
        this.installing = false;
        install.disabled = this.connected || !confirm.checked;
        connect.disabled = this.connected;
        confirm.disabled = this.connected;
        input.readOnly = this.connected;
      }
    });

    // Check SDK
    this.element.querySelector('#btn-rescan-sdk')?.addEventListener('click', () => {
      if (!this.installing) this.callbacks.onCheckSdk();
    });

    // Toggle Developer Mode
    const devToggle = this.element.querySelector('#toggle-developer-mode') as HTMLInputElement;
    devToggle?.addEventListener('change', () => {
      this.developerMode = devToggle.checked;
      localStorage.setItem('mes_dev_mode', String(this.developerMode));
      const panel = this.element.querySelector('#developer-tools-panel') as HTMLElement;
      if (panel) panel.style.display = this.developerMode ? 'block' : 'none';
    });

    // Inspect logs
    this.element.querySelector('#btn-dev-inspect-logs')?.addEventListener('click', async () => {
      const box = this.element.querySelector('#dev-logcat-box') as HTMLElement;
      box.style.display = 'block';
      box.textContent = 'Fetching recent logs...';
      try {
        const text = await this.callbacks.onFetchLogs();
        box.textContent = text || 'No logs available.';
      } catch (err) {
        box.textContent = `Log fetch failed: ${String(err)}`;
      }
    });
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

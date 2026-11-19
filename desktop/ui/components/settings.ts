import { HostInfo, SdkInfo, NetworkReport, SetupStatus, QaReport } from '../types.js';
import { ManagedSetupFlow } from '../managed_setup_flow.js';

export interface SettingsCallbacks {
  onRunQa: () => Promise<QaReport>;
  onManagedStart: () => Promise<string>;
  onManagedStatus: () => Promise<SetupStatus>;
  onManagedAnswer: (yes: boolean) => Promise<void>;
  onManagedCancel: () => Promise<void>;
  onManagedConnect: (sdkRoot: string) => Promise<void>;
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
  private installMessage = '';
  private managedFlow: ManagedSetupFlow;
  private qaRunning = false;
  private qaReport = '';
  private qaEvidence = '';

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
    this.managedFlow = new ManagedSetupFlow(callbacks, () => {
      const wasInstalling = this.installing;
      this.installing = this.managedFlow.active;
      if (wasInstalling !== this.installing) this.render();
      else this.paintManagedSetup();
    });
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

      ${this.connected && this.dataDir.endsWith('com.nexonic.multiemulatorstudio.qa') ? `<div class="settings-card">
        <h3 class="settings-card-title">Native runtime self-test</h3>
        <p class="form-helper-text">Boot two disposable Android devices, check Google Play and YouTube, capture screens, and verify independent shutdown. Close any other running emulators before starting. May take several minutes.</p>
        <button class="nav-item" id="qa-run" ${this.qaRunning || this.installing ? 'disabled' : ''}>${this.qaRunning ? 'Running native checks…' : 'Run two-device test'}</button>
        <pre id="qa-report" style="white-space:pre-wrap;max-height:260px;overflow:auto" role="status"></pre>
        <div id="qa-evidence-panel" hidden>
          <label class="form-helper-text" for="qa-evidence">Runtime report (JSON, for troubleshooting; not a release attestation)</label>
          <textarea id="qa-evidence" readonly rows="6" class="form-text-input" style="width:100%;user-select:text;"></textarea>
          <button class="nav-item" id="qa-copy">Copy report</button>
          <span id="qa-copy-status" role="status" class="form-helper-text"></span>
        </div>
      </div>` : ''}

      ${!this.connected ? `<div class="settings-card">
        <h3 class="settings-card-title">Quick setup — Android runtime</h3>
        <p class="form-helper-text">No Android Studio or Java installation required. Download official Android tools, a private Java runtime and Android 14 Google Play image once. Internet and at least 12 GB free space required.</p>
        <p class="form-helper-text">Review Google's Android SDK terms at developer.android.com/studio/terms. The package installer will show any additional required license prompts below.</p>
        <label><input id="managed-consent" type="checkbox" ${this.installing ? 'disabled' : ''}> I have reviewed and agree to the Android SDK terms for permitted use.</label>
        <div><button class="nav-item" id="managed-start" disabled>Set up Android automatically</button></div>
        <p id="managed-result" role="status" class="form-helper-text"></p>
        <pre id="managed-output" hidden tabindex="0" style="max-height:260px;overflow:auto;white-space:pre-wrap;"></pre>
        <div id="managed-actions" hidden><button id="managed-yes" class="nav-item" disabled>Accept displayed license / continue</button><button id="managed-no" class="nav-item" disabled>Decline</button><button id="managed-cancel" class="nav-item">Cancel</button></div>
      </div>` : ''}

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
            Google's SDK terms restrict redistribution. The automatic setup above downloads directly from official publishers. Advanced users may connect an existing installation instead.
          </p>
          <p style="color: var(--text-secondary);">
            Install the official Android SDK command-line tools and a supported Java runtime first. Open Android Studio's SDK Manager, install Android Emulator, Android SDK Platform-Tools, and an Android system image matching your computer's CPU (ARM64 on Apple Silicon or x86_64 on supported Intel/AMD PCs). Review the license terms personally. If using command-line tools, review the licenses with:
          </p>
          <pre style="background: var(--bg-app); padding: 8px 12px; border-radius: 4px; border: 1px solid var(--border-subtle); font-family: var(--font-mono); margin-top: 6px; font-size: 11px;">sdkmanager --licenses</pre>
          <p style="color: var(--text-secondary);">After personally accepting the package licenses, install the Android runtime or, if already connected, download only the official Android 14 Google Play image for your CPU. Existing devices and emulator tools are not replaced.</p>
          <label style="display:block; margin-top:12px;">
            <input type="checkbox" id="runtime-license-confirm" ${this.installing ? 'disabled' : ''} />
            I have reviewed and accepted the required SDK licenses using the official SDK Manager.
          </label>
          <button class="nav-item" id="btn-install-runtime" disabled style="margin-top:8px;">
            ${this.installing ? 'Downloading official packages…' : this.connected ? 'Install Google Play image' : 'Install Android runtime'}
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
    const managedStart = this.element.querySelector<HTMLButtonElement>('#managed-start');
    const qaReport = this.element.querySelector('#qa-report');
    if (qaReport) qaReport.textContent = this.qaReport;
    const evidencePanel = this.element.querySelector<HTMLElement>('#qa-evidence-panel');
    const evidence = this.element.querySelector<HTMLTextAreaElement>('#qa-evidence');
    if (evidencePanel && evidence) { evidencePanel.hidden = !this.qaEvidence; evidence.value = this.qaEvidence; }
    this.element.querySelector('#qa-copy')?.addEventListener('click', async () => {
      if (!evidence || !this.qaEvidence) return;
      const status = this.element.querySelector('#qa-copy-status');
      try { await navigator.clipboard.writeText(this.qaEvidence); if (status) status.textContent = 'Copied'; }
      catch { evidence.focus(); evidence.select(); if (status) status.textContent = 'Report selected; use your keyboard copy shortcut.'; }
    });
    this.element.querySelector('#qa-run')?.addEventListener('click', async () => {
      if (this.qaRunning || this.installing) return;
      if (!window.confirm('Start two temporary QA devices? Close other emulators first. The test will remove only the devices it creates.')) return;
      this.qaRunning = true;
      this.qaEvidence = '';
      this.qaReport = 'Testing native runtime; this may take several minutes…';
      this.render();
      try {
        const result = await this.callbacks.onRunQa();
        this.qaEvidence = JSON.stringify(result, null, 2);
        this.qaReport = [result.passed ? 'PASS' : 'NOT PASSED', ...result.checks, ...(result.failure ? [result.failure] : []), ...result.cleanup_errors].join('\n');
      } catch (error) { this.qaReport = 'Test not completed: ' + ((error as { message?: string }).message || String(error)); }
      finally { this.qaRunning = false; this.render(); }
    });
    const consent = this.element.querySelector<HTMLInputElement>('#managed-consent');
    consent?.addEventListener('change', () => { if (managedStart) managedStart.disabled = !consent.checked || this.installing; });
    managedStart?.addEventListener('click', async () => {
      if (this.installing || !consent?.checked) return;
      await this.managedFlow.start();
    });
    this.element.querySelector('#managed-yes')?.addEventListener('click', () => void this.managedFlow.answer(true));
    this.element.querySelector('#managed-no')?.addEventListener('click', () => void this.managedFlow.answer(false));
    this.element.querySelector('#managed-cancel')?.addEventListener('click', () => void this.managedFlow.cancel());
    this.paintManagedSetup();
    const install = this.element.querySelector('#btn-install-runtime') as HTMLButtonElement;
    const connect = this.element.querySelector('#btn-connect-sdk') as HTMLButtonElement;
    const result = this.element.querySelector('#runtime-install-result') as HTMLElement;
    result.textContent = this.installMessage;
    confirm?.addEventListener('change', () => {
      install.disabled = !confirm.checked || this.installing;
    });
    install?.addEventListener('click', async () => {
      if (this.installing || !confirm.checked) return;
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
      this.installMessage = 'Downloading official packages. This may take up to 30 minutes.';
      result.textContent = this.installMessage;
      try {
        await this.callbacks.onInstallRuntime(root);
        this.installMessage = 'Official Google Play image installed and ready for new devices.';
      } catch (err: unknown) {
        this.installMessage = 'Setup failed: ' + ((err as { message?: string }).message || String(err));
      } finally {
        this.installing = false;
        this.render();
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

  private paintManagedSetup(): void {
    const state = this.managedFlow.snapshot;
    const result = this.element.querySelector('#managed-result');
    if (result) result.textContent = state.message;
    const output = this.element.querySelector<HTMLPreElement>('#managed-output');
    if (output) {
      output.hidden = !state.output && state.phase !== 'installing';
      if (output.textContent !== state.output) {
        const atBottom = output.scrollHeight - output.scrollTop - output.clientHeight < 30;
        output.textContent = state.output;
        if (atBottom || state.awaitingAnswer) output.scrollTop = output.scrollHeight;
      }
    }
    const actions = this.element.querySelector<HTMLElement>('#managed-actions');
    if (actions) actions.hidden = state.phase !== 'installing';
    for (const id of ['#managed-yes', '#managed-no']) {
      const button = this.element.querySelector<HTMLButtonElement>(id);
      if (button) button.disabled = !state.awaitingAnswer || state.actionPending;
    }
    const cancel = this.element.querySelector<HTMLButtonElement>('#managed-cancel');
    if (cancel) cancel.disabled = state.actionPending;
  }
}

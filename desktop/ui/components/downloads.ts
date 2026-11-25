import { SdkInfo, RuntimePreflight } from '../types.js';
import { Icons } from '../icons.js';

export interface DownloadsCallbacks {
  onCheckSdk: () => Promise<void>;
  onInstallRuntime: () => Promise<void>;
  onManagedSetup: () => Promise<void>;
}

export class DownloadsComponent {
  private element: HTMLElement;
  private sdk: SdkInfo | null;
  private preflight: RuntimePreflight;
  private imageCount: number;
  private callbacks: DownloadsCallbacks;
  private isChecking = false;

  constructor(
    sdk: SdkInfo | null,
    preflight: RuntimePreflight,
    imageCount: number,
    callbacks: DownloadsCallbacks
  ) {
    this.sdk = sdk;
    this.preflight = preflight;
    this.imageCount = imageCount;
    this.callbacks = callbacks;
    this.element = document.createElement('div');
    this.element.className = 'setup-downloads-view';
    this.render();
  }

  getElement(): HTMLElement {
    return this.element;
  }

  updateData(sdk: SdkInfo | null, preflight: RuntimePreflight, imageCount: number): void {
    this.sdk = sdk;
    this.preflight = preflight;
    this.imageCount = imageCount;
    this.render();
  }

  private render(): void {
    const hasCmdline = !!this.sdk?.sdkmanager;
    const hasEmulator = !!this.sdk?.emulator;
    const hasAdb = !!this.sdk?.adb;
    const isReady = this.preflight.ready && hasEmulator && this.imageCount > 0;

    this.element.innerHTML = `
      <section class="workspace-overview" aria-label="Setup & Downloads Overview">
        <div class="workspace-intro">
          <span class="workspace-kicker">COMPONENTS & IMAGES</span>
          <h1>Setup & Downloads</h1>
          <p>Install required Android SDK platform components and official system images.</p>
        </div>
      </section>

      <div class="setup-downloads-container">
        <!-- Checklist Card matching master datasheet -->
        <div class="setup-checklist-card">
          <div class="setup-checklist-header">
            <h3>Android SDK Components</h3>
            <button class="btn-secondary-action" id="btn-sdk-recheck" ${this.isChecking ? 'disabled' : ''}>
              ${Icons.rotate}
              <span>${this.isChecking ? 'Verifying...' : 'Check Status'}</span>
            </button>
          </div>

          <div class="checklist-items">
            <!-- Item 1: Command-line Tools -->
            <div class="checklist-item">
              <div class="checklist-item-left">
                <span class="checklist-icon ${hasCmdline ? 'installed' : 'missing'}">
                  ${hasCmdline ? Icons.check : Icons.alert}
                </span>
                <div class="checklist-item-text">
                  <strong>Android SDK Command-line Tools</strong>
                  <span class="checklist-meta">cmdline-tools / sdkmanager</span>
                </div>
              </div>
              <span class="badge-status ${hasCmdline ? 'installed' : 'missing'}">
                ${hasCmdline ? 'Installed' : 'Missing'}
              </span>
            </div>

            <!-- Item 2: Android Emulator -->
            <div class="checklist-item">
              <div class="checklist-item-left">
                <span class="checklist-icon ${hasEmulator ? 'installed' : 'missing'}">
                  ${hasEmulator ? Icons.check : Icons.alert}
                </span>
                <div class="checklist-item-text">
                  <strong>Android Emulator</strong>
                  <span class="checklist-meta">QEMU virtualization runtime</span>
                </div>
              </div>
              <span class="badge-status ${hasEmulator ? 'installed' : 'missing'}">
                ${hasEmulator ? 'Installed' : 'Missing'}
              </span>
            </div>

            <!-- Item 3: Platform Tools (ADB) -->
            <div class="checklist-item">
              <div class="checklist-item-left">
                <span class="checklist-icon ${hasAdb ? 'installed' : 'missing'}">
                  ${hasAdb ? Icons.check : Icons.alert}
                </span>
                <div class="checklist-item-text">
                  <strong>Platform Tools (ADB)</strong>
                  <span class="checklist-meta">Android Debug Bridge daemon & CLI</span>
                </div>
              </div>
              <span class="badge-status ${hasAdb ? 'installed' : 'missing'}">
                ${hasAdb ? 'Installed' : 'Missing'}
              </span>
            </div>

            <!-- Item 4: System Images -->
            <div class="checklist-item">
              <div class="checklist-item-left">
                <span class="checklist-icon ${this.imageCount > 0 ? 'installed' : 'missing'}">
                  ${this.imageCount > 0 ? Icons.check : Icons.alert}
                </span>
                <div class="checklist-item-text">
                  <strong>System Images</strong>
                  <span class="checklist-meta">Android 14 / 15 with Google APIs</span>
                </div>
              </div>
              <span class="badge-status ${this.imageCount > 0 ? 'installed' : 'missing'}">
                ${this.imageCount > 0 ? `${this.imageCount} available` : 'None Installed'}
              </span>
            </div>
          </div>

          <!-- Environment Readiness Banner -->
          <div class="readiness-banner ${isReady ? 'ready' : 'warning'}">
            <span class="readiness-icon">${isReady ? Icons.check : Icons.alert}</span>
            <div class="readiness-content">
              <strong>${isReady ? 'Your environment is ready!' : 'Environment requires setup'}</strong>
              <p>${isReady ? 'You can now create and run Android virtual devices.' : this.escapeHtml(this.preflight.diagnostic || 'Complete setup to download required images and run virtual devices.')}</p>
            </div>
            ${!isReady ? `<button class="btn-create-primary" id="btn-trigger-managed-setup"><span>Run Guided Setup</span></button>` : ''}
          </div>
        </div>
      </div>
    `;

    this.element.querySelector('#btn-sdk-recheck')?.addEventListener('click', async () => {
      this.isChecking = true;
      this.render();
      try {
        await this.callbacks.onCheckSdk();
      } finally {
        this.isChecking = false;
        this.render();
      }
    });

    this.element.querySelector('#btn-trigger-managed-setup')?.addEventListener('click', () => {
      void this.callbacks.onManagedSetup();
    });
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

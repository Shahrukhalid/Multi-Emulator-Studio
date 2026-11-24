import { getApiClient, IApiClient } from './api.js';
import {
  Device,
  Status,
  HostInfo,
  SdkInfo,
  NetworkReport,
  DeviceSpec,
  DevicePreset,
  RuntimePreflight,
  isGooglePlayImage
} from './types.js';
import { HeaderComponent, MainNavTab } from './components/header.js';
import { WelcomeComponent } from './components/welcome.js';
import { DeviceListComponent } from './components/device_list.js';
import { TemplatesComponent } from './components/templates.js';
import { SettingsComponent } from './components/settings.js';
import { WizardComponent } from './components/wizard.js';
import { PhoneViewer } from './components/phone_viewer.js';
import { ApkModalComponent } from './components/apk_modal.js';
import { DeleteModalComponent } from './components/delete_modal.js';
import { LocationModalComponent } from './components/location_modal.js';
import { DownloadsComponent } from './components/downloads.js';
import { TestMatrixComponent } from './components/test_matrix.js';
import { DeviceDetailsComponent } from './components/device_details.js';
import { HealthHubComponent } from './components/health_hub.js';
import { toast } from './toast.js';

export class App {
  private api: IApiClient;
  private rootElement: HTMLElement;

  private header: HeaderComponent;
  private welcome: WelcomeComponent;
  private deviceList: DeviceListComponent;
  private templates: TemplatesComponent;
  private downloads: DownloadsComponent;
  private testMatrix: TestMatrixComponent;
  private healthHub: HealthHubComponent;
  private settings: SettingsComponent;

  private activeTab: MainNavTab = 'devices';
  private selectedDetailDevice: Device | null = null;
  private deviceDetails: DeviceDetailsComponent | null = null;

  private activeModal: HTMLElement | null = null;
  private modalCleanup: (() => void) | null = null;
  private modalKey: ((event: KeyboardEvent) => void) | null = null;
  private pollInterval: number | null = null;
  private phoneDock = document.createElement('section');
  private phones = new Map<string, PhoneViewer>();

  private devices: Device[] = [];
  private statuses: Status[] = [];
  private host: HostInfo | null = null;
  private sdk: SdkInfo | null = null;
  private images: string[] = [];
  private hardwareProfiles: string[] = [];
  private networkReport: NetworkReport | null = null;
  private accelerationText = '';
  private preflight: RuntimePreflight = { ready: false, version: '', acceleration: '', diagnostic: 'Runtime not checked' };
  private dataDir = '';
  private isConnected = false;

  constructor(rootElement: HTMLElement) {
    this.rootElement = rootElement;
    this.api = getApiClient();

    // Theme initialization
    this.applyTheme(localStorage.getItem('mes_theme_mode') || 'system');

    // Header initialization
    this.header = new HeaderComponent({
      activeTab: 'devices',
      isPreview: this.api.isPreview,
      onTabSelect: (tab) => this.switchTab(tab),
      onCreateClick: () => this.openWizard()
    });

    // Welcome initialization
    this.welcome = new WelcomeComponent({
      host: null,
      onSelectAndroid: () => this.openWizard(),
      onSelectIos: () => {
        toast.show('Apple iOS Simulator requires macOS with Xcode', 'warning');
      }
    });

    // Device list initialization
    this.deviceList = new DeviceListComponent({
      onCreateClick: () => this.openWizard(),
      onStart: (d) => this.handleStart(d),
      onOpen: (d) => this.handleOpen(d),
      onStop: (d) => this.handleStop(d),
      onRestart: (d) => this.handleRestart(d),
      onRename: (d) => this.handleRename(d),
      onDuplicate: (d) => this.handleDuplicate(d),
      onInstallApk: (d) => this.handleInstallApk(d),
      onDelete: (d) => this.handleDeletePrompt(d),
      onDetails: (d) => this.handleShowDetails(d)
    });

    // Templates view initialization
    this.templates = new TemplatesComponent({
      onUseTemplate: (preset) => this.openWizard(preset)
    });

    // Downloads / Setup view initialization
    this.downloads = new DownloadsComponent(
      null,
      this.preflight,
      0,
      {
        onCheckSdk: async () => {
          await this.refreshSdkCatalog();
          toast.show('SDK components verified', 'success');
        },
        onInstallRuntime: async () => {
          await this.api.installGooglePlay();
          await this.refreshSdkCatalog();
          toast.show('Google Play System Image installed', 'success');
        },
        onManagedSetup: async () => {
          this.switchTab('settings');
          await this.api.beginManagedSetup();
        }
      }
    );

    // Test Matrix view initialization
    this.testMatrix = new TestMatrixComponent({
      onRunMatrix: async () => {
        try {
          this.testMatrix.setRunning(true);
          toast.show('Starting parallel test matrix execution across devices (100% Free)...', 'info');
          const report = await this.api.runMatrixTest();
          this.testMatrix.applyReport(report);
          toast.show(
            `Matrix run complete: ${report.passed_devices}/${report.total_devices} devices passed in ${report.total_duration_ms}ms`,
            report.failed_devices === 0 ? 'success' : 'warning'
          );
        } catch (e: any) {
          this.testMatrix.setRunning(false);
          toast.show(`Matrix run failed: ${e?.message || e}`, 'error');
        }
      },
      onSelectStep: (suite, step) => {
        toast.show(`Selected test step: ${suite} > ${step}`, 'info');
      },
      onBroadcastApk: async () => {
        try {
          const apkPath = await this.api.pickApk();
          if (!apkPath) return;
          const fileName = apkPath.split(/[/\\]/).pop() || 'app.apk';
          toast.show(`Broadcasting ${fileName} to active fleet...`, 'info');
          const report = await this.api.broadcastInstall(undefined, apkPath);
          this.testMatrix.applyBroadcastReport(report);
          toast.show(
            `Broadcast install: ${report.successful_devices}/${report.total_devices} devices updated in ${report.total_duration_ms}ms`,
            report.failed_devices === 0 ? 'success' : 'warning'
          );
        } catch (e: any) {
          toast.show(`Broadcast install failed: ${e?.message || e}`, 'error');
        }
      },
      onCaptureSynchronized: async () => {
        try {
          toast.show('Capturing synchronized layout comparison frames...', 'info');
          const report = await this.api.synchronizedScreenshots();
          this.testMatrix.applySynchronizedScreenshots(report);
          toast.show(`Synchronized layout comparison updated for ${report.frames.length} devices`, 'success');
        } catch (e: any) {
          toast.show(`Capture failed: ${e?.message || e}`, 'error');
        }
      },
      onExportReport: async () => {
        try {
          toast.show('Generating standalone HTML test report...', 'info');
          const report = await this.api.runMatrixTest();
          const html = await this.api.generateReportHtml(report);
          const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `test-matrix-report-${Date.now()}.html`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          toast.show('Stand-alone HTML report exported and downloaded!', 'success');
        } catch (e: any) {
          toast.show(`Export report failed: ${e?.message || e}`, 'error');
        }
      },
      onRunMacro: async () => {
        try {
          const macros = await this.api.listMacros();
          if (macros.length === 0) {
            toast.show('No macros available.', 'warning');
            return;
          }
          const options = macros.map((m, i) => `${i + 1}. ${m.name} (${m.steps.length} steps)`).join('\n');
          const choice = window.prompt(`Select Macro to Execute Across Active Device Fleet:\n\n${options}\n\nEnter number (1-${macros.length}):`, '1');
          if (!choice) return;
          const idx = parseInt(choice.trim(), 10) - 1;
          if (isNaN(idx) || idx < 0 || idx >= macros.length) {
            toast.show('Invalid macro selection.', 'error');
            return;
          }
          const selected = macros[idx];
          toast.show(`Executing "${selected.name}" across device fleet in parallel...`, 'info');
          const results = await this.api.runMacroFleet(selected.id);
          const passed = results.filter(r => r.status === 'passed').length;
          toast.show(`Fleet Macro Execution: ${passed}/${results.length} devices passed successfully!`, passed === results.length ? 'success' : 'warning');
        } catch (e: any) {
          toast.show(`Fleet macro run failed: ${e?.message || e}`, 'error');
        }
      }
    });

    // Health Hub initialization
    this.healthHub = new HealthHubComponent(this.api);

    // Settings view initialization
    this.settings = new SettingsComponent(
      null,
      null,
      '',
      0,
      null,
      '',
      '',
      {
        onManagedStart: () => this.api.beginManagedSetup(),
        onRunQa: () => this.api.qaRuntimeCheck(),
        onManagedStatus: () => this.api.managedSetupStatus(),
        onManagedAnswer: (yes) => this.api.managedSetupAnswer(yes),
        onManagedCancel: () => this.api.cancelManagedSetup(),
        onManagedConnect: async (sdkRoot) => {
          await this.api.connect(this.dataDir, sdkRoot);
          this.isConnected = true;
          await this.refreshAll();
          this.startHealthPolling();
          this.switchTab(this.preflight.ready ? 'devices' : 'settings');
        },
        onThemeChange: (theme) => this.applyTheme(theme),
        onDataDirChange: async (path, sdkRoot) => {
          try {
            await this.api.connect(path, sdkRoot);
            this.dataDir = path;
            this.isConnected = true;
            toast.show('Android runtime connected', 'success');
            await this.refreshAll();
            this.startHealthPolling();
          } catch (err: unknown) {
            toast.show(`Connection failed: ${(err as { message?: string }).message || String(err)}`, 'error');
          }
        },
        onInstallRuntime: async (sdkRoot) => {
          if (this.isConnected) {
            await this.api.installGooglePlay();
            await this.refreshSdkCatalog();
            toast.show('Official Google Play image installed', 'success');
            return;
          }
          await this.api.installRuntime(sdkRoot);
          toast.show('Official Android runtime installed', 'success');
          await this.api.connect(this.dataDir, sdkRoot);
          this.isConnected = true;
          await this.refreshAll();
          this.startHealthPolling();
        },
        onPickSdkDirectory: () => this.api.pickSdkDirectory(),
        onCheckSdk: async () => {
          if (!this.isConnected && !this.api.isPreview) {
            toast.show('Connect your Android SDK before checking installed tools.', 'warning');
            return;
          }
          await this.refreshSdkCatalog();
          const ready = this.preflight.ready && this.images.some(isGooglePlayImage) && !!this.hardwareProfiles.length;
          toast.show(
            ready ? 'Runtime preflight passed; actual boot still unverified' : 'Runtime setup requires attention',
            ready ? 'success' : 'warning'
          );
        },
        onFetchLogs: async () => {
          if (this.devices.length > 0) {
            return this.api.getLogs(this.devices[0].id);
          }
          return 'No active devices to fetch logcat output.';
        }
      }
    );

    this.render();
  }

  async start(): Promise<void> {
    try {
      this.dataDir = await this.api.getDefaultDataDir().catch(() => '');

      if (this.api.isTauri && this.dataDir) {
        try {
          await this.api.connect(this.dataDir);
          this.isConnected = true;
        } catch (err: unknown) {
          toast.show(`Android setup required: ${(err as { message?: string }).message || String(err)}`, 'warning');
          this.settings.setConnection(this.dataDir, false);
          this.switchTab('settings');
          return;
        }
      }

      await this.refreshAll();
      this.startHealthPolling();
    } catch (err) {
      console.error('App start failure:', err);
      toast.show('Failed to connect to emulator supervisor', 'error');
    }
  }

  private applyTheme(mode: string): void {
    if (mode === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else if (mode === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    }
  }

  private async refreshAll(): Promise<void> {
    try {
      this.host = await this.api.getHost().catch(() => null);
      this.sdk = await this.api.getSdk().catch(() => null);
      this.images = await this.api.getImages().catch(() => []);
      this.hardwareProfiles = await this.api.getHardwareProfiles().catch(() => []);
      await this.refreshRuntimePreflight();
      this.networkReport = await this.api.getNetworkReport().catch(() => null);

      await this.refreshDevices();

      this.downloads.updateData(this.sdk, this.preflight, this.images.length);
      this.settings.updateData(
        this.host,
        this.sdk,
        this.accelerationText,
        this.images.length,
        this.networkReport,
        this.preflight.version,
        this.preflight.diagnostic
      );
      this.settings.setConnection(this.dataDir, this.isConnected);
    } catch (err) {
      console.error('Catalog refresh error:', err);
    }
  }

  private async refreshDevices(): Promise<void> {
    try {
      this.devices = await this.api.listDevices();
      this.statuses = await this.api.health().catch(() => []);
      this.deviceList.setData(this.devices, this.statuses);
      if (this.selectedDetailDevice) {
        const found = this.devices.find((d) => d.id === this.selectedDetailDevice?.id);
        if (found) {
          const status = this.statuses.find((s) => s.id === found.id) ?? null;
          this.deviceDetails?.updateData(found, status);
        }
      }
      this.switchTab(this.activeTab);
    } catch (err: unknown) {
      const msg = (err as { message?: string }).message || String(err);
      toast.show(`Failed to fetch devices: ${msg}`, 'error');
    }
  }

  private async refreshSdkCatalog(): Promise<void> {
    this.sdk = await this.api.getSdk().catch(() => null);
    this.images = await this.api.getImages().catch(() => []);
    this.hardwareProfiles = await this.api.getHardwareProfiles().catch(() => []);
    await this.refreshRuntimePreflight();
    this.downloads.updateData(this.sdk, this.preflight, this.images.length);
    this.settings.updateData(
      this.host,
      this.sdk,
      this.accelerationText,
      this.images.length,
      this.networkReport,
      this.preflight.version,
      this.preflight.diagnostic
    );
  }

  private async refreshRuntimePreflight(): Promise<void> {
    try {
      this.preflight = await this.api.dispatch<RuntimePreflight>({ action: 'runtime_preflight' });
    } catch (err: unknown) {
      this.preflight = {
        ready: false,
        version: '',
        acceleration: '',
        diagnostic: (err as { message?: string }).message || String(err)
      };
    }
    this.accelerationText = this.preflight.acceleration;
  }

  private startHealthPolling(): void {
    if (this.pollInterval) clearInterval(this.pollInterval);
    this.pollInterval = window.setInterval(async () => {
      try {
        const statuses = await this.api.health();
        this.statuses = statuses;
        for (const s of statuses) {
          this.deviceList.updateSingleStatus(s);
          if (this.selectedDetailDevice && s.id === this.selectedDetailDevice.id) {
            this.deviceDetails?.updateData(this.selectedDetailDevice, s);
          }
        }
      } catch {
        // Silent health polling failure
      }
    }, 5000);
  }

  private switchTab(tab: MainNavTab): void {
    this.activeTab = tab;
    this.header.setTab(tab);

    const container = this.rootElement.querySelector('#content-slot');
    if (!container) return;

    container.innerHTML = '';

    if (tab === 'devices') {
      if (this.selectedDetailDevice && this.deviceDetails) {
        container.appendChild(this.deviceDetails.getElement());
      } else if (this.devices.length === 0) {
        container.appendChild(this.welcome.getElement());
      } else {
        container.appendChild(this.deviceList.getElement());
      }
    } else if (tab === 'templates') {
      container.appendChild(this.templates.getElement());
    } else if (tab === 'downloads') {
      container.appendChild(this.downloads.getElement());
    } else if (tab === 'matrix') {
      container.appendChild(this.testMatrix.getElement());
    } else if (tab === 'health') {
      container.appendChild(this.healthHub.getElement());
      void this.healthHub.refresh();
    } else if (tab === 'settings') {
      container.appendChild(this.settings.getElement());
    }
  }

  private handleShowDetails(device: Device): void {
    this.selectedDetailDevice = device;
    const status = this.statuses.find((s) => s.id === device.id) ?? null;
    this.deviceDetails = new DeviceDetailsComponent(device, status, {
      onBack: () => {
        this.selectedDetailDevice = null;
        this.deviceDetails = null;
        this.switchTab('devices');
      },
      onStart: (d) => this.handleStart(d),
      onOpen: (d) => this.handleOpen(d),
      onStop: (d) => this.handleStop(d),
      onRestart: (d) => this.handleRestart(d),
      onDelete: (d) => this.handleDeletePrompt(d),
      onInstallApk: (d) => this.handleInstallApk(d),
      onScanDiagnostics: async (d) => {
        try {
          toast.show(`Scanning telemetry & Logcat for ${d.spec.name}...`, 'info');
          const t = await this.api.getTelemetry(d.id);
          this.deviceDetails?.setTelemetry(t);
          toast.show(
            t.crashes.length > 0
              ? `Telemetry updated: ${t.crashes.length} crash(es) detected!`
              : `Telemetry updated: Clean state, 0 crashes detected.`,
            t.crashes.length > 0 ? 'warning' : 'success'
          );
        } catch (e: any) {
          toast.show(`Scan failed: ${e?.message || e}`, 'error');
        }
      },
      onSetNetworkProfile: async (d, profileId) => {
        try {
          await this.api.setNetworkProfile(d.id, profileId);
          toast.show(`Applied network profile: ${profileId.toUpperCase()}`, 'success');
        } catch (e: any) {
          toast.show(`Failed to set network profile: ${e?.message || e}`, 'error');
        }
      }
    });
    this.api.getTelemetry(device.id).then((t) => {
      this.deviceDetails?.setTelemetry(t);
    }).catch(() => {});
    this.switchTab('devices');
  }

  // Action handlers
  private async handleStart(device: Device): Promise<void> {
    this.deviceList.setDeviceBusy(device.id, true);
    toast.show(`Starting ${device.spec.name}...`, 'info');
    try {
      const status = await this.api.startDevice(device.id);
      this.deviceList.updateSingleStatus(status);
      await this.refreshDevices();
      toast.show(`${device.spec.name} is ${status.state}`, status.state === 'ready' ? 'success' : 'warning');
      if (!this.api.isPreview && (status.state === 'starting' || status.state === 'ready')) this.handleOpen(device);
    } catch (err: unknown) {
      const msg = (err as { message?: string }).message || String(err);
      toast.show(`Start failed: ${msg}`, 'error');
      await this.refreshDevices();
    } finally {
      this.deviceList.setDeviceBusy(device.id, false);
    }
  }

  private handleOpen(device: Device): void {
    if (this.api.isPreview) {
      toast.show('Live screen requires the native app', 'warning');
      return;
    }
    const existing = this.phones.get(device.id);
    if (existing) {
      existing.element.scrollIntoView({ block: 'nearest' });
      return;
    }
    if (this.phones.size >= 4) {
      toast.show('Close a phone view before opening another (four visible screens maximum).', 'warning');
      return;
    }
    const viewer = new PhoneViewer(
      this.api,
      device,
      () => {
        viewer.dispose();
        viewer.element.remove();
        this.phones.delete(device.id);
        this.phoneDock.hidden = this.phones.size === 0;
      },
      () => this.handleInstallApk(device),
      () => this.handleOpenLocation(device)
    );
    this.phones.set(device.id, viewer);
    this.phoneDock.appendChild(viewer.element);
    this.phoneDock.hidden = false;
    viewer.begin();
    viewer.element.scrollIntoView({ block: 'nearest' });
  }

  private handleOpenLocation(device: Device): void {
    const modal = new LocationModalComponent(device, {
      onApply: async (lat, lon, tz, proxy) => {
        await this.api.setLocation(device.id, lat, lon, tz);
        if (proxy !== undefined) {
          device.spec.proxy = proxy;
          await this.api.setProxyTarget(device.id, proxy);
        }
        toast.show(`Location & proxy dynamically synchronized (${tz})`, 'success');
      },
      onClose: () => this.closeModal()
    });
    this.openModal(modal.getElement());
  }

  private async handleStop(device: Device): Promise<void> {
    this.deviceList.setDeviceBusy(device.id, true);
    toast.show(`Stopping ${device.spec.name}...`, 'info');
    try {
      await this.api.stopDevice(device.id);
      await this.refreshDevices();
      toast.show(`${device.spec.name} stopped`, 'info');
    } catch (err: unknown) {
      const msg = (err as { message?: string }).message || String(err);
      toast.show(`Stop failed: ${msg}`, 'error');
    } finally {
      this.deviceList.setDeviceBusy(device.id, false);
    }
  }

  private async handleRestart(device: Device): Promise<void> {
    this.deviceList.setDeviceBusy(device.id, true);
    toast.show(`Restarting ${device.spec.name}...`, 'info');
    try {
      const status = await this.api.restartDevice(device.id);
      this.deviceList.updateSingleStatus(status);
      await this.refreshDevices();
      toast.show(`${device.spec.name}: ${status.state}`, status.state === 'ready' ? 'success' : 'info');
    } catch (err: unknown) {
      const msg = (err as { message?: string }).message || String(err);
      toast.show(`Restart failed: ${msg}`, 'error');
      await this.refreshDevices();
    } finally {
      this.deviceList.setDeviceBusy(device.id, false);
    }
  }

  private async handleRename(device: Device): Promise<void> {
    const newName = window.prompt('Enter new name for device:', device.spec.name);
    if (!newName || !newName.trim() || newName.trim() === device.spec.name) return;

    toast.show('Updating device name...', 'info');
    try {
      await this.api.renameDevice(device.id, newName.trim());
      await this.refreshDevices();
      toast.show(`Device renamed to ${newName.trim()}`, 'success');
    } catch (err: unknown) {
      const msg = (err as { message?: string }).message || String(err);
      toast.show(`Rename failed: ${msg}`, 'error');
    }
  }

  private async handleDuplicate(device: Device): Promise<void> {
    const copyName = `${device.spec.name} Copy`;
    toast.show(`Duplicating ${device.spec.name}...`, 'info');
    try {
      const cloned = await this.api.cloneDevice(device.id, copyName);
      await this.refreshDevices();
      toast.show(`Created ${cloned.spec.name}`, 'success');
    } catch (err: unknown) {
      const msg = (err as { message?: string }).message || String(err);
      toast.show(`Duplicate failed: ${msg}`, 'error');
    }
  }

  private handleInstallApk(device: Device): void {
    const status = this.statuses.find((s) => s.id === device.id) ?? null;
    const modal = new ApkModalComponent(device, status, {
      onPick: () => this.api.pickApk(),
      onInstall: async (_d, path) => {
        await this.api.installApk(device.id, path);
        toast.show(`Installed APK on ${device.spec.name}`, 'success');
      },
      onClose: () => this.closeModal()
    });
    this.openModal(modal.getElement());
  }

  private handleDeletePrompt(device: Device): void {
    const modal = new DeleteModalComponent(device, {
      onConfirmDelete: async (_d) => {
        await this.api.deleteDevice(device.id);
        if (this.selectedDetailDevice?.id === device.id) {
          this.selectedDetailDevice = null;
          this.deviceDetails = null;
        }
        await this.refreshDevices();
        toast.show(`Deleted ${device.spec.name}`, 'info');
      },
      onClose: () => this.closeModal()
    });
    this.openModal(modal.getElement());
  }

  private openWizard(initialPreset?: DevicePreset): void {
    const playImages = this.images.filter(isGooglePlayImage);
    if (!this.api.isPreview && (!this.isConnected || !playImages.length || !this.hardwareProfiles.length)) {
      toast.show('Install the Google Play image in Settings before creating a device.', 'warning');
      this.switchTab('settings');
      return;
    }
    if (!this.api.isPreview && !this.preflight.ready) {
      toast.show('Android runtime preflight failed. Check Settings for details.', 'warning');
      this.switchTab('settings');
      return;
    }
    const modal = new WizardComponent(
      playImages,
      this.hardwareProfiles,
      this.host,
      {
        onCreate: async (spec: DeviceSpec, autoLaunch: boolean) => {
          const created = await this.api.createDevice(spec);
          await this.refreshDevices();
          toast.show(`Created ${created.spec.name}`, 'success');

          if (autoLaunch) {
            this.handleStart(created);
          }
        },
        onClose: () => this.closeModal()
      },
      initialPreset
    );
    this.openModal(modal.getElement());
  }

  private openModal(element: HTMLElement, cleanup?: () => void): void {
    this.closeModal();
    this.activeModal = element;
    this.modalCleanup = cleanup || null;
    document.body.appendChild(element);

    this.modalKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.closeModal();
      }
    };
    window.addEventListener('keydown', this.modalKey);
  }

  private closeModal(): void {
    if (this.modalKey) window.removeEventListener('keydown', this.modalKey);
    this.modalKey = null;
    this.modalCleanup?.();
    this.modalCleanup = null;
    if (this.activeModal) {
      this.activeModal.remove();
      this.activeModal = null;
    }
  }

  private render(): void {
    this.rootElement.innerHTML = '';
    this.rootElement.appendChild(this.header.getElement());

    const contentContainer = document.createElement('main');
    contentContainer.className = 'main-content';
    contentContainer.id = 'content-slot';

    this.rootElement.appendChild(contentContainer);
    this.phoneDock.className = 'phone-dock';
    this.phoneDock.setAttribute('aria-label', 'Open Android devices');
    this.phoneDock.hidden = true;
    this.rootElement.appendChild(this.phoneDock);
    this.switchTab('devices');
  }
}

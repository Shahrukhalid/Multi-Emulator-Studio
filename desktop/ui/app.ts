import { getApiClient, IApiClient } from './api.js';
import { Device, Status, HostInfo, SdkInfo, NetworkReport, DeviceSpec, DevicePreset } from './types.js';
import { HeaderComponent, MainNavTab } from './components/header.js';
import { WelcomeComponent } from './components/welcome.js';
import { DeviceListComponent } from './components/device_list.js';
import { TemplatesComponent } from './components/templates.js';
import { SettingsComponent } from './components/settings.js';
import { WizardComponent } from './components/wizard.js';
import { ApkModalComponent } from './components/apk_modal.js';
import { DeleteModalComponent } from './components/delete_modal.js';
import { toast } from './toast.js';

export class App {
  private api: IApiClient;
  private rootElement: HTMLElement;

  private header: HeaderComponent;
  private welcome: WelcomeComponent;
  private deviceList: DeviceListComponent;
  private templates: TemplatesComponent;
  private settings: SettingsComponent;

  private activeTab: MainNavTab = 'devices';
  private activeModal: HTMLElement | null = null;
  private pollInterval: number | null = null;

  private devices: Device[] = [];
  private statuses: Status[] = [];
  private host: HostInfo | null = null;
  private sdk: SdkInfo | null = null;
  private images: string[] = [];
  private hardwareProfiles: string[] = [];
  private networkReport: NetworkReport | null = null;
  private accelerationText = '';
  private dataDir = '';
  private sdkDir = '';
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
      onDelete: (d) => this.handleDeletePrompt(d)
    });

    // Templates view initialization
    this.templates = new TemplatesComponent({
      onUseTemplate: (preset) => this.openWizard(preset)
    });

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
          await this.api.installRuntime(sdkRoot);
          toast.show('Official Android runtime installed', 'success');
          await this.api.connect(this.dataDir, sdkRoot);
          this.isConnected = true;
          await this.refreshAll();
          this.startHealthPolling();
        },
        onCheckSdk: async () => {
          if (!this.isConnected && !this.api.isPreview) {
            toast.show('Connect your Android SDK before checking installed tools.', 'warning');
            return;
          }
          await this.refreshSdkCatalog();
          toast.show(this.sdk && this.images.length && this.hardwareProfiles.length ? 'SDK and compatible images detected' : 'SDK or compatible images still missing', this.sdk && this.images.length && this.hardwareProfiles.length ? 'success' : 'warning');
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
      this.accelerationText = await this.api.getAcceleration().catch(() => '');
      this.networkReport = await this.api.getNetworkReport().catch(() => null);

      await this.refreshDevices();

      this.settings.updateData(
        this.host,
        this.sdk,
        this.accelerationText,
        this.images.length,
        this.networkReport
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
    this.accelerationText = await this.api.getAcceleration().catch(() => '');
    this.settings.updateData(
      this.host,
      this.sdk,
      this.accelerationText,
      this.images.length,
      this.networkReport
    );
  }

  private startHealthPolling(): void {
    if (this.pollInterval) clearInterval(this.pollInterval);
    this.pollInterval = window.setInterval(async () => {
      try {
        const statuses = await this.api.health();
        this.statuses = statuses;
        for (const s of statuses) {
          this.deviceList.updateSingleStatus(s);
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
      if (this.devices.length === 0) {
        container.appendChild(this.welcome.getElement());
      } else {
        container.appendChild(this.deviceList.getElement());
      }
    } else if (tab === 'templates') {
      container.appendChild(this.templates.getElement());
    } else if (tab === 'settings') {
      container.appendChild(this.settings.getElement());
    }
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
    } catch (err: unknown) {
      const msg = (err as { message?: string }).message || String(err);
      toast.show(`Start failed: ${msg}`, 'error');
      await this.refreshDevices();
    } finally {
      this.deviceList.setDeviceBusy(device.id, false);
    }
  }

  private handleOpen(device: Device): void {
    toast.show(`${device.spec.name} runs in a separate Android Emulator window. Select it from your taskbar or Dock.`, 'info');
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
        await this.refreshDevices();
        toast.show(`Deleted ${device.spec.name}`, 'info');
      },
      onClose: () => this.closeModal()
    });
    this.openModal(modal.getElement());
  }

  private openWizard(initialPreset?: DevicePreset): void {
    if (!this.api.isPreview && (!this.isConnected || !this.images.length || !this.hardwareProfiles.length)) {
      toast.show('Connect the official Android SDK and install a compatible system image before creating a device.', 'warning');
      this.switchTab('settings');
      return;
    }
    const modal = new WizardComponent(
      this.images,
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

  private openModal(element: HTMLElement): void {
    this.closeModal();
    this.activeModal = element;
    document.body.appendChild(element);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.closeModal();
        window.removeEventListener('keydown', onKey);
      }
    };
    window.addEventListener('keydown', onKey);
  }

  private closeModal(): void {
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
    this.switchTab('devices');
  }
}

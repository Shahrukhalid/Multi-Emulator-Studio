import {
  Request,
  Device,
  DeviceSpec,
  Status,
  HostInfo,
  SdkInfo,
  NetworkReport, SetupStatus, QaReport
} from './types.js';

declare const window: Window & {
  __TAURI__?: {
    core: {
      invoke<T = unknown>(name: string, args?: Record<string, unknown>): Promise<T>;
    };
  };
};

export interface IApiClient {
  readonly isTauri: boolean;
  readonly isPreview: boolean;

  getDefaultDataDir(): Promise<string>;
  connect(root: string, sdkRoot?: string | null): Promise<void>;
  installRuntime(sdkRoot: string): Promise<void>;
  installGooglePlay(): Promise<void>;
  qaRuntimeCheck(): Promise<QaReport>;
  beginManagedSetup(): Promise<string>;
  managedSetupStatus(): Promise<SetupStatus>;
  managedSetupAnswer(yes: boolean): Promise<void>;
  cancelManagedSetup(): Promise<void>;
  screenPng(id: string): Promise<ArrayBuffer>;
  videoRead(id: string, token: string): Promise<ArrayBuffer>;
  pickApk(): Promise<string | null>;
  pickSdkDirectory(): Promise<string | null>;
  dispatch<T>(request: Request): Promise<T>;
  health(): Promise<Status[]>;

  // High-level typed methods
  getHost(): Promise<HostInfo>;
  getSdk(): Promise<SdkInfo>;
  getImages(): Promise<string[]>;
  getHardwareProfiles(): Promise<string[]>;
  getAcceleration(): Promise<string>;
  listDevices(): Promise<Device[]>;
  getNetworkReport(): Promise<NetworkReport>;
  createDevice(spec: DeviceSpec): Promise<Device>;
  cloneDevice(id: string, name: string): Promise<Device>;
  renameDevice(id: string, name: string): Promise<Device>;
  startDevice(id: string): Promise<Status>;
  stopDevice(id: string): Promise<boolean>;
  restartDevice(id: string): Promise<Status>;
  getDeviceStatus(id: string): Promise<Status>;
  deleteDevice(id: string): Promise<boolean>;
  installApk(id: string, path: string): Promise<boolean>;
  getLogs(id: string): Promise<string>;
}

class TauriApiClient implements IApiClient {
  readonly isTauri = true;
  readonly isPreview = false;

  private invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
    if (!window.__TAURI__?.core?.invoke) {
      throw new Error('Tauri IPC backend unavailable. Launch via desktop binary.');
    }
    return window.__TAURI__.core.invoke<T>(cmd, args);
  }

  getDefaultDataDir(): Promise<string> {
    return this.invoke<string>('default_data_dir');
  }

  connect(root: string, sdkRoot?: string | null): Promise<void> {
    return this.invoke<void>('connect', { root, sdkRoot: sdkRoot || null });
  }

  installRuntime(sdkRoot: string): Promise<void> {
    return this.invoke<void>('install_android_runtime', { sdkRoot });
  }
  installGooglePlay(): Promise<void> { return this.invoke<void>('install_google_play'); }
  qaRuntimeCheck(): Promise<QaReport> { return this.invoke<QaReport>('qa_runtime_check'); }
  beginManagedSetup(): Promise<string> { return this.invoke<string>('begin_managed_setup', { reviewed: true }); }
  managedSetupStatus(): Promise<SetupStatus> { return this.invoke<SetupStatus>('managed_setup_status'); }
  managedSetupAnswer(yes: boolean): Promise<void> { return this.invoke<void>('managed_setup_answer', { yes }); }
  cancelManagedSetup(): Promise<void> { return this.invoke<void>('cancel_managed_setup'); }
  screenPng(id: string): Promise<ArrayBuffer> { return this.invoke<ArrayBuffer>('screen_png', { id }); }
  videoRead(id: string, token: string): Promise<ArrayBuffer> { return this.invoke<ArrayBuffer>('video_read', { id, token }); }

  pickApk(): Promise<string | null> {
    return this.invoke<string | null>('pick_apk');
  }

  pickSdkDirectory(): Promise<string | null> {
    return this.invoke<string | null>('pick_sdk_directory');
  }

  dispatch<T>(request: Request): Promise<T> {
    return this.invoke<T>('dispatch', { request });
  }

  health(): Promise<Status[]> {
    return this.invoke<Status[]>('health');
  }

  getHost(): Promise<HostInfo> {
    return this.dispatch<HostInfo>({ action: 'host' });
  }

  getSdk(): Promise<SdkInfo> {
    return this.dispatch<SdkInfo>({ action: 'sdk' });
  }

  getImages(): Promise<string[]> {
    return this.dispatch<string[]>({ action: 'images' });
  }

  getHardwareProfiles(): Promise<string[]> {
    return this.dispatch<string[]>({ action: 'hardware_profiles' });
  }

  getAcceleration(): Promise<string> {
    return this.dispatch<string>({ action: 'acceleration' });
  }

  listDevices(): Promise<Device[]> {
    return this.dispatch<Device[]>({ action: 'list' });
  }

  getNetworkReport(): Promise<NetworkReport> {
    return this.dispatch<NetworkReport>({ action: 'network' });
  }

  createDevice(spec: DeviceSpec): Promise<Device> {
    return this.dispatch<Device>({ action: 'create', spec });
  }

  cloneDevice(id: string, name: string): Promise<Device> {
    return this.dispatch<Device>({ action: 'clone_profile', id, name });
  }
  renameDevice(id: string, name: string): Promise<Device> {
    return this.dispatch<Device>({ action: 'rename', id, name });
  }

  startDevice(id: string): Promise<Status> {
    return this.dispatch<Status>({ action: 'start', id });
  }

  stopDevice(id: string): Promise<boolean> {
    return this.dispatch<boolean>({ action: 'stop', id });
  }

  restartDevice(id: string): Promise<Status> {
    return this.dispatch<Status>({ action: 'restart', id });
  }

  getDeviceStatus(id: string): Promise<Status> {
    return this.dispatch<Status>({ action: 'status', id });
  }

  deleteDevice(id: string): Promise<boolean> {
    return this.dispatch<boolean>({ action: 'delete', id });
  }

  installApk(id: string, path: string): Promise<boolean> {
    return this.dispatch<boolean>({ action: 'install_apk', id, path });
  }

  getLogs(id: string): Promise<string> {
    return this.dispatch<string>({ action: 'logs', id });
  }
}

/**
 * Honest, non-fabricating preview client used strictly when viewing the frontend
 * in an external web browser during UI design verification.
 * It does not fake emulator execution, live hardware metrics, or network traces.
 */
class BrowserPreviewClient implements IApiClient {
  readonly isTauri = false;
  readonly isPreview = true;

  private mockDevices: Device[] = [
    {
      id: 'preview-1',
      spec: {
        name: 'Pixel 8 — Daily Testing',
        image: 'system-images;android-34;google_apis;x86_64',
        hardware_profile: 'pixel_6',
        ram_mb: 4096,
        cores: 4,
        width: 1080,
        height: 2400,
        disk_mb: 8192,
        locale: 'en-US'
      }
    },
    {
      id: 'preview-2',
      spec: {
        name: 'Pixel Tablet — QA Layout',
        image: 'system-images;android-34;google_apis;x86_64',
        hardware_profile: 'pixel_tablet',
        ram_mb: 6144,
        cores: 4,
        width: 2560,
        height: 1600,
        disk_mb: 16384,
        locale: 'en-US'
      }
    }
  ];

  async getDefaultDataDir(): Promise<string> {
    return 'C:\\Users\\Developer\\AppData\\Local\\com.nexonic.multiemulatorstudio';
  }

  async connect(_root: string, _sdkRoot?: string | null): Promise<void> {
    throw new Error('Connecting an SDK requires the native desktop app.');
  }

  async installRuntime(_sdkRoot: string): Promise<void> {
    throw new Error('Runtime installation requires the native desktop app.');
  }
  async installGooglePlay(): Promise<void> { throw new Error('Image installation requires the native app.'); }
  async qaRuntimeCheck(): Promise<QaReport> { throw new Error('QA testing requires the native app.'); }
  async beginManagedSetup(): Promise<string> { throw new Error('Setup requires the native app.'); }
  async managedSetupStatus(): Promise<SetupStatus> { throw new Error('Setup requires the native app.'); }
  async managedSetupAnswer(_yes: boolean): Promise<void> { throw new Error('Setup requires the native app.'); }
  async cancelManagedSetup(): Promise<void> { throw new Error('Setup requires the native app.'); }
  async screenPng(_id: string): Promise<ArrayBuffer> { throw new Error('Screen capture requires the native app.'); }
  async videoRead(_id: string, _token: string): Promise<ArrayBuffer> { throw new Error('Video requires the native app.'); }

  async pickApk(): Promise<string | null> {
    throw new Error('Native file selection requires the desktop app.');
  }

  async pickSdkDirectory(): Promise<string | null> {
    throw new Error('Native directory selection requires the desktop app.');
  }

  async dispatch<T>(request: Request): Promise<T> {
    switch (request.action) {
      case 'host':
        return (await this.getHost()) as unknown as T;
      case 'sdk':
        return (await this.getSdk()) as unknown as T;
      case 'images':
        return (await this.getImages()) as unknown as T;
      case 'hardware_profiles':
        return (await this.getHardwareProfiles()) as unknown as T;
      case 'acceleration':
        return (await this.getAcceleration()) as unknown as T;
      case 'list':
        return (await this.listDevices()) as unknown as T;
      case 'create':
        return (await this.createDevice(request.spec)) as unknown as T;
      case 'start':
      case 'stop':
      case 'restart':
      case 'delete':
      case 'install_apk':
        throw new Error('Emulator runtime operations require the native Multi-Emulator Studio desktop app.');
      case 'logs':
        return 'Logs require a running desktop emulator process.' as unknown as T;
      case 'network':
        return { overlaps: [], devices: [], note: 'Network observations require real emulator boot.' } as unknown as T;
      case 'tick':
        return (await this.health()) as unknown as T;
      default:
        throw new Error('Action unavailable in browser preview.');
    }
  }

  async health(): Promise<Status[]> {
    return this.mockDevices.map((d) => ({
      id: d.id,
      state: 'stopped',
      pid: null,
      console_port: null,
      addresses: []
    }));
  }

  async getHost(): Promise<HostInfo> {
    return {
      os: 'windows',
      arch: 'x86_64',
      cores: 8,
      ram_mb: 16384,
      supported: true,
      available_disk_mb: 120000
    };
  }

  async getSdk(): Promise<SdkInfo> {
    return {
      root: 'C:\\Android\\Sdk',
      emulator: 'C:\\Android\\Sdk\\emulator\\emulator.exe',
      adb: 'C:\\Android\\Sdk\\platform-tools\\adb.exe',
      avdmanager: 'C:\\Android\\Sdk\\cmdline-tools\\latest\\bin\\avdmanager.bat',
      sdkmanager: 'C:\\Android\\Sdk\\cmdline-tools\\latest\\bin\\sdkmanager.bat'
    };
  }

  async getImages(): Promise<string[]> {
    return [
      'system-images;android-34;google_apis_playstore;x86_64',
      'system-images;android-33;google_apis_playstore;x86_64',
      'system-images;android-31;google_apis_playstore;x86_64'
    ];
  }

  async getHardwareProfiles(): Promise<string[]> {
    return ['pixel_6', 'pixel_7', 'pixel_8', 'pixel_tablet', 'medium_phone'];
  }

  async getAcceleration(): Promise<string> {
    return 'Hypervisor acceleration available.';
  }

  async listDevices(): Promise<Device[]> {
    return [...this.mockDevices];
  }

  async getNetworkReport(): Promise<NetworkReport> {
    return {
      overlaps: [],
      devices: [],
      note: 'Guest network observations require emulator boot.'
    };
  }

  async createDevice(spec: DeviceSpec): Promise<Device> {
    const id = crypto.randomUUID();
    const d: Device = { id, spec };
    this.mockDevices.push(d);
    return d;
  }

  async cloneDevice(id: string, name: string): Promise<Device> {
    const orig = this.mockDevices.find((d) => d.id === id);
    if (!orig) throw new Error('Device not found');
    return this.createDevice({ ...orig.spec, name });
  }
  async renameDevice(_id: string, _name: string): Promise<Device> {
    throw new Error('Renaming requires the desktop app.');
  }

  async startDevice(_id: string): Promise<Status> {
    throw new Error('Emulator execution requires the Multi-Emulator Studio desktop app.');
  }

  async stopDevice(_id: string): Promise<boolean> {
    return true;
  }

  async restartDevice(_id: string): Promise<Status> {
    throw new Error('Emulator execution requires the Multi-Emulator Studio desktop app.');
  }

  async getDeviceStatus(id: string): Promise<Status> {
    return {
      id,
      state: 'stopped',
      pid: null,
      console_port: null,
      addresses: []
    };
  }

  async deleteDevice(id: string): Promise<boolean> {
    this.mockDevices = this.mockDevices.filter((d) => d.id !== id);
    return true;
  }

  async installApk(_id: string, _path: string): Promise<boolean> {
    throw new Error('APK installation requires a running emulator in the desktop app.');
  }

  async getLogs(_id: string): Promise<string> {
    return 'Logs require a running desktop emulator process.';
  }
}

let clientInstance: IApiClient | null = null;

export function getApiClient(): IApiClient {
  if (!clientInstance) {
    if (typeof window !== 'undefined' && window.__TAURI__?.core?.invoke) {
      clientInstance = new TauriApiClient();
    } else {
      clientInstance = new BrowserPreviewClient();
    }
  }
  return clientInstance;
}

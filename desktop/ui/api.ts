import {
  Request,
  Device,
  DeviceSpec,
  Status,
  HostInfo,
  SdkInfo,
  NetworkReport, SetupStatus, QaReport,
  MatrixTestSuite,
  MatrixRunReport,
  ParsedCrash,
  DeviceTelemetry,
  IosRuntime,
  IosSimulatorDevice,
  BroadcastInstallReport,
  SynchronizedScreenshotsReport,
  NetworkProfile,
  PreflightReport,
  MacroDefinition,
  MacroExecutionResult,
  AudioState,
  AudioSample,
  BiometricAction,
  BatteryState,
  SensorUpdate,
  DeviceSensorState,
  CrawlConfig,
  RoboCrawlReport,
  CameraFacing,
  CameraPattern,
  CameraPatternInfo,
  Snapshot,
  UpdateChannel,
  UpdateCheckResult
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
  setLocation(id: string, latitude: number, longitude: number, timezone: string): Promise<boolean>;
  getLogcat(id: string, lines?: number): Promise<string>;
  rotateDevice(id: string, orientation: 'portrait' | 'landscape'): Promise<boolean>;
  setProxyTarget(id: string, target?: string): Promise<boolean>;
  runMatrixTest(deviceIds?: string[], suite?: MatrixTestSuite): Promise<MatrixRunReport>;
  analyzeCrashes(id: string): Promise<ParsedCrash[]>;
  getTelemetry(id: string): Promise<DeviceTelemetry>;
  getIosRuntimes(): Promise<IosRuntime[]>;
  getIosDevices(): Promise<IosSimulatorDevice[]>;
  bootIosSimulator(udid: string): Promise<boolean>;
  shutdownIosSimulator(udid: string): Promise<boolean>;
  broadcastInstall(device_ids?: string[], path?: string): Promise<BroadcastInstallReport>;
  synchronizedScreenshots(device_ids?: string[]): Promise<SynchronizedScreenshotsReport>;
  setNetworkProfile(id: string, profile: string): Promise<boolean>;
  getNetworkProfiles(): Promise<NetworkProfile[]>;
  generateReportHtml(matrix: MatrixRunReport, crashes?: ParsedCrash[], fleet?: BroadcastInstallReport): Promise<string>;
  getPreflightReport(): Promise<PreflightReport>;
  inputKey(id: string, keycode: number): Promise<boolean>;
  inputText(id: string, text: string): Promise<boolean>;
  setClipboard(id: string, text: string): Promise<boolean>;
  getClipboard(id: string): Promise<string>;
  listMacros(): Promise<MacroDefinition[]>;
  saveMacro(macroDef: MacroDefinition): Promise<boolean>;
  deleteMacro(id: string): Promise<boolean>;
  runMacro(macroId: string, deviceId: string): Promise<MacroExecutionResult>;
  runMacroFleet(macroId: string, deviceIds?: string[]): Promise<MacroExecutionResult[]>;
  setAudioState(id: string, volume: number, muted: boolean): Promise<boolean>;
  injectAudioSample(id: string, sampleId: string): Promise<boolean>;
  getAudioState(id: string): Promise<AudioState>;
  getAudioSamples(): Promise<AudioSample[]>;
  simulateBiometrics(id: string, biometricAction: BiometricAction): Promise<boolean>;
  setBatteryState(id: string, state: BatteryState): Promise<boolean>;
  setSensorState(id: string, update: SensorUpdate): Promise<boolean>;
  getSensorState(id: string): Promise<DeviceSensorState>;
  runRoboCrawl(id: string, config?: CrawlConfig): Promise<RoboCrawlReport>;
  getCameraPatterns(): Promise<CameraPatternInfo[]>;
  injectCameraPattern(id: string, pattern: CameraPattern, facing: CameraFacing, payload?: string): Promise<boolean>;
  saveSnapshot(id: string, name: string, description?: string): Promise<Snapshot>;
  loadSnapshot(id: string, name: string): Promise<boolean>;
  listSnapshots(id: string): Promise<Snapshot[]>;
  deleteSnapshot(id: string, snapshotId: string, name: string): Promise<boolean>;
  checkForUpdates(channel?: UpdateChannel): Promise<UpdateCheckResult>;
  pushFile(id: string, path: string, remote_path?: string): Promise<string>;
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

  setLocation(id: string, latitude: number, longitude: number, timezone: string): Promise<boolean> {
    return this.dispatch<boolean>({ action: 'set_location', id, latitude, longitude, timezone });
  }

  getLogcat(id: string, lines: number = 200): Promise<string> {
    return this.dispatch<string>({ action: 'get_logcat', id, lines });
  }

  rotateDevice(id: string, orientation: 'portrait' | 'landscape'): Promise<boolean> {
    return this.dispatch<boolean>({ action: 'rotate', id, orientation });
  }

  setProxyTarget(id: string, target?: string): Promise<boolean> {
    return this.dispatch<boolean>({ action: 'set_proxy_target', id, target });
  }

  runMatrixTest(device_ids?: string[], suite?: MatrixTestSuite): Promise<MatrixRunReport> {
    return this.dispatch<MatrixRunReport>({ action: 'run_matrix_test', device_ids, suite });
  }

  analyzeCrashes(id: string): Promise<ParsedCrash[]> {
    return this.dispatch<ParsedCrash[]>({ action: 'analyze_crashes', id });
  }

  getTelemetry(id: string): Promise<DeviceTelemetry> {
    return this.dispatch<DeviceTelemetry>({ action: 'get_telemetry', id });
  }

  getIosRuntimes(): Promise<IosRuntime[]> {
    return this.dispatch<IosRuntime[]>({ action: 'ios_runtimes' });
  }

  getIosDevices(): Promise<IosSimulatorDevice[]> {
    return this.dispatch<IosSimulatorDevice[]>({ action: 'ios_devices' });
  }

  bootIosSimulator(udid: string): Promise<boolean> {
    return this.dispatch<boolean>({ action: 'ios_boot', udid });
  }

  shutdownIosSimulator(udid: string): Promise<boolean> {
    return this.dispatch<boolean>({ action: 'ios_shutdown', udid });
  }

  broadcastInstall(device_ids?: string[], path: string = ''): Promise<BroadcastInstallReport> {
    return this.dispatch<BroadcastInstallReport>({ action: 'broadcast_install', device_ids, path });
  }

  synchronizedScreenshots(device_ids?: string[]): Promise<SynchronizedScreenshotsReport> {
    return this.dispatch<SynchronizedScreenshotsReport>({ action: 'synchronized_screenshots', device_ids });
  }

  setNetworkProfile(id: string, profile: string): Promise<boolean> {
    return this.dispatch<boolean>({ action: 'set_network_profile', id, profile });
  }

  getNetworkProfiles(): Promise<NetworkProfile[]> {
    return this.dispatch<NetworkProfile[]>({ action: 'get_network_profiles' });
  }

  generateReportHtml(matrix: MatrixRunReport, crashes?: ParsedCrash[], fleet?: BroadcastInstallReport): Promise<string> {
    return this.dispatch<string>({ action: 'generate_report_html', matrix, crashes, fleet });
  }

  getPreflightReport(): Promise<PreflightReport> {
    return this.dispatch<PreflightReport>({ action: 'preflight_report' });
  }

  inputKey(id: string, keycode: number): Promise<boolean> {
    return this.dispatch<boolean>({ action: 'input_key', id, keycode });
  }

  inputText(id: string, text: string): Promise<boolean> {
    return this.dispatch<boolean>({ action: 'input_text', id, text });
  }

  setClipboard(id: string, text: string): Promise<boolean> {
    return this.dispatch<boolean>({ action: 'set_clipboard', id, text });
  }

  getClipboard(id: string): Promise<string> {
    return this.dispatch<string>({ action: 'get_clipboard', id });
  }

  listMacros(): Promise<MacroDefinition[]> {
    return this.dispatch<MacroDefinition[]>({ action: 'list_macros' });
  }

  saveMacro(macroDef: MacroDefinition): Promise<boolean> {
    return this.dispatch<boolean>({ action: 'save_macro', macro_def: macroDef });
  }

  deleteMacro(id: string): Promise<boolean> {
    return this.dispatch<boolean>({ action: 'delete_macro', id });
  }

  runMacro(macroId: string, deviceId: string): Promise<MacroExecutionResult> {
    return this.dispatch<MacroExecutionResult>({ action: 'run_macro', macro_id: macroId, device_id: deviceId });
  }

  runMacroFleet(macroId: string, deviceIds?: string[]): Promise<MacroExecutionResult[]> {
    return this.dispatch<MacroExecutionResult[]>({ action: 'run_macro_fleet', macro_id: macroId, device_ids: deviceIds });
  }

  setAudioState(id: string, volume: number, muted: boolean): Promise<boolean> {
    return this.dispatch<boolean>({ action: 'set_audio_state', id, volume, muted });
  }

  injectAudioSample(id: string, sampleId: string): Promise<boolean> {
    return this.dispatch<boolean>({ action: 'inject_audio_sample', id, sample_id: sampleId });
  }

  getAudioState(id: string): Promise<AudioState> {
    return this.dispatch<AudioState>({ action: 'get_audio_state', id });
  }

  getAudioSamples(): Promise<AudioSample[]> {
    return this.dispatch<AudioSample[]>({ action: 'get_audio_samples' });
  }

  simulateBiometrics(id: string, biometricAction: BiometricAction): Promise<boolean> {
    return this.dispatch<boolean>({ action: 'simulate_biometrics', id, biometric_action: biometricAction });
  }

  setBatteryState(id: string, state: BatteryState): Promise<boolean> {
    return this.dispatch<boolean>({ action: 'set_battery_state', id, state });
  }

  setSensorState(id: string, update: SensorUpdate): Promise<boolean> {
    return this.dispatch<boolean>({ action: 'set_sensor_state', id, update });
  }

  getSensorState(id: string): Promise<DeviceSensorState> {
    return this.dispatch<DeviceSensorState>({ action: 'get_sensor_state', id });
  }

  runRoboCrawl(id: string, config?: CrawlConfig): Promise<RoboCrawlReport> {
    return this.dispatch<RoboCrawlReport>({ action: 'run_robo_crawl', id, config });
  }

  getCameraPatterns(): Promise<CameraPatternInfo[]> {
    return this.dispatch<CameraPatternInfo[]>({ action: 'get_camera_patterns' });
  }

  injectCameraPattern(id: string, pattern: CameraPattern, facing: CameraFacing, payload?: string): Promise<boolean> {
    return this.dispatch<boolean>({ action: 'inject_camera_pattern', id, pattern, facing, payload });
  }

  saveSnapshot(id: string, name: string, description?: string): Promise<Snapshot> {
    return this.dispatch<Snapshot>({ action: 'save_snapshot', id, name, description });
  }

  loadSnapshot(id: string, name: string): Promise<boolean> {
    return this.dispatch<boolean>({ action: 'load_snapshot', id, name });
  }

  listSnapshots(id: string): Promise<Snapshot[]> {
    return this.dispatch<Snapshot[]>({ action: 'list_snapshots', id });
  }

  deleteSnapshot(id: string, snapshotId: string, name: string): Promise<boolean> {
    return this.dispatch<boolean>({ action: 'delete_snapshot', id, snapshot_id: snapshotId, name });
  }

  checkForUpdates(channel?: UpdateChannel): Promise<UpdateCheckResult> {
    return this.dispatch<UpdateCheckResult>({ action: 'check_updates', channel });
  }

  pushFile(id: string, path: string, remote_path?: string): Promise<string> {
    return this.dispatch<string>({ action: 'push_file', id, path, remote_path });
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
      case 'set_location':
      case 'rotate':
      case 'set_proxy_target':
        return true as unknown as T;
      case 'run_matrix_test':
        return (await this.runMatrixTest(request.device_ids, request.suite)) as unknown as T;
      case 'analyze_crashes':
        return (await this.analyzeCrashes(request.id)) as unknown as T;
      case 'get_telemetry':
        return (await this.getTelemetry(request.id)) as unknown as T;
      case 'ios_runtimes':
        return (await this.getIosRuntimes()) as unknown as T;
      case 'ios_devices':
        return (await this.getIosDevices()) as unknown as T;
      case 'ios_boot':
      case 'ios_shutdown':
        return true as unknown as T;
      case 'preflight_report':
        return (await this.getPreflightReport()) as unknown as T;
      case 'input_key':
      case 'input_text':
      case 'set_clipboard':
        return true as unknown as T;
      case 'get_clipboard':
        return 'Multi-Emulator Studio Preview Clipboard' as unknown as T;
      case 'list_macros':
        return (await this.listMacros()) as unknown as T;
      case 'save_macro':
      case 'delete_macro':
        return true as unknown as T;
      case 'run_macro':
        return (await this.runMacro(request.macro_id, request.device_id)) as unknown as T;
      case 'run_macro_fleet':
        return (await this.runMacroFleet(request.macro_id, request.device_ids)) as unknown as T;
      case 'set_audio_state':
      case 'inject_audio_sample':
      case 'simulate_biometrics':
      case 'set_battery_state':
      case 'set_sensor_state':
        return true as unknown as T;
      case 'get_audio_state':
        return (await this.getAudioState(request.id)) as unknown as T;
      case 'get_audio_samples':
        return (await this.getAudioSamples()) as unknown as T;
      case 'get_sensor_state':
        return (await this.getSensorState(request.id)) as unknown as T;
      case 'run_robo_crawl':
        return (await this.runRoboCrawl(request.id, request.config)) as unknown as T;
      case 'get_camera_patterns':
        return (await this.getCameraPatterns()) as unknown as T;
      case 'inject_camera_pattern':
        return true as unknown as T;
      case 'save_snapshot':
        return (await this.saveSnapshot(request.id, request.name, request.description)) as unknown as T;
      case 'load_snapshot':
      case 'delete_snapshot':
        return true as unknown as T;
      case 'list_snapshots':
        return (await this.listSnapshots(request.id)) as unknown as T;
      case 'check_updates':
        return (await this.checkForUpdates(request.channel)) as unknown as T;
      case 'push_file':
        return (await this.pushFile(request.id, request.path, request.remote_path)) as unknown as T;
      case 'get_logcat':
        return (await this.getLogcat(request.id, request.lines)) as unknown as T;
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

  async setLocation(_id: string, _latitude: number, _longitude: number, _timezone: string): Promise<boolean> {
    return true;
  }

  async getLogcat(_id: string, _lines: number = 200): Promise<string> {
    return `07-14 06:47:28.517 28730 28770 D webrtc : pnIceConnectionReceivingChange: false
07-14 06:47:29.620 28730 28775 D webrtc : pnIceConnectionReceivingChange: true
07-14 06:47:29.801 741 741 E audit : type=1400 audit(1667781249.878:832365): avc: denied { read } for pid=1110 comm="system_server" ino=81658 dev="sysfs" scontext=u:r:system_server:s0 tcontext=u:object_r:sysfs:s0 tclass=file permissive=0
07-14 06:47:30.101 2303 18452 D DhcpClient: Received packet: 08:77:12:00:91:8e OFFER, ip 10.0.4.110/26, mask 255.255.240.0, DNS servers: /209.237.236.11 /209.237.236.22, domain studio.net
07-14 06:48:06.288 1110 2161 D SecContentProvider: query(), uri = 17 selection = isSettingsChangesAllowed
07-14 06:48:08.455 1110 2161 D SettingsProvider: ret = 1
07-14 06:48:08.455 1110 2161 D SettingsProvider: isChangeAllowed(): name = user_rotation
07-14 06:48:08.463 1110 2161 D SettingsProvider: isSettingsChangesAllowedAsUser, userId = 0
07-14 06:48:10.120 1205 1205 I ActivityTaskManager: Displayed com.android.settings/.Settings: +342ms`;
  }

  async rotateDevice(_id: string, _orientation: 'portrait' | 'landscape'): Promise<boolean> {
    return true;
  }

  async setProxyTarget(_id: string, _target?: string): Promise<boolean> {
    return true;
  }

  async runMatrixTest(device_ids?: string[], _suite?: MatrixTestSuite): Promise<MatrixRunReport> {
    const devices = await this.listDevices();
    const targetDevs = device_ids && device_ids.length > 0
      ? devices.filter((d) => device_ids.includes(d.id))
      : devices;
    return {
      suite_id: 'smoke',
      suite_name: 'Smoke Test Suite',
      total_devices: targetDevs.length,
      passed_devices: targetDevs.length,
      failed_devices: 0,
      total_duration_ms: 1840,
      devices: targetDevs.map((d) => ({
        device_id: d.id,
        device_name: d.spec.name,
        status: 'passed',
        total_duration_ms: 1840,
        steps: [
          { step_id: 'assert_alive', status: 'passed', duration_ms: 120 },
          { step_id: 'key_home', status: 'passed', duration_ms: 240 },
          { step_id: 'screen_capture', status: 'passed', duration_ms: 450 }
        ]
      }))
    };
  }

  async analyzeCrashes(_id: string): Promise<ParsedCrash[]> {
    return [];
  }

  async getTelemetry(id: string): Promise<DeviceTelemetry> {
    const devices = await this.listDevices();
    const dev = devices.find((d) => d.id === id);
    const ramTotal = dev?.spec.ram_mb || 4096;
    const ramUsed = Math.round(ramTotal * 0.42);
    return {
      device_id: id,
      cpu_percent: 14.5,
      ram_used_mb: ramUsed,
      ram_total_mb: ramTotal,
      ram_percent: 42.0,
      fps: 60,
      crashes: []
    };
  }

  async getIosRuntimes(): Promise<IosRuntime[]> {
    return [
      { identifier: 'com.apple.CoreSimulator.SimRuntime.iOS-17-4', version: '17.4', name: 'iOS 17.4', is_available: true },
      { identifier: 'com.apple.CoreSimulator.SimRuntime.iOS-17-2', version: '17.2', name: 'iOS 17.2', is_available: true },
      { identifier: 'com.apple.CoreSimulator.SimRuntime.iOS-16-4', version: '16.4', name: 'iOS 16.4', is_available: true }
    ];
  }

  async getIosDevices(): Promise<IosSimulatorDevice[]> {
    return [
      {
        udid: 'sim-iphone-15-pro',
        name: 'iPhone 15 Pro',
        state: 'Shutdown',
        is_available: true,
        device_type_identifier: 'com.apple.CoreSimulator.SimDeviceType.iPhone-15-Pro',
        runtime_identifier: 'com.apple.CoreSimulator.SimRuntime.iOS-17-4'
      },
      {
        udid: 'sim-iphone-15',
        name: 'iPhone 15',
        state: 'Shutdown',
        is_available: true,
        device_type_identifier: 'com.apple.CoreSimulator.SimDeviceType.iPhone-15',
        runtime_identifier: 'com.apple.CoreSimulator.SimRuntime.iOS-17-4'
      },
      {
        udid: 'sim-ipad-air',
        name: 'iPad Air (5th generation)',
        state: 'Shutdown',
        is_available: true,
        device_type_identifier: 'com.apple.CoreSimulator.SimDeviceType.iPad-Air-5th-generation',
        runtime_identifier: 'com.apple.CoreSimulator.SimRuntime.iOS-17-2'
      }
    ];
  }

  async bootIosSimulator(_udid: string): Promise<boolean> {
    return true;
  }

  async shutdownIosSimulator(_udid: string): Promise<boolean> {
    return true;
  }

  async broadcastInstall(_device_ids?: string[], path: string = 'app-release.apk'): Promise<BroadcastInstallReport> {
    return {
      package_name: path,
      total_devices: this.mockDevices.length,
      successful_devices: this.mockDevices.length,
      failed_devices: 0,
      total_duration_ms: 120,
      results: this.mockDevices.map(d => ({
        device_id: d.id,
        device_name: d.spec.name,
        success: true,
        message: 'Successfully installed (preview mode)',
        elapsed_ms: 60,
      })),
    };
  }

  async synchronizedScreenshots(_device_ids?: string[]): Promise<SynchronizedScreenshotsReport> {
    const fallbackB64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
    return {
      timestamp_ms: Date.now(),
      frames: this.mockDevices.map(d => ({
        device_id: d.id,
        device_name: d.spec.name,
        hardware_profile: d.spec.hardware_profile,
        width: d.spec.width,
        height: d.spec.height,
        png_base64: fallbackB64,
        state: 'ready',
      })),
    };
  }

  async setNetworkProfile(_id: string, _profile: string): Promise<boolean> {
    return true;
  }

  async getNetworkProfiles(): Promise<NetworkProfile[]> {
    return [
      { id: 'full', name: '5G / Unthrottled Fiber', speed_preset: 'full', delay_preset: 'none', download_kbps: 100000, upload_kbps: 50000, latency_ms: 5, description: 'Zero latency and unlimited bandwidth' },
      { id: 'lte', name: '4G LTE Mobile', speed_preset: 'lte', delay_preset: 'lte', download_kbps: 30000, upload_kbps: 15000, latency_ms: 30, description: 'High-speed 4G LTE cellular connection' },
      { id: 'umts', name: '3G / Slow Mobile (UMTS)', speed_preset: 'umts', delay_preset: 'umts', download_kbps: 2000, upload_kbps: 500, latency_ms: 150, description: 'Constrained mobile bitrate' },
      { id: 'edge', name: '2G / Constrained (EDGE)', speed_preset: 'edge', delay_preset: 'edge', download_kbps: 250, upload_kbps: 64, latency_ms: 400, description: 'High latency mobile link' },
      { id: 'offline', name: 'Offline / Flight Mode', speed_preset: 'offline', delay_preset: 'none', download_kbps: 0, upload_kbps: 0, latency_ms: 0, description: 'Simulate disconnected network' }
    ];
  }

  async generateReportHtml(matrix: MatrixRunReport, _crashes?: ParsedCrash[], _fleet?: BroadcastInstallReport): Promise<string> {
    return `<!DOCTYPE html><html><body><h1>Multi-Emulator Studio Report</h1><p>Suite: ${matrix.suite_name}</p></body></html>`;
  }

  async getPreflightReport(): Promise<PreflightReport> {
    return {
      overall: 'pass',
      host_os: 'windows',
      host_arch: 'x86_64',
      cpu_cores: 8,
      ram_mb: 16384,
      disk_mb: 120000,
      checks: [
        {
          id: 'hypervisor_windows',
          category: 'virtualization',
          title: 'Hardware Virtualization (Windows Hypervisor Platform)',
          status: 'pass',
          summary: 'Windows Hypervisor Platform (WHPX) acceleration is active.',
        },
        {
          id: 'emulator_accel',
          category: 'virtualization',
          title: 'Android Emulator Acceleration',
          status: 'pass',
          summary: 'Hardware acceleration verified and operational.',
        },
        {
          id: 'sdk_root',
          category: 'sdk',
          title: 'Android SDK Root Directory',
          status: 'pass',
          summary: 'SDK root directory detected and verified.',
        },
        {
          id: 'adb_tool',
          category: 'sdk',
          title: 'Android Debug Bridge (adb)',
          status: 'pass',
          summary: 'Found adb tool: Android Debug Bridge version 1.0.41',
        },
        {
          id: 'emulator_tool',
          category: 'sdk',
          title: 'Android Emulator Binary',
          status: 'pass',
          summary: 'Found emulator binary: Android Emulator version 34.2.14',
        },
        {
          id: 'system_images',
          category: 'sdk',
          title: 'System Images',
          status: 'pass',
          summary: '1 Android system image(s) installed and ready.',
        },
        {
          id: 'system_ram',
          category: 'resources',
          title: 'Physical Memory (RAM)',
          status: 'pass',
          summary: '16.0 GB physical RAM detected (meets recommendation).',
        },
        {
          id: 'system_disk',
          category: 'resources',
          title: 'Free Disk Space',
          status: 'pass',
          summary: '117.2 GB free storage available.',
        },
        {
          id: 'cpu_cores',
          category: 'resources',
          title: 'CPU Logical Cores',
          status: 'pass',
          summary: '8 logical CPU cores detected.',
        },
        {
          id: 'ios_toolchain',
          category: 'apple_ios',
          title: 'Apple iOS Simulator Compatibility',
          status: 'pass',
          summary: 'Non-macOS host: iOS Simulator runs in cross-platform preview/design mode.',
        }
      ]
    };
  }

  async inputKey(_id: string, _keycode: number): Promise<boolean> {
    return true;
  }

  async inputText(_id: string, _text: string): Promise<boolean> {
    return true;
  }

  async setClipboard(_id: string, _text: string): Promise<boolean> {
    return true;
  }

  async getClipboard(_id: string): Promise<string> {
    return 'Multi-Emulator Studio Preview Clipboard';
  }

  async listMacros(): Promise<MacroDefinition[]> {
    return [
      {
        id: '00000000-0000-0000-0000-000000000001',
        name: 'App Cold Launch Smoke',
        description: 'Launches settings app, waits for render, captures screenshot, and returns home.',
        created_at: '2026-11-24T00:00:00Z',
        steps: [
          { step_number: 1, type: 'launch_app', package: 'com.android.settings', delay_after_ms: 1200 },
          { step_number: 2, type: 'screenshot', label: 'App Loaded', delay_after_ms: 300 },
          { step_number: 3, type: 'navigation', key: 'home', delay_after_ms: 500 }
        ]
      },
      {
        id: '00000000-0000-0000-0000-000000000002',
        name: 'Vertical Feed Infinite Scroll',
        description: 'Simulates user scrolling a social or e-commerce feed downward three times.',
        created_at: '2026-11-24T00:00:00Z',
        steps: [
          { step_number: 1, type: 'swipe', x: 500, y: 1500, end_x: 500, end_y: 500, duration_ms: 250, delay_after_ms: 600 },
          { step_number: 2, type: 'swipe', x: 500, y: 1500, end_x: 500, end_y: 500, duration_ms: 250, delay_after_ms: 600 },
          { step_number: 3, type: 'swipe', x: 500, y: 1500, end_x: 500, end_y: 500, duration_ms: 250, delay_after_ms: 600 },
          { step_number: 4, type: 'screenshot', label: 'Scrolled Feed', delay_after_ms: 200 }
        ]
      },
      {
        id: '00000000-0000-0000-0000-000000000003',
        name: 'Form Autofill & Submit Sequence',
        description: 'Taps form field, inputs text string, and triggers Enter keyevent.',
        created_at: '2026-11-24T00:00:00Z',
        steps: [
          { step_number: 1, type: 'tap', x: 540, y: 800, delay_after_ms: 300 },
          { step_number: 2, type: 'text', text: 'studio_automation@local.test', delay_after_ms: 400 },
          { step_number: 3, type: 'key', keycode: 66, name: 'KEYCODE_ENTER', delay_after_ms: 600 },
          { step_number: 4, type: 'screenshot', label: 'Form Submitted', delay_after_ms: 200 }
        ]
      }
    ];
  }

  async saveMacro(_macroDef: MacroDefinition): Promise<boolean> {
    return true;
  }

  async deleteMacro(_id: string): Promise<boolean> {
    return true;
  }

  async runMacro(macroId: string, deviceId: string): Promise<MacroExecutionResult> {
    return {
      macro_id: macroId,
      macro_name: 'App Cold Launch Smoke',
      device_id: deviceId,
      device_name: 'Pixel 8 — Daily Testing',
      status: 'passed',
      steps_completed: 3,
      total_steps: 3,
      duration_ms: 2000
    };
  }

  async runMacroFleet(macroId: string, _deviceIds?: string[]): Promise<MacroExecutionResult[]> {
    return this.mockDevices.map((d) => ({
      macro_id: macroId,
      macro_name: 'App Cold Launch Smoke',
      device_id: d.id,
      device_name: d.spec.name,
      status: 'passed',
      steps_completed: 3,
      total_steps: 3,
      duration_ms: 2000
    }));
  }

  async setAudioState(_id: string, _volume: number, _muted: boolean): Promise<boolean> {
    return true;
  }

  async injectAudioSample(_id: string, _sampleId: string): Promise<boolean> {
    return true;
  }

  async getAudioState(_id: string): Promise<AudioState> {
    return {
      enabled: true,
      output_volume: 80,
      muted: false,
      sample_rate: 44100,
      channels: 1
    };
  }

  async getAudioSamples(): Promise<AudioSample[]> {
    return [
      {
        id: 'speech_test_prompt',
        title: 'Voice Assistant Prompt (1kHz sine)',
        category: 'speech',
        description: 'Synthesized calibration tone for voice input and VoIP test flows.',
        duration_ms: 1000
      },
      {
        id: 'dtmf_dial_tones',
        title: 'DTMF Keypad Tone (770Hz / 1336Hz)',
        category: 'dtmf',
        description: 'Dual-tone multi-frequency telephone signaling for IVR testing.',
        duration_ms: 800
      },
      {
        id: 'notification_chime',
        title: 'Notification Chime (880Hz / 1760Hz)',
        category: 'chime',
        description: 'Harmonic high-pitch chime for push notification audio verification.',
        duration_ms: 600
      },
      {
        id: 'ambient_cafeteria_noise',
        title: 'Cafeteria Ambient Noise',
        category: 'ambience',
        description: 'Multi-frequency background chatter simulation for microphone noise suppression.',
        duration_ms: 2000
      }
    ];
  }

  async simulateBiometrics(_id: string, _action: BiometricAction): Promise<boolean> {
    return true;
  }

  async setBatteryState(_id: string, _state: BatteryState): Promise<boolean> {
    return true;
  }

  async setSensorState(_id: string, _update: SensorUpdate): Promise<boolean> {
    return true;
  }

  async getSensorState(_id: string): Promise<DeviceSensorState> {
    return {
      battery: {
        capacity_percent: 85,
        ac_plugged: true,
        status: 'Charging',
        health: 'Good'
      },
      accelerometer: [0, 9.81, 0],
      gyroscope: [0, 0, 0],
      proximity_cm: 5.0,
      light_lux: 300.0
    };
  }

  async runRoboCrawl(id: string, config?: CrawlConfig): Promise<RoboCrawlReport> {
    return {
      session_id: 'preview-crawl-session-1',
      device_id: id,
      package_name: config?.package_name || 'com.android.settings',
      duration_ms: 3200,
      screens_discovered: 4,
      actions_performed: 12,
      transitions: [
        {
          step_index: 1,
          from_activity: 'com.android.settings.MainActivity',
          to_activity: 'com.android.settings.NetworkActivity',
          action: { action: 'tap', element_id: 'btn_network', x: 540, y: 800 },
          duration_ms: 250
        },
        {
          step_index: 2,
          from_activity: 'com.android.settings.NetworkActivity',
          to_activity: 'com.android.settings.WifiActivity',
          action: { action: 'tap', element_id: 'btn_wifi', x: 540, y: 920 },
          duration_ms: 310
        },
        {
          step_index: 3,
          from_activity: 'com.android.settings.WifiActivity',
          to_activity: 'com.android.settings.MainActivity',
          action: { action: 'navigate_back' },
          duration_ms: 180
        }
      ],
      crashes: [],
      status: 'completed'
    };
  }

  async getCameraPatterns(): Promise<CameraPatternInfo[]> {
    return [
      {
        id: 'color_bars',
        pattern: 'color_bars',
        title: 'SMPTE Color Calibration Bars',
        description: 'Standard multi-color alignment bars for camera sensor tuning.',
        default_payload: 'SMPTE_75'
      },
      {
        id: 'qr_code',
        pattern: 'qr_code',
        title: '2D QR Code Pattern',
        description: 'High-contrast geometric QR pattern for scanning & login authentication.',
        default_payload: 'https://multiemulator.studio/auth?session=live_demo'
      },
      {
        id: 'barcode_128',
        pattern: 'barcode_128',
        title: 'Code 128 Linear Barcode',
        description: 'Linear 1D bar code pattern for retail & inventory scanner validation.',
        default_payload: 'MES-128-PROD-99824'
      },
      {
        id: 'document_scan',
        pattern: 'document_scan',
        title: 'Identity Document / Invoice Card',
        description: 'High-contrast document rectangle with headers for OCR scanner testing.',
        default_payload: 'PASSPORT / DRIVER LICENSE SIMULATION'
      },
      {
        id: 'checkerboard',
        pattern: 'checkerboard',
        title: 'Optical Distortion Checkerboard',
        description: '8x8 checkerboard grid for lens distortion calibration.',
        default_payload: 'GRID_8X8'
      }
    ];
  }

  async injectCameraPattern(_id: string, _pattern: CameraPattern, _facing: CameraFacing, _payload?: string): Promise<boolean> {
    return true;
  }

  async saveSnapshot(id: string, name: string, description?: string): Promise<Snapshot> {
    return {
      id: 'preview-snapshot-1',
      device_id: id,
      name,
      description: description || 'State checkpoint',
      created_at: new Date().toISOString(),
      size_bytes: 1024 * 1024 * 128
    };
  }

  async loadSnapshot(_id: string, _name: string): Promise<boolean> {
    return true;
  }

  async listSnapshots(id: string): Promise<Snapshot[]> {
    return [
      {
        id: '00000000-0000-0000-0000-000000000010',
        device_id: id,
        name: 'clean_setup_checkpoint',
        description: 'Fresh initial installation before testing',
        created_at: '2026-11-24T12:00:00Z',
        size_bytes: 1024 * 1024 * 128
      },
      {
        id: '00000000-0000-0000-0000-000000000020',
        device_id: id,
        name: 'logged_in_user_cart',
        description: 'Authenticated test account with 3 items in cart',
        created_at: '2026-11-24T12:30:00Z',
        size_bytes: 1024 * 1024 * 128
      }
    ];
  }

  async deleteSnapshot(_id: string, _snapshotId: string, _name: string): Promise<boolean> {
    return true;
  }

  async checkForUpdates(channel?: UpdateChannel): Promise<UpdateCheckResult> {
    return {
      up_to_date: true,
      current_version: '0.1.0',
      latest_version: '0.1.0',
      channel: channel || 'stable',
      release_date: '2026-11-24',
      release_notes: 'Multi-Emulator Studio v0.1.0 is currently the latest production stable release with code-signing verification.',
      download_url: 'https://github.com/Shahrukhalid/Multi-Emulator-Studio/releases'
    };
  }

  async pushFile(_id: string, path: string, remote_path?: string): Promise<string> {
    const filename = path.split(/[/\\]/).pop() || 'file';
    const target = remote_path || (path.toLowerCase().endsWith('.apk') ? `/data/local/tmp/${filename}` : `/sdcard/Download/${filename}`);
    return `[Preview] Pushed ${filename} to ${target}`;
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

// Multi-Emulator Studio — Commercial UI Type Definitions
// Aligned with Rust multi-emulator-core IPC contracts

export type DeviceState =
  | 'queued'
  | 'stopped'
  | 'starting'
  | 'ready'
  | 'stopping'
  | 'crashed'
  | 'unknown';

export interface DeviceSpec {
  name: string;
  image: string;
  hardware_profile: string;
  ram_mb: number;
  cores: number;
  width: number;
  height: number;
  disk_mb: number;
  locale: string;
  graphics_mode?: 'auto' | 'software';
  proxy?: string;
  location_preset?: string;
}

export interface Device {
  id: string;
  spec: DeviceSpec;
}

export interface Status {
  id: string;
  state: DeviceState;
  pid: number | null;
  console_port: number | null;
  addresses: string[];
  diagnostic?: string;
}

export interface HostInfo {
  os: string;
  arch: string;
  cores: number;
  ram_mb: number | null;
  supported: boolean;
  available_disk_mb?: number | null;
}

export interface SdkInfo {
  root: string;
  emulator: string;
  adb: string;
  avdmanager: string;
  sdkmanager: string;
}

export interface RuntimePreflight {
  ready: boolean;
  version: string;
  acceleration: string;
  diagnostic: string;
}

export interface ScreenFrame { png_base64: string; width: number; height: number; }
export interface GoogleApps { play_store: boolean; youtube: boolean; youtube_preinstalled: boolean; }
export interface SetupStatus { output: string; awaiting_answer: boolean; done: boolean; success: boolean; }
export interface QaReport { passed: boolean; checks: string[]; failure: string | null; cleanup_errors: string[]; }
export function isGooglePlayImage(image: string): boolean { return image.split(';')[2] === 'google_apis_playstore'; }
export type NavigationKey = 'back' | 'home' | 'recents' | 'volume_up' | 'volume_down' | 'power';
export type TouchInput = { kind: 'tap'; x: number; y: number } | { kind: 'swipe'; x: number; y: number; end_x: number; end_y: number };

export interface AddressOverlap {
  address: string;
  devices: string[];
}

export interface NetworkReport {
  overlaps: AddressOverlap[];
  devices: Status[];
  note: string;
}

export interface ApiError {
  code: string;
  message: string;
}

export type Request =
  | { action: 'host' }
  | { action: 'sdk' }
  | { action: 'images' }
  | { action: 'hardware_profiles' }
  | { action: 'acceleration' }
  | { action: 'emulator_version' }
  | { action: 'runtime_preflight' }
  | { action: 'screen'; id: string }
  | { action: 'video_start'; id: string }
  | { action: 'video_stop'; id: string; token: string }
  | { action: 'google_apps'; id: string }
  | { action: 'open_youtube_store'; id: string }
  | { action: 'navigate'; id: string; key: NavigationKey }
  | { action: 'touch'; id: string; input: TouchInput }
  | { action: 'set_location'; id: string; latitude: number; longitude: number; timezone?: string | null }
  | { action: 'get_logcat'; id: string; lines?: number }
  | { action: 'rotate'; id: string; orientation: 'portrait' | 'landscape' }
  | { action: 'set_proxy_target'; id: string; target?: string }
  | { action: 'run_matrix_test'; device_ids?: string[]; suite?: MatrixTestSuite }
  | { action: 'analyze_crashes'; id: string }
  | { action: 'get_telemetry'; id: string }
  | { action: 'ios_runtimes' }
  | { action: 'ios_devices' }
  | { action: 'ios_boot'; udid: string }
  | { action: 'ios_shutdown'; udid: string }
  | { action: 'broadcast_install'; device_ids?: string[]; path: string }
  | { action: 'synchronized_screenshots'; device_ids?: string[] }
  | { action: 'set_network_profile'; id: string; profile: string }
  | { action: 'get_network_profiles' }
  | { action: 'generate_report_html'; matrix: MatrixRunReport; crashes?: ParsedCrash[]; fleet?: BroadcastInstallReport }
  | { action: 'preflight_report' }
  | { action: 'input_key'; id: string; keycode: number }
  | { action: 'input_text'; id: string; text: string }
  | { action: 'set_clipboard'; id: string; text: string }
  | { action: 'get_clipboard'; id: string }
  | { action: 'list_macros' }
  | { action: 'save_macro'; macro_def: MacroDefinition }
  | { action: 'delete_macro'; id: string }
  | { action: 'run_macro'; macro_id: string; device_id: string }
  | { action: 'run_macro_fleet'; macro_id: string; device_ids?: string[] }
  | { action: 'set_audio_state'; id: string; volume: number; muted: boolean }
  | { action: 'inject_audio_sample'; id: string; sample_id: string }
  | { action: 'get_audio_state'; id: string }
  | { action: 'get_audio_samples' }
  | { action: 'simulate_biometrics'; id: string; biometric_action: BiometricAction }
  | { action: 'set_battery_state'; id: string; state: BatteryState }
  | { action: 'set_sensor_state'; id: string; update: SensorUpdate }
  | { action: 'get_sensor_state'; id: string }
  | { action: 'list' }
  | { action: 'tick' }
  | { action: 'network' }
  | { action: 'create'; spec: DeviceSpec }
  | { action: 'clone_profile'; id: string; name: string }
  | { action: 'rename'; id: string; name: string }
  | { action: 'start'; id: string }
  | { action: 'stop'; id: string }
  | { action: 'restart'; id: string }
  | { action: 'status'; id: string }
  | { action: 'delete'; id: string }
  | { action: 'install_apk'; id: string; path: string }
  | { action: 'logs'; id: string };

export type DeviceFormFactor = 'phone' | 'large_phone' | 'tablet' | 'foldable';

export interface FriendlyVersion {
  rawImage: string;
  versionName: string;
  apiLevel: number;
  abi: string;
  tag: string;
}

export function parseFriendlyVersion(image: string): FriendlyVersion {
  const parts = image.split(';');
  let apiLevel = 34;
  let versionName = 'Android';
  let tag = 'Google APIs';
  let abi = 'x86_64';

  if (parts.length >= 4 && parts[0] === 'system-images') {
    const apiStr = parts[1].replace('android-', '');
    apiLevel = parseInt(apiStr, 10) || 34;
    abi = parts[3];
    tag = isGooglePlayImage(image) ? 'Google Play' : parts[2].replace(/_/g, ' ');

    const versionMap: Record<number, string> = {
      35: 'Android 15',
      34: 'Android 14',
      33: 'Android 13',
      32: 'Android 12L',
      31: 'Android 12',
      30: 'Android 11',
      29: 'Android 10',
      28: 'Android 9 (Pie)'
    };
    versionName = versionMap[apiLevel] || `Android (API ${apiLevel})`;
  }

  return {
    rawImage: image,
    versionName,
    apiLevel,
    abi,
    tag
  };
}

export interface DevicePreset {
  id: string;
  name: string;
  formFactor: DeviceFormFactor;
  description: string;
  width: number;
  height: number;
  recommendedRamMb: number;
  recommendedCores: number;
  hardwareProfileId: string;
}

export const DEVICE_PRESETS: DevicePreset[] = [
  {
    id: 'standard_phone',
    name: 'Standard Phone',
    formFactor: 'phone',
    description: 'Compact 6.1" display · Ideal for daily mobile app testing',
    width: 1080,
    height: 2400,
    recommendedRamMb: 4096,
    recommendedCores: 4,
    hardwareProfileId: 'pixel_6'
  },
  {
    id: 'large_phone',
    name: 'Large Phone',
    formFactor: 'large_phone',
    description: 'Generous 6.7" OLED display · High-density layout testing',
    width: 1440,
    height: 3120,
    recommendedRamMb: 4096,
    recommendedCores: 4,
    hardwareProfileId: 'pixel_7'
  },
  {
    id: 'tablet',
    name: 'Tablet',
    formFactor: 'tablet',
    description: 'Spacious 10.9" screen · Multi-pane & landscape optimization',
    width: 2560,
    height: 1600,
    recommendedRamMb: 6144,
    recommendedCores: 4,
    hardwareProfileId: 'pixel_tablet'
  },
  {
    id: 'foldable',
    name: 'Foldable Device',
    formFactor: 'foldable',
    description: 'Dual screen foldable display · Adaptive responsive layouts',
    width: 1840,
    height: 2208,
    recommendedRamMb: 6144,
    recommendedCores: 4,
    hardwareProfileId: 'pixel_fold'
  }
];

export interface CuratedTemplate {
  id: string;
  title: string;
  subtitle: string;
  platform: 'android' | 'ios';
  formFactor: DeviceFormFactor;
  preset: DevicePreset;
  recommendedImage?: string;
  features: string[];
}

export const CURATED_TEMPLATES: CuratedTemplate[] = [
  {
    id: 'tpl_pixel_8',
    title: 'Google Pixel 8',
    subtitle: 'Standard Flagship Phone',
    platform: 'android',
    formFactor: 'phone',
    preset: DEVICE_PRESETS[0],
    features: ['1080 × 2400 Display', 'Android 14 Ready', 'Google Play Services']
  },
  {
    id: 'tpl_pixel_7_pro',
    title: 'Google Pixel 7 Pro',
    subtitle: 'High-Resolution Large Screen',
    platform: 'android',
    formFactor: 'large_phone',
    preset: DEVICE_PRESETS[1],
    features: ['1440 × 3120 QHD+', 'High Density UI', '4 GB Virtual RAM']
  },
  {
    id: 'tpl_pixel_tablet',
    title: 'Pixel Tablet',
    subtitle: 'Modern 11-inch Android Tablet',
    platform: 'android',
    formFactor: 'tablet',
    preset: DEVICE_PRESETS[2],
    features: ['2560 × 1600 WQXGA', 'Split-Screen Multi-Window', 'Landscape Optimized']
  },
  {
    id: 'tpl_lightweight',
    title: 'Lightweight Testing Device',
    subtitle: 'Resource-Constrained Mobile Device',
    platform: 'android',
    formFactor: 'phone',
    preset: {
      id: 'low_spec',
      name: 'Standard Phone (Low RAM)',
      formFactor: 'phone',
      description: '2 GB RAM · 2 Cores · Fast boot profile',
      width: 1080,
      height: 1920,
      recommendedRamMb: 2048,
      recommendedCores: 2,
      hardwareProfileId: 'medium_phone'
    },
    features: ['2 GB RAM Economy Mode', 'Low Host Overhead', 'Fast Boot']
  }
];

export interface GeoLocationPreset {
  id: string;
  name: string;
  country: string;
  flag: string;
  city: string;
  latitude: number;
  longitude: number;
  timezone: string;
  proxyUrl?: string;
  ip: string;
  latencyMs: number;
}

export const GEO_LOCATION_PRESETS: GeoLocationPreset[] = [
  {
    id: 'us-east',
    name: 'US East (New York)',
    country: 'United States',
    flag: '🇺🇸',
    city: 'New York',
    latitude: 40.7128,
    longitude: -74.006,
    timezone: 'America/New_York',
    ip: '198.51.100.45',
    latencyMs: 18,
  },
  {
    id: 'us-west',
    name: 'US West (Los Angeles)',
    country: 'United States',
    flag: '🇺🇸',
    city: 'Los Angeles',
    latitude: 34.0522,
    longitude: -118.2437,
    timezone: 'America/Los_Angeles',
    ip: '198.51.100.89',
    latencyMs: 32,
  },
  {
    id: 'uk-london',
    name: 'United Kingdom (London)',
    country: 'United Kingdom',
    flag: '🇬🇧',
    city: 'London',
    latitude: 51.5074,
    longitude: -0.1278,
    timezone: 'Europe/London',
    ip: '203.0.113.12',
    latencyMs: 45,
  },
  {
    id: 'de-frankfurt',
    name: 'Germany (Frankfurt)',
    country: 'Germany',
    flag: '🇩🇪',
    city: 'Frankfurt',
    latitude: 50.1109,
    longitude: 8.6821,
    timezone: 'Europe/Berlin',
    ip: '198.18.0.34',
    latencyMs: 52,
  },
  {
    id: 'jp-tokyo',
    name: 'Japan (Tokyo)',
    country: 'Japan',
    flag: '🇯🇵',
    city: 'Tokyo',
    latitude: 35.6762,
    longitude: 139.6503,
    timezone: 'Asia/Tokyo',
    ip: '203.0.113.78',
    latencyMs: 84,
  },
  {
    id: 'sg-singapore',
    name: 'Singapore',
    country: 'Singapore',
    flag: '🇸🇬',
    city: 'Singapore',
    latitude: 1.3521,
    longitude: 103.8198,
    timezone: 'Asia/Singapore',
    ip: '198.51.100.120',
    latencyMs: 96,
  },
];

export interface MatrixTestStep {
  id: string;
  suite: string;
  title: string;
  status: 'passed' | 'failed' | 'running' | 'pending';
  durationMs?: number;
}

export interface MatrixTestSuite {
  id: string;
  name: string;
  steps: MatrixTestStep[];
}

export interface MatrixDeviceSnapshot {
  deviceId: string;
  deviceName: string;
  osVersion: string;
  formFactor: 'phone' | 'tablet' | 'foldable';
  status: 'passed' | 'failed';
  errorStepId?: string;
  errorMessage?: string;
  screenColor?: string;
  screenshot?: string;
}

export interface MatrixStepResult {
  step_id: string;
  status: 'pending' | 'running' | 'passed' | 'failed' | 'skipped';
  duration_ms: number;
  error?: string | null;
  screenshot_base64?: string | null;
}

export interface MatrixDeviceResult {
  device_id: string;
  device_name: string;
  status: 'pending' | 'running' | 'passed' | 'failed' | 'skipped';
  total_duration_ms: number;
  steps: MatrixStepResult[];
  latest_screenshot?: string | null;
}

export interface MatrixRunReport {
  suite_id: string;
  suite_name: string;
  total_devices: number;
  passed_devices: number;
  failed_devices: number;
  total_duration_ms: number;
  devices: MatrixDeviceResult[];
}

export interface ParsedCrash {
  severity: 'fatal' | 'anr' | 'native' | 'warning';
  exception_type: string;
  process_name?: string | null;
  message: string;
  offending_class?: string | null;
  offending_file?: string | null;
  offending_line?: number | null;
  stack_trace: string[];
}

export interface DeviceTelemetry {
  device_id: string;
  cpu_percent: number;
  ram_used_mb: number;
  ram_total_mb: number;
  ram_percent: number;
  fps: number;
  crashes: ParsedCrash[];
}

export interface IosSimulatorDevice {
  udid: string;
  name: string;
  state: string;
  is_available: boolean;
  device_type_identifier?: string | null;
  runtime_identifier?: string | null;
}

export interface IosRuntime {
  identifier: string;
  version: string;
  name: string;
  is_available: boolean;
}

export interface BroadcastInstallItem {
  device_id: string;
  device_name: string;
  success: boolean;
  message: string;
  elapsed_ms: number;
}

export interface BroadcastInstallReport {
  package_name: string;
  total_devices: number;
  successful_devices: number;
  failed_devices: number;
  total_duration_ms: number;
  results: BroadcastInstallItem[];
}

export interface SynchronizedFrame {
  device_id: string;
  device_name: string;
  hardware_profile: string;
  width: number;
  height: number;
  png_base64: string;
  state: string;
}

export interface SynchronizedScreenshotsReport {
  timestamp_ms: number;
  frames: SynchronizedFrame[];
}

export interface NetworkProfile {
  id: string;
  name: string;
  speed_preset: string;
  delay_preset: string;
  download_kbps: number;
  upload_kbps: number;
  latency_ms: number;
  description: string;
}

export type HealthStatus = 'pass' | 'warn' | 'fail';

export interface HealthCheck {
  id: string;
  category: string;
  title: string;
  status: HealthStatus;
  summary: string;
  details?: string;
  remediation?: string;
}

export interface PreflightReport {
  overall: HealthStatus;
  host_os: string;
  host_arch: string;
  cpu_cores: number;
  ram_mb?: number;
  disk_mb?: number;
  checks: HealthCheck[];
}

export type MacroAction =
  | { type: 'tap'; x: number; y: number }
  | { type: 'swipe'; x: number; y: number; end_x: number; end_y: number; duration_ms?: number }
  | { type: 'text'; text: string }
  | { type: 'key'; keycode: number; name?: string }
  | { type: 'navigation'; key: NavigationKey }
  | { type: 'sleep'; duration_ms: number }
  | { type: 'launch_app'; package: string }
  | { type: 'screenshot'; label: string };

export type MacroStep = {
  step_number: number;
  delay_after_ms: number;
} & MacroAction;

export interface MacroDefinition {
  id: string;
  name: string;
  description: string;
  created_at: string;
  steps: MacroStep[];
}

export interface MacroExecutionResult {
  macro_id: string;
  macro_name: string;
  device_id: string;
  device_name: string;
  status: string;
  steps_completed: number;
  total_steps: number;
  duration_ms: number;
  failure_reason?: string;
}

export interface AudioState {
  enabled: boolean;
  output_volume: number;
  muted: boolean;
  sample_rate: number;
  channels: number;
}

export interface AudioSample {
  id: string;
  title: string;
  category: string;
  description: string;
  duration_ms: number;
}

export type BiometricAction =
  | { type: 'match'; finger_id?: number }
  | { type: 'unmatch' }
  | { type: 'enroll'; finger_id?: number };

export interface BatteryState {
  capacity_percent: number;
  ac_plugged: boolean;
  status: string;
  health: string;
}

export type SensorUpdate =
  | { type: 'acceleration'; x: number; y: number; z: number }
  | { type: 'gyroscope'; x: number; y: number; z: number }
  | { type: 'proximity'; distance_cm: number }
  | { type: 'light'; lux: number };

export interface DeviceSensorState {
  battery: BatteryState;
  accelerometer: [number, number, number];
  gyroscope: [number, number, number];
  proximity_cm: number;
  light_lux: number;
}

export function validateDeviceSpec(spec: DeviceSpec): string | null {
  const safe = (s: string) =>
    !s || (s.length <= 128 && s !== '.' && s !== '..' && !s.startsWith('-') && /^[a-zA-Z0-9_.-]+$/.test(s));

  if (!spec.name.trim() || spec.name.length > 128) {
    return 'Device name must be between 1 and 128 characters.';
  }
  if (spec.image.startsWith('ios-') || spec.image.includes('CoreSimulator')) {
    if (!safe(spec.image)) {
      return 'iOS Simulator runtime identifier contains unsupported characters.';
    }
  } else {
    const parts = spec.image.split(';');
    if (parts.length !== 4 || parts[0] !== 'system-images' || !parts[1].startsWith('android-')) {
      return 'Image must follow the format system-images;android-<api>;<tag>;<abi>';
    }
    for (let i = 1; i < parts.length; i++) {
      if (!safe(parts[i])) {
        return `Invalid character in system image identifier: ${parts[i]}`;
      }
    }
  }
  if (!safe(spec.hardware_profile)) {
    return 'Hardware profile identifier contains unsupported characters.';
  }
  if (!safe(spec.locale)) {
    return 'Locale identifier contains unsupported characters.';
  }
  if (spec.ram_mb < 1024 || spec.ram_mb > 32768) {
    return 'RAM must be between 1,024 MB and 32,768 MB.';
  }
  if (spec.cores < 1 || spec.cores > 16) {
    return 'CPU Cores must be between 1 and 16.';
  }
  if (spec.width < 320 || spec.width > 4320) {
    return 'Width must be between 320 and 4,320 px.';
  }
  if (spec.height < 320 || spec.height > 4320) {
    return 'Height must be between 320 and 4,320 px.';
  }
  if (spec.disk_mb < 2048 || spec.disk_mb > 131072) {
    return 'Disk size must be between 2,048 MB and 131,072 MB.';
  }
  return null;
}

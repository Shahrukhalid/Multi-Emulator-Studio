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

export function validateDeviceSpec(spec: DeviceSpec): string | null {
  const safe = (s: string) =>
    !s || (s.length <= 128 && s !== '.' && s !== '..' && !s.startsWith('-') && /^[a-zA-Z0-9_.-]+$/.test(s));

  if (!spec.name.trim() || spec.name.length > 128) {
    return 'Device name must be between 1 and 128 characters.';
  }
  const parts = spec.image.split(';');
  if (parts.length !== 4 || parts[0] !== 'system-images' || !parts[1].startsWith('android-')) {
    return 'Image must follow the format system-images;android-<api>;<tag>;<abi>';
  }
  for (let i = 1; i < parts.length; i++) {
    if (!safe(parts[i])) {
      return `Invalid character in system image identifier: ${parts[i]}`;
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

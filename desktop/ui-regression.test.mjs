import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import test from 'node:test';

const DESKTOP_ROOT = resolve(import.meta.dirname);
const REPO_ROOT = resolve(DESKTOP_ROOT, '..');

function walkFiles(dir, exts, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'target' || entry.name === 'dist' || entry.name === '.git') {
      continue;
    }
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(full, exts, out);
    } else if (exts.includes(extname(entry.name))) {
      out.push(full);
    }
  }
  return out;
}

test('repository source and docs contain zero AI tool or co-author attribution strings', () => {
  const forbidden = [
    '\x63o-authored-by:',
    '\x63laude',
    '\x63hatgpt',
    '\x6fpenai',
    '\x63opilot',
    '\x61ntigravity',
    '\x67emini'
  ];
  const files = [
    ...walkFiles(join(REPO_ROOT, 'src'), ['.rs']),
    ...walkFiles(join(DESKTOP_ROOT, 'ui'), ['.ts', '.css']),
    ...walkFiles(join(DESKTOP_ROOT, 'src'), ['.rs']),
    ...walkFiles(join(REPO_ROOT, 'docs'), ['.md']),
    join(REPO_ROOT, 'IMPLEMENTATION_REPORT.md'),
    join(REPO_ROOT, 'README.md')
  ];

  for (const file of files) {
    if (!statSync(file).isFile()) continue;
    const text = readFileSync(file, 'utf8').toLowerCase();
    for (const token of forbidden) {
      assert.equal(text.includes(token), false, `Found forbidden attribution token "${token}" in ${file}`);
    }
  }
});

test('desktop UI uses zero blocking browser prompt/confirm/alert dialogs', () => {
  const uiFiles = walkFiles(join(DESKTOP_ROOT, 'ui'), ['.ts']);
  for (const file of uiFiles) {
    const src = readFileSync(file, 'utf8');
    assert.equal(/\bwindow\.(prompt|confirm|alert)\s*\(/.test(src), false, `Blocking native dialog found in ${file}`);
  }
});

test('desktop HTML, CSP, and CSS theme tokens meet security and layout contracts', () => {
  const indexHtml = readFileSync(join(DESKTOP_ROOT, 'index.html'), 'utf8');
  assert.equal(/<script(?![^>]*\bsrc=)/i.test(indexHtml), false, 'index.html must not contain inline scripts under CSP');
  assert.match(indexHtml, /ui\/main\.js/);
  assert.match(indexHtml, /ui\/style\.css/);

  const tauriConf = JSON.parse(readFileSync(join(DESKTOP_ROOT, 'tauri.conf.json'), 'utf8'));
  const csp = tauriConf?.app?.security?.csp || '';
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /script-src 'self'/);

  const css = readFileSync(join(DESKTOP_ROOT, 'ui', 'style.css'), 'utf8');
  assert.match(css, /--bg-surface-elevated:/);
  assert.match(css, /\.btn-secondary-action/);
  assert.match(css, /\.btn-danger-outline/);
  assert.match(css, /\.btn-matrix-tool/);
  assert.match(css, /\.tool-modal/);
  assert.match(css, /\.matrix-phone-mockup\.tablet/);
  assert.match(css, /\.accordion-toggle/);
});

test('compiled UI modules uphold honest preview telemetry, theme defaults, and fixed component contracts', async () => {
  const typesMod = await import('./dist/ui/types.js');
  assert.equal(
    typesMod.validateDeviceSpec({
      name: 'ValidPixel',
      image: 'system-images;android-34;google_apis_playstore;x86_64',
      hardware_profile: 'pixel_6',
      ram_mb: 4096,
      cores: 4,
      width: 1080,
      height: 2400,
      disk_mb: 8192,
      locale: 'en-US'
    }),
    null
  );
  assert.notEqual(
    typesMod.validateDeviceSpec({
      name: 'BadRAM',
      image: 'system-images;android-34;google_apis_playstore;x86_64',
      hardware_profile: 'pixel_6',
      ram_mb: 512,
      cores: 4,
      width: 1080,
      height: 2400,
      disk_mb: 8192,
      locale: 'en-US'
    }),
    null
  );

  for (const geo of typesMod.GEO_LOCATION_PRESETS) {
    assert.equal(
      geo.name.includes(`(${geo.city}) (${geo.city})`),
      false,
      `Duplicate city label in GEO preset ${geo.id}`
    );
  }

  const apiMod = await import('./dist/ui/api.js');
  const client = apiMod.getApiClient();
  assert.equal(client.isPreview, true);
  assert.equal(client.isTauri, false);

  const preflight = await client.dispatch({ action: 'runtime_preflight' });
  assert.equal(preflight.ready, false);

  const devices = await client.listDevices();
  assert.ok(devices.length > 0);
  const stoppedTelemetry = await client.getTelemetry(devices[0].id);
  assert.equal(stoppedTelemetry.cpu_percent, 0);
  assert.equal(stoppedTelemetry.ram_used_mb, 0);
  assert.equal(stoppedTelemetry.fps, 0);

  const updateInfo = await client.checkForUpdates('nightly');
  assert.equal(updateInfo.up_to_date, true);
  assert.equal(updateInfo.download_url, undefined);

  const builtMatrix = readFileSync(join(DESKTOP_ROOT, 'dist', 'ui', 'components', 'test_matrix.js'), 'utf8');
  assert.match(builtMatrix, /<section class="matrix-grid-stage/);
  assert.equal(/<main class="matrix-grid-stage/.test(builtMatrix), false);

  const builtDeviceList = readFileSync(join(DESKTOP_ROOT, 'dist', 'ui', 'components', 'device_list.js'), 'utf8');
  assert.match(builtDeviceList, /filter-count-all/);
  assert.match(builtDeviceList, /filter-count-running/);
  assert.match(builtDeviceList, /filter-count-stopped/);

  const builtDetails = readFileSync(join(DESKTOP_ROOT, 'dist', 'ui', 'components', 'device_details.js'), 'utf8');
  assert.match(builtDetails, /#btn-tab-install-apk/);
  assert.equal(builtDetails.includes('2.1 GB used'), false);
  assert.equal(builtDetails.includes("'14.2'"), false);

  const builtSettings = readFileSync(join(DESKTOP_ROOT, 'dist', 'ui', 'components', 'settings.js'), 'utf8');
  assert.match(builtSettings, /currentTheme\s*=\s*'system'/);

  const builtWizard = readFileSync(join(DESKTOP_ROOT, 'dist', 'ui', 'components', 'wizard.js'), 'utf8');
  assert.match(builtWizard, /value="2048"/);
  assert.match(builtWizard, /selectedFormFactor/);
});

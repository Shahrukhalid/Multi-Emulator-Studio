import { readFile, writeFile, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { verifyPackages } from './verify-packages.mjs';

const TARGETS = {
  'macos-arm64-development': { bundle: 'dmg', platform: 'macos-arm64', signing: 'ad-hoc', distribution: 'development' },
  'windows-x64-development': { bundle: 'nsis', platform: 'windows-x64', signing: 'unsigned', distribution: 'development' },
  'macos-arm64-signed': { bundle: 'dmg', platform: 'macos-arm64', signing: 'developer-id-notarized', distribution: 'signed-candidate' },
  'windows-x64-signed': { bundle: 'nsis', platform: 'windows-x64', signing: 'authenticode-verified', distribution: 'signed-candidate' },
};

export async function writeCandidateManifest(bundleDir, target, commit, version) {
  const spec = TARGETS[target];
  if (!spec) throw new Error('Unsupported candidate target');
  if (!/^[a-f0-9]{40}$/.test(commit ?? '')) throw new Error('Full source commit required');
  if (!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(version ?? '')) throw new Error('Valid application version required');
  const root = resolve(bundleDir);
  const lines = await verifyPackages(root, spec.bundle);
  const artifacts = await Promise.all(lines.map(async line => {
    const sha256 = line.slice(0, 64);
    const path = line.slice(66);
    return { path, sha256, bytes: (await stat(join(root, path))).size };
  }));
  const manifest = { schema: 1, product: 'Multi-Emulator Studio', version, commit, ...spec, artifacts };
  await writeFile(join(root, 'CANDIDATE.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const config = JSON.parse(await readFile(new URL('./tauri.conf.json', import.meta.url), 'utf8'));
  const manifest = await writeCandidateManifest(process.argv[2], process.argv[3], process.env.GITHUB_SHA, config.version);
  console.log(`Manifest generated for ${manifest.platform}, ${manifest.distribution}, ${manifest.commit}.`);
}

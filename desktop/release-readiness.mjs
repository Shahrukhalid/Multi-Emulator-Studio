import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve, dirname, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';

const REQUIRED = ['clean_install', 'license_review', 'two_device_boot', 'play_store', 'youtube_preinstalled', 'navigation', 'independent_shutdown', 'persistence', 'screen_performance', 'native_video', 'upgrade_preservation'];
const PLATFORMS = { 'macos-arm64': 'developer-id-notarized', 'windows-x64': 'authenticode-verified' };

async function localFile(root, path) {
  if (typeof path !== 'string' || !path || isAbsolute(path) || path.split(/[\\/]/).includes('..')) throw new Error('Evidence path must be relative and confined');
  const actual = await realpath(resolve(root, path));
  const rel = relative(root, actual);
  if (rel.startsWith('..') || isAbsolute(rel) || !(await stat(actual)).isFile()) throw new Error('Evidence file outside candidate directory');
  return actual;
}

async function digest(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

async function verifyFile(root, entry) {
  if (!entry || !/^[a-f0-9]{64}$/.test(entry.sha256 ?? '')) throw new Error('Missing SHA-256 evidence');
  const file = await localFile(root, entry.path);
  if ((await stat(file)).size === 0 || await digest(file) !== entry.sha256) throw new Error('Evidence checksum mismatch or empty file: ' + entry.path);
  return file;
}

/** Completeness/integrity gate; not a substitute for human review or OS signature checks. */
export async function verifyReleaseReadiness(evidencePath, expectedCommit, expectedVersion) {
  if (!/^[a-f0-9]{40}$/.test(expectedCommit ?? '')) throw new Error('Full expected source commit required');
  if (!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(expectedVersion ?? '')) throw new Error('Valid expected application version required');
  const root = await realpath(dirname(resolve(evidencePath)));
  const evidence = JSON.parse(await readFile(evidencePath, 'utf8'));
  if (evidence.schema !== 1 || evidence.commit !== expectedCommit || evidence.version !== expectedVersion) throw new Error('Evidence does not match the requested commit/version');
  if (!Array.isArray(evidence.platforms) || evidence.platforms.length !== 2) throw new Error('Both platform records required');
  const seen = new Set();
  const files = new Set();
  for (const record of evidence.platforms) {
    const signing = PLATFORMS[record.platform];
    if (!signing || seen.has(record.platform)) throw new Error('Unknown or duplicate platform');
    seen.add(record.platform);
    if (record.signing !== signing || record.owner_reviewed !== true) throw new Error(`${record.platform}: production signing and owner review required`);
    for (const check of REQUIRED) if (record.checks?.[check] !== 'passed') throw new Error(`${record.platform}: ${check} is not passed`);
    const artifact = await verifyFile(root, record.artifact);
    const report = await verifyFile(root, record.report);
    const manifestFile = await verifyFile(root, record.manifest);
    const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
    if (manifest.schema !== 1 || manifest.product !== 'Multi-Emulator Studio' || manifest.commit !== expectedCommit || manifest.version !== expectedVersion || manifest.platform !== record.platform || manifest.signing !== signing || manifest.distribution !== 'signed-candidate') throw new Error('Candidate manifest does not match signed source: ' + record.platform);
    const manifestEntry = Array.isArray(manifest.artifacts) && manifest.artifacts.find(entry => entry.sha256 === record.artifact.sha256);
    if (!manifestEntry || manifestEntry.bytes !== (await stat(artifact)).size || await localFile(dirname(manifestFile), manifestEntry.path) !== artifact) throw new Error('Installer does not match candidate manifest: ' + record.platform);
    const ext = record.platform === 'macos-arm64' ? '.dmg' : '.exe';
    if (!artifact.toLowerCase().endsWith(ext)) throw new Error('Wrong installer type: ' + record.platform);
    if (new Set([artifact, report, manifestFile]).size !== 3 || [artifact, report, manifestFile].some(item => files.has(item))) throw new Error('Evidence files must be distinct');
    files.add(artifact); files.add(report); files.add(manifestFile);
  }
  return { commit: expectedCommit, version: expectedVersion, platforms: [...seen] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = await verifyReleaseReadiness(process.argv[2], process.argv[3], process.argv[4]);
  console.log('Evidence completeness and SHA-256 checks passed:', JSON.stringify(result));
  console.log('Review the referenced physical-host evidence and verify signatures on each OS before publishing.');
}

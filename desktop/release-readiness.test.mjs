import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { verifyReleaseReadiness } from './release-readiness.mjs';

test('release gate rejects missing, unsigned, stale and altered evidence', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mes-readiness-test-'));
  const commit = 'b'.repeat(40), version = '0.1.0';
  const file = join(dir, 'evidence.json');
  const checks = Object.fromEntries(['clean_install', 'license_review', 'two_device_boot', 'play_store', 'youtube_preinstalled', 'navigation', 'independent_shutdown', 'persistence', 'screen_performance', 'native_video', 'upgrade_preservation'].map(key => [key, 'passed']));
  async function fixture(path) {
    const contents = 'synthetic test fixture ' + path;
    await writeFile(join(dir, path), contents);
    return { path, sha256: createHash('sha256').update(contents).digest('hex') };
  }
  try {
    const evidence = { schema: 1, commit, version, platforms: [
      { platform: 'macos-arm64', signing: 'developer-id-notarized', owner_reviewed: true, checks: { ...checks }, artifact: await fixture('mac.dmg'), report: await fixture('mac-report.json') },
      { platform: 'windows-x64', signing: 'authenticode-verified', owner_reviewed: true, checks: { ...checks }, artifact: await fixture('win.exe'), report: await fixture('win-report.json') },
    ] };
    for (const [index, record] of evidence.platforms.entries()) {
      const path = `candidate-${index}.json`;
      const contents = JSON.stringify({ schema: 1, product: 'Multi-Emulator Studio', commit, version, platform: record.platform, signing: record.signing, distribution: 'signed-candidate', artifacts: [{ ...record.artifact, bytes: Buffer.byteLength('synthetic test fixture ' + record.artifact.path) }] });
      await writeFile(join(dir, path), contents);
      record.manifest = { path, sha256: createHash('sha256').update(contents).digest('hex') };
    }
    const save = () => writeFile(file, JSON.stringify(evidence));
    await save();
    assert.equal((await verifyReleaseReadiness(file, commit, version)).platforms.length, 2);
    await assert.rejects(verifyReleaseReadiness(file, 'c'.repeat(40), version), /commit\/version/);
    evidence.platforms[0].checks.native_video = 'pending'; await save();
    await assert.rejects(verifyReleaseReadiness(file, commit, version), /native_video/);
    evidence.platforms[0].checks.native_video = 'passed';
    evidence.platforms[1].signing = 'unsigned'; await save();
    await assert.rejects(verifyReleaseReadiness(file, commit, version), /production signing/);
    evidence.platforms[1].signing = 'authenticode-verified'; await save();
    await writeFile(join(dir, 'win.exe'), 'changed');
    await assert.rejects(verifyReleaseReadiness(file, commit, version), /checksum mismatch/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeCandidateManifest } from './candidate-manifest.mjs';

test('artifact manifest binds bytes, build type and exact commit', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mes-candidate-test-'));
  try {
    await mkdir(join(dir, 'dmg'));
    await writeFile(join(dir, 'dmg', 'fixture.dmg'), 'fixture');
    const commit = 'a'.repeat(40);
    const report = await writeCandidateManifest(dir, 'macos-arm64-development', commit, '0.1.0');
    assert.equal(report.commit, commit);
    assert.equal(report.signing, 'ad-hoc');
    assert.equal(report.distribution, 'development');
    assert.equal(report.artifacts[0].bytes, 7);
    assert.deepEqual(JSON.parse(await readFile(join(dir, 'CANDIDATE.json'), 'utf8')), report);
    await assert.rejects(writeCandidateManifest(dir, 'macos-arm64-development', 'short', '0.1.0'), /commit/);
    await assert.rejects(writeCandidateManifest(dir, 'windows-x64-development', commit, '0.1.0'), /No .exe/);
    await assert.rejects(writeCandidateManifest(dir, 'unknown', commit, '0.1.0'), /Unsupported/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

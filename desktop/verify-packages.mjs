import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, stat, writeFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function verifyPackages(bundleDir, bundleKind) {
  const extension = { dmg: '.dmg', nsis: '.exe' }[bundleKind];
  if (!extension) throw new Error('Expected dmg or nsis bundle kind');
  const root = resolve(bundleDir);
  const packages = [];
  async function scan(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await scan(path);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(extension)) {
        packages.push(path);
      }
    }
  }
  await scan(root);
  if (!packages.length) throw new Error(`No ${extension} installers generated`);
  const lines = [];
  for (const path of packages.sort()) {
    if ((await stat(path)).size === 0) throw new Error('Empty installer: ' + path);
    const name = relative(root, path).split(sep).join('/');
    if (/[\r\n]/.test(name)) throw new Error('Invalid installer filename');
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(path)) hash.update(chunk);
    lines.push(`${hash.digest('hex')}  ${name}`);
  }
  await writeFile(join(root, 'SHA256SUMS.txt'), lines.join('\n') + '\n');
  return lines;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const lines = await verifyPackages(process.argv[2], process.argv[3]);
  console.log(`Verified ${lines.length} nonempty installer(s); SHA-256 manifest generated.`);
}

import { cp, mkdir } from 'node:fs/promises';
import path from 'node:path';
// Build first; this script only copies project files into its own dist directory.
await import('../esbuild.config.mjs');
const target = path.resolve('dist/source-project');
await mkdir(target, { recursive: true });
const files = ['src', 'tests', 'scripts', 'manifest.json', 'versions.json', 'package.json', 'package-lock.json',
  'tsconfig.json', 'vitest.config.ts', 'esbuild.config.mjs', '.gitignore', 'main.js', 'styles.css',
  'README.md', 'TESTING.md', 'CHANGELOG.md', '.github', 'LICENSE', 'THIRD_PARTY_NOTICES.md'];
for (const file of files) await cp(path.resolve(file), path.join(target, file), { recursive: true });
console.log('Source project copied to dist/source-project (node_modules and research notebooks excluded).');

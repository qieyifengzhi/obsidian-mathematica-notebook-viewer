import esbuild from 'esbuild';
import postcss from 'postcss';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const katexDir = path.dirname(require.resolve('katex/package.json'));
const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));

export async function buildStyles() {
  const css = postcss.parse(await readFile(path.join(katexDir, 'dist/katex.min.css'), 'utf8'));
  const fonts = new Map();
  css.walkAtRules('font-face', face => {
    face.walkDecls('src', decl => {
      const match = decl.value.match(/url\(([^)]+\.woff2)\)/);
      if (!match) throw new Error('KaTeX woff2 font not found');
      const filename = match[1].replace(/["']/g, '');
      fonts.set(filename, decl);
    });
  });
  for (const [font, decl] of fonts) {
    const data = await readFile(path.join(katexDir, 'dist', font));
    decl.value = `url(data:font/woff2;base64,${data.toString('base64')}) format('woff2')`;
  }
  // Avoid global font-family collisions with Obsidian or other KaTeX plugins.
  css.walkDecls(/font(-family)?$/, decl => { decl.value = decl.value.replace(/KaTeX_[A-Za-z]+/g, name => `MNB_${name}`); });
  css.walkRules(rule => {
    if (rule.parent?.type === 'atrule' && rule.parent.name === 'font-face') return;
    rule.selectors = rule.selectors.map(selector => `.mnb-viewer ${selector}`);
  });
  await writeFile('styles.css', '/* KaTeX MIT; fonts embedded for offline use. See THIRD_PARTY_NOTICES.md */\n' + css.toString() + '\n' + await readFile('src/styles.css', 'utf8'));
}

const worker = await esbuild.build({ entryPoints: ['src/worker.ts'], bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2020', minify: true });
const config = {
  entryPoints: ['src/main.ts'], bundle: true, outfile: 'main.js', format: 'cjs',
  platform: 'browser', target: 'es2020', external: ['obsidian'], minify: false,
  define: { __PARSER_WORKER__: JSON.stringify(worker.outputFiles[0].text) },
  banner: { js: `/* Mathematica Notebook Viewer ${manifest.version} | MIT | Includes KaTeX (MIT) */` },
};
await buildStyles();
if (process.argv.includes('--watch')) {
  // Rebuild the embedded worker too when parser or renderer sources change.
  const { watch } = await import('node:fs');
  const { spawn } = await import('node:child_process');
  await esbuild.build(config);
  let timer;
  watch('src', { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(() => spawn(process.execPath, ['esbuild.config.mjs'], { stdio: 'inherit' }), 200);
  });
} else {
  await esbuild.build(config);
  await mkdir('dist/mathematica-notebook-viewer', { recursive: true });
  for (const file of ['manifest.json', 'main.js', 'styles.css', 'README.md', 'TESTING.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md'])
    await writeFile(`dist/mathematica-notebook-viewer/${file}`, await readFile(file));
  console.log('Built dist/mathematica-notebook-viewer (plugin + documentation + licenses; offline fonts and worker embedded).');
}

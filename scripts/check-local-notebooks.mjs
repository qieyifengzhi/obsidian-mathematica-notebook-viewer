import { build } from 'esbuild';
import { readFile, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
const directory = process.argv[2];
if (!directory) throw new Error('Usage: npm run test:local -- "path/to/Reference_code" (read-only)');
const result = await build({ entryPoints: ['src/parser.ts'], bundle: true, write: false, format: 'esm', platform: 'node', target: 'es2022' });
const { parseNotebook } = await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'));
const flatten = items => items.flatMap(i => i.kind === 'cell' ? [i] : flatten(i.children));
const hash = buffer => createHash('sha256').update(buffer).digest('hex');
const rows = [];
for (const name of (await readdir(directory)).filter(n => /\.nb$/i.test(n)).sort()) {
  const filename = path.join(directory, name), before = await readFile(filename), metadata = await stat(filename);
  const parsed = parseNotebook(before.toString('utf8'));
  if (!parsed.ok) throw new Error(`${name}: ${parsed.error.message} at ${parsed.error.offset}`);
  const all = flatten(parsed.model.items);
  const inputs = all.filter(c => c.style === 'Input');
  const chinese = all.filter(c => c.text.includes('教学注释'));
  // Count the live source comments instead of trusting an earlier notebook revision's count.
  const expectedChinese = (before.toString('utf8').match(/【(?:集中模型)?教学注释/g) ?? []).length;
  if (/_Annotated/.test(name) && chinese.length !== expectedChinese) throw new Error(`${name}: expected ${expectedChinese} teaching comments, parsed ${chinese.length}`);
  const after = await readFile(filename);
  if (hash(before) !== hash(after)) throw new Error('Notebook hash changed unexpectedly');
  rows.push({ name, bytes: before.length, cells: parsed.model.cellCount, groups: parsed.model.groupCount,
    inputs: inputs.length, teachingCells: chinese.length,
    teachingStyles: chinese.reduce((counts, c) => ({ ...counts, [c.style]: (counts[c.style] ?? 0) + 1 }), {}),
    fallbackCells: all.filter(c => c.warnings.length).length,
    directFormulaCells: all.filter(c => c.codeSegments.some(s => s.kind === 'formula')).length,
    directReduceCells: all.filter(c => c.codeSegments.some(s => s.kind === 'formula' && /^Reduce\[/.test(s.text))).length,
    mathCells: all.filter(c => c.tex).length, elapsedMs: parsed.model.elapsedMs,
    sha256: hash(after), unchanged: true, modifiedUtc: metadata.mtime.toISOString() });
}
console.log(JSON.stringify({ checkedUtc: new Date().toISOString(), readOnly: true, notebooks: rows }, null, 2));

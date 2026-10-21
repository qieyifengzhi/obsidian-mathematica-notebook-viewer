import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  resolve: { alias: { obsidian: fileURLToPath(new URL('./tests/obsidian-mock.ts', import.meta.url)) } },
  define: { __PARSER_WORKER__: JSON.stringify('self.onmessage = () => {};') },
  test: { environment: 'jsdom', include: ['tests/**/*.test.ts'], restoreMocks: true, maxWorkers: 1 },
});

import { defineConfig } from 'vitest/config';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export default defineConfig({
  plugins: [{
    name: 'pulse-offline-shell',
    apply: 'build',
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        const files = Object.keys(bundle)
          .filter((file) => file === 'index.html' || /\.(js|css)$/.test(file))
          .map((file) => `/${file}`).sort();
        const worker = readFileSync(new URL('./src/offline-worker.js', import.meta.url), 'utf8');
        const html = bundle['index.html'];
        const version = createHash('sha256').update(JSON.stringify(files))
          .update(html?.type === 'asset' ? html.source : '')
          .update(worker).digest('hex').slice(0, 16);
        this.emitFile({
          type: 'asset',
          fileName: 'offline-worker.js',
          source: `const SHELL_FILES = ${JSON.stringify(files)};\n` +
            `const SHELL_HTML = ${JSON.stringify(html?.type === 'asset' ? String(html.source) : '')};\n` +
            `const SHELL_CACHE = "pulse-offline-shell-${version}";\n${worker}`,
        });
      },
    },
  }],
  test: {
    environment: 'jsdom',
  },
});

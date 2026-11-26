import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export function offlineShellPlugin() {
  return {
    name: 'navimuse-offline-shell',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const entries = Object.entries(bundle).filter(([name]) => !name.endsWith('.map')).sort(([a], [b]) => a.localeCompare(b));
      if (!bundle['index.html']) throw new Error('Offline shell requires the final built index.html');
      const hash = createHash('sha256');
      for (const [name, item] of entries) hash.update(name).update(item.type === 'chunk' ? item.code : item.source);
      const publicAssets = ['manifest.webmanifest', 'icon.svg'];
      for (const name of publicAssets) hash.update(name).update(readFileSync(new URL(`../public/${name}`, import.meta.url)));
      const template = readFileSync(new URL('./offline-shell-worker.js', import.meta.url), 'utf8');
      hash.update(template);
      const assets = [...new Set(['/index.html', ...entries.map(([name]) => `/${name}`), ...publicAssets.map(name => `/${name}`)])];
      this.emitFile({ type: 'asset', fileName: 'sw-v4.js', source: template
        .replace('__CACHE_NAME__', JSON.stringify(`navimuse-shell-v4-${hash.digest('hex').slice(0, 20)}`))
        .replace('__APP_SHELL__', JSON.stringify(assets)) });
    }
  };
}

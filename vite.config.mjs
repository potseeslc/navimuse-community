import { defineConfig } from 'vite';
import { offlineShellPlugin } from './scripts/offline-shell-plugin.mjs';

export default defineConfig({ plugins: [offlineShellPlugin()] });

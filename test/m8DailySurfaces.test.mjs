import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const homeSource = await readFile(new URL('../src/homeSurface.jsx', import.meta.url), 'utf8');
const librarySearchSource = await readFile(new URL('../src/librarySearchSurfaces.jsx', import.meta.url), 'utf8');
const stylesSource = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');

test('M8 Home names the primary destination consistently with navigation', () => {
  assert.match(homeSource, /<h1>Home<\/h1>/);
  assert.doesNotMatch(homeSource, /<h1>Listen<\/h1>/);
});

test('M8 Search exposes its input and groups results by music entity', () => {
  assert.match(librarySearchSource, /aria-label="Search songs, albums, and artists"/);
  assert.match(librarySearchSource, /className="search-result-groups"/);
  assert.match(librarySearchSource, /id="search-artists-title"/);
  assert.match(librarySearchSource, /id="search-albums-title"/);
  assert.match(librarySearchSource, /id="search-songs-title"/);
});

test('M8 daily surfaces use square artwork and flat tab/list hierarchy', () => {
  assert.match(stylesSource, /M8 daily surfaces: cinematic density/);
  assert.match(stylesSource, /\.album-cover,[\s\S]*?border-radius: 4px;/);
  assert.match(stylesSource, /\.library-filter-bar button\.active::after[\s\S]*?background: var\(--nm-accent\);/);
  assert.match(stylesSource, /\.result-list article,[\s\S]*?border-bottom: 1px solid var\(--nm-border\);[\s\S]*?border-radius: 0;/);
  assert.match(stylesSource, /\.library-card \{[\s\S]*?border-radius: 0;[\s\S]*?background: transparent;/);
});

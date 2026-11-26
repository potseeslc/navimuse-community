import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const settingsSource = await readFile(new URL('../src/sonicSettingsSurfaces.jsx', import.meta.url), 'utf8');
const librarySource = await readFile(new URL('../src/librarySearchSurfaces.jsx', import.meta.url), 'utf8');
const styles = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');

test('M8 Settings presents bounded real sections instead of one card stack', () => {
  for (const label of ['Playback', 'Appearance', 'Library', 'Account', 'Connections & status']) {
    assert.match(settingsSource, new RegExp(`'${label}'`));
  }
  assert.match(settingsSource, /aria-label="Settings sections"/);
  assert.match(settingsSource, /useState\('playback'\)/);
  assert.match(settingsSource, /const settingsSurfaceRef = useRef\(null\);/);
  assert.match(settingsSource, /const selectSettingsSection = \(key\) => \{[\s\S]*surface\.scrollTop = 0;[\s\S]*onSurfaceScroll\?\.\(\{ target: surface \}\);/);
  assert.match(settingsSource, /ref=\{settingsSurfaceRef\}[\s\S]*onClick=\{\(\) => selectSettingsSection\(key\)\}/);
  assert.match(settingsSource, /if \(locked\) \{[\s\S]*settings-locked-workspace[\s\S]*accountPanel/);
  assert.doesNotMatch(settingsSource, /visibleSection/);
  assert.doesNotMatch(settingsSource, /title="Storage"/);
  assert.match(styles, /\.settings-workspace\s*\{/);
  assert.match(styles, /grid-template-columns: 190px minmax\(0, 1fr\)/);
});

test('M8 playlist detail uses a dense semantic track table and compact responsive columns', () => {
  assert.match(librarySource, /className="playlist-track-table" role="table"/);
  assert.match(librarySource, /role="columnheader">Artist/);
  assert.match(librarySource, /role="columnheader">Album/);
  assert.match(styles, /\.playlist-track-head,/);
  assert.match(styles, /grid-template-columns: 42px minmax\(160px, 1\.2fr\)/);
  assert.match(styles, /@media \(max-width: 599px\)[\s\S]*\.playlist-detail-hero/);
});

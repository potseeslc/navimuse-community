import assert from 'node:assert/strict';
import test from 'node:test';
import {
  M8_COMPONENT_STATES,
  M8_CSS_CUSTOM_PROPERTIES,
  M8_DESIGN_TOKEN_VERSION,
  M8_MOTION,
  M8_RADII,
  M8_SPACING,
  M8_STRUCTURAL_COLORS,
  contrastRatio,
  validateArtworkPalette
} from '../src/designSystem.js';

test('M8 structural tokens are versioned and map to stable CSS properties', () => {
  assert.equal(M8_DESIGN_TOKEN_VERSION, 1);
  assert.equal(M8_CSS_CUSTOM_PROPERTIES['--nm-background'], M8_STRUCTURAL_COLORS.background);
  assert.equal(M8_CSS_CUSTOM_PROPERTIES['--nm-accent'], M8_STRUCTURAL_COLORS.accent);
  assert.equal(M8_SPACING.base, 8);
  assert.equal(M8_SPACING.optical, 4);
  assert.ok(M8_RADII.repeatedArtwork <= 8);
  assert.deepEqual(M8_MOTION.respond, { minimumMs: 80, maximumMs: 140 });
  assert.deepEqual(M8_MOTION.rearrange, { minimumMs: 180, maximumMs: 260 });
  assert.deepEqual(M8_MOTION.reveal, { minimumMs: 220, maximumMs: 360 });
});

test('fallback Cinematic Focus palette passes the frozen contrast contract', () => {
  const palette = {
    background: M8_STRUCTURAL_COLORS.background,
    surface: M8_STRUCTURAL_COLORS.surface,
    foreground: M8_STRUCTURAL_COLORS.foreground,
    mutedForeground: M8_STRUCTURAL_COLORS.mutedForeground,
    accent: M8_STRUCTURAL_COLORS.accent,
    accentForeground: M8_STRUCTURAL_COLORS.accentForeground,
    atmosphereA: M8_STRUCTURAL_COLORS.atmosphereA,
    atmosphereB: M8_STRUCTURAL_COLORS.atmosphereB
  };
  assert.equal(validateArtworkPalette(palette), palette);
  assert.ok(contrastRatio(palette.foreground, palette.background) >= 7);
  assert.ok(contrastRatio(palette.mutedForeground, palette.background) >= 4.5);
  assert.ok(contrastRatio(palette.accent, palette.background) >= 4.5);
  assert.ok(contrastRatio(palette.accentForeground, palette.accent) >= 4.5);
  assert.ok(contrastRatio(M8_STRUCTURAL_COLORS.focus, palette.background) >= 4.5);
  assert.ok(contrastRatio(M8_STRUCTURAL_COLORS.focus, palette.surface) >= 4.5);
});

test('palette validation fails closed on malformed and low-contrast colors', () => {
  const valid = {
    background: '#080b0f', surface: '#0f1419', foreground: '#f3f1ed',
    mutedForeground: '#a8a8a5', accent: '#ff5a36', accentForeground: '#080b0f',
    atmosphereA: '#341712', atmosphereB: '#112833'
  };
  assert.equal(validateArtworkPalette({ ...valid, foreground: '#nothex' }), null);
  assert.equal(validateArtworkPalette({ ...valid, foreground: '#151b22' }), null);
  assert.equal(validateArtworkPalette({ ...valid, accentForeground: '#f3f1ed' }), null);
});

test('component state vocabulary includes degraded and preference variants', () => {
  assert.deepEqual(M8_COMPONENT_STATES, [
    'default', 'hover', 'focus-visible', 'active', 'selected',
    'disabled-with-reason', 'loading', 'success', 'empty', 'error',
    'offline', 'locked', 'stale', 'reduced-motion', 'reduced-transparency'
  ]);
});

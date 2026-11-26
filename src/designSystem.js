export const M8_DESIGN_TOKEN_VERSION = 1;

export const M8_STRUCTURAL_COLORS = Object.freeze({
  background: '#080b0f',
  surface: '#0f1419',
  surfaceRaised: '#151b22',
  foreground: '#f3f1ed',
  mutedForeground: '#a8a8a5',
  border: '#29313a',
  accent: '#ff5a36',
  accentForeground: '#080b0f',
  focus: '#ff7255',
  atmosphereA: '#341712',
  atmosphereB: '#112833'
});

export const M8_SPACING = Object.freeze({
  optical: 4,
  base: 8,
  controlGap: 12,
  sectionGap: 24,
  surfaceInset: 32
});

export const M8_RADII = Object.freeze({
  control: 6,
  repeatedArtwork: 8,
  dialog: 12
});

export const M8_MOTION = Object.freeze({
  respond: Object.freeze({ minimumMs: 80, maximumMs: 140 }),
  rearrange: Object.freeze({ minimumMs: 180, maximumMs: 260 }),
  reveal: Object.freeze({ minimumMs: 220, maximumMs: 360 }),
  atmosphere: Object.freeze({ minimumMs: 350, maximumMs: 600 })
});

export const M8_COMPONENT_STATES = Object.freeze([
  'default',
  'hover',
  'focus-visible',
  'active',
  'selected',
  'disabled-with-reason',
  'loading',
  'success',
  'empty',
  'error',
  'offline',
  'locked',
  'stale',
  'reduced-motion',
  'reduced-transparency'
]);

export const M8_CSS_CUSTOM_PROPERTIES = Object.freeze({
  '--nm-background': M8_STRUCTURAL_COLORS.background,
  '--nm-surface': M8_STRUCTURAL_COLORS.surface,
  '--nm-surface-raised': M8_STRUCTURAL_COLORS.surfaceRaised,
  '--nm-foreground': M8_STRUCTURAL_COLORS.foreground,
  '--nm-muted-foreground': M8_STRUCTURAL_COLORS.mutedForeground,
  '--nm-border': M8_STRUCTURAL_COLORS.border,
  '--nm-accent': M8_STRUCTURAL_COLORS.accent,
  '--nm-accent-foreground': M8_STRUCTURAL_COLORS.accentForeground,
  '--nm-focus': M8_STRUCTURAL_COLORS.focus,
  '--nm-atmosphere-a': M8_STRUCTURAL_COLORS.atmosphereA,
  '--nm-atmosphere-b': M8_STRUCTURAL_COLORS.atmosphereB
});

export function contrastRatio(foreground, background) {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

export function validateArtworkPalette(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const required = [
    'background', 'surface', 'foreground', 'mutedForeground',
    'accent', 'accentForeground', 'atmosphereA', 'atmosphereB'
  ];
  if (required.some((key) => !isHexColor(value[key]))) return null;
  const surfaces = [value.background, value.surface, value.surfaceRaised ?? M8_STRUCTURAL_COLORS.surfaceRaised, value.atmosphereA, value.atmosphereB];
  if (surfaces.some(color => !isHexColor(color))) return null;
  for (const surface of surfaces) {
    if (contrastRatio(value.foreground, surface) < 7) return null;
    if (contrastRatio(value.mutedForeground, surface) < 4.5) return null;
    if (contrastRatio(value.accent, surface) < 4.5) return null;
  }
  if (contrastRatio(value.accentForeground, value.accent) < 4.5) return null;
  return value;
}

function relativeLuminance(hex) {
  if (!isHexColor(hex)) throw new TypeError(`Expected a six-digit hex color, received ${String(hex)}`);
  const channels = hex.slice(1).match(/.{2}/g).map((value) => Number.parseInt(value, 16) / 255);
  const [red, green, blue] = channels.map((value) => (
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  ));
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function isHexColor(value) {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}

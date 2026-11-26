import { ATLAS_CONTRACT_VERSION } from './constants.js';

export class AtlasContractValidationError extends TypeError {
  constructor(path, message) {
    super(`${path}: ${message}`);
    this.name = 'AtlasContractValidationError';
    this.path = path;
  }
}

export function fail(path, message) { throw new AtlasContractValidationError(path, message); }
export function object(value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, 'expected object');
  return value;
}
export function exactKeys(value, allowed, required, path) {
  object(value, path);
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) if (!allowedSet.has(key)) fail(`${path}.${key}`, 'unknown field');
  for (const key of required) if (!Object.hasOwn(value, key)) fail(`${path}.${key}`, 'required field is missing');
}
export function literal(value, expected, path) { if (value !== expected) fail(path, `expected ${JSON.stringify(expected)}`); return value; }
export function contractVersion(value, path = 'contractVersion') { return literal(value, ATLAS_CONTRACT_VERSION, path); }
export function opaqueId(value, path) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 128 || !/^[A-Za-z0-9._~-]+$/.test(value)) fail(path, 'expected opaque identifier');
  return value;
}
export function opaqueReference(value, path) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 1024 || !/^[A-Za-z0-9._~-]+$/.test(value)) fail(path, 'expected opaque transport reference');
  return value;
}
export function sha256(value, path) {
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(value)) fail(path, 'expected sha256:<64 lowercase hex>');
  return value;
}
export function finite(value, path) { if (!Number.isFinite(value)) fail(path, 'expected finite number'); return value === 0 ? 0 : value; }
export function safeInteger(value, path, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isSafeInteger(value) || value < min || value > max) fail(path, `expected safe integer from ${min} through ${max}`);
  return value;
}
export function boundedString(value, path, { min = 1, max = 240 } = {}) {
  if (typeof value !== 'string' || value.length < min || value.length > max) fail(path, `expected string length ${min}..${max}`);
  return value;
}
export function isoTimestamp(value, path) {
  if (typeof value !== 'string' || !value.endsWith('Z') || Number.isNaN(Date.parse(value)) || new Date(value).toISOString() !== value) fail(path, 'expected canonical UTC ISO timestamp');
  return value;
}
export function optional(value, parser) { return value === undefined ? undefined : parser(value); }
export function deeplyFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deeplyFreeze(child);
  }
  return value;
}
export function unique(values, path) { if (new Set(values).size !== values.length) fail(path, 'values must be unique'); }

const forbidden = /^(password|token|authorization|cookie|streamurl|serviceurl|baseurl|path|navidromeid|audiomuseid|embedding|upstream|stack|cause|headers?|credentials?|sessionid)$/i;
export function assertNoForbiddenAtlasFields(value, path = '$', limits = {}) {
  const maxDepth = limits.maxDepth ?? 16, maxNodes = limits.maxNodes ?? 100_000, visited = new WeakSet(); let nodes = 0;
  function walk(current, currentPath, depth) {
    if (!current || typeof current !== 'object') return;
    if (depth > maxDepth) fail(currentPath, 'maximum nesting depth exceeded');
    if (visited.has(current)) fail(currentPath, 'cyclic object is not valid JSON contract data');
    visited.add(current);
    for (const key of Object.keys(current)) {
      nodes += 1; if (nodes > maxNodes) fail(currentPath, 'maximum contract node budget exceeded');
      if (forbidden.test(key)) fail(`${currentPath}.${key}`, 'forbidden private or credential-bearing field');
      const descriptor = Object.getOwnPropertyDescriptor(current, key);
      if (!descriptor || !('value' in descriptor)) fail(`${currentPath}.${key}`, 'accessor fields are not allowed');
      walk(descriptor.value, `${currentPath}.${key}`, depth + 1);
    }
  }
  walk(value, path, 0);
}

import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { redactSupportText } from './support-redaction.mjs';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
function parseCommandTimeoutMs(value, fallback) {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
const commandTimeoutMs = parseCommandTimeoutMs(process.env.NAVIMUSE_DIAGNOSTICS_COMMAND_TIMEOUT_MS, 30000);
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const tauriConfig = JSON.parse(readFileSync(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'));
const appBundlePath = fileURLToPath(new URL('../src-tauri/target/aarch64-apple-darwin/release/bundle/macos/NaviMuse.app', import.meta.url));
const diagnosticsDir = resolve(repoRoot, '.scratch/diagnostics');
const createdAt = new Date().toISOString();
const outputPath = resolve(diagnosticsDir, `navimuse-macos-diagnostics-${createdAt.replace(/[:.]/g, '-')}.json`);
const maxCommandOutputChars = parseCommandTimeoutMs(process.env.NAVIMUSE_DIAGNOSTICS_MAX_OUTPUT_CHARS, 12000);
const collectedCommandAllowlist = [
  'git rev-parse HEAD',
  'git branch --show-current',
  'git status --porcelain',
  'sw_vers',
  'uname -m',
  'node --version',
  'npm --version',
  'rustc --version',
  'cargo --version',
  'tauri --version'
];
const excludedDataCategories = [
  'cookies',
  'service credentials',
  'settings.json',
  'settings.key',
  'setup tokens',
  'OIDC secrets',
  'Docker secrets',
  'keychain entries',
  'queue contents',
  'library metadata',
  'listening history',
  'browser storage',
  'full system logs'
];

function commandOutput(command, args = []) {
  try {
    return boundedSupportText(execFileSync(command, args, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: commandTimeoutMs
    }).trim());
  } catch (error) {
    const timedOut = error.signal === 'SIGTERM' || error.code === 'ETIMEDOUT';
    const output = [error.message, error.stdout, error.stderr].filter(Boolean).join('\n').trim();
    return boundedSupportText(`${timedOut ? 'timed-out' : 'unavailable'}: ${output}`);
  }
}

function boundedSupportText(value) {
  const redacted = redactSupportText(String(value));
  if (redacted.length <= maxCommandOutputChars) return redacted;
  return `${redacted.slice(0, maxCommandOutputChars)}\n[truncated after ${maxCommandOutputChars} redacted characters]`;
}

function releaseRelevantTauriConfig(config) {
  return {
    productName: config.productName,
    version: config.version,
    identifier: config.identifier,
    app: {
      windows: (config.app?.windows || []).map((window) => ({
        title: window.title,
        width: window.width,
        height: window.height,
        minWidth: window.minWidth,
        minHeight: window.minHeight,
        resizable: window.resizable,
        fullscreen: window.fullscreen
      })),
      security: {
        csp: config.app?.security?.csp ?? null
      }
    },
    bundle: {
      active: config.bundle?.active,
      targets: config.bundle?.targets,
      category: config.bundle?.category,
      macOS: {
        minimumSystemVersion: config.bundle?.macOS?.minimumSystemVersion
      }
    }
  };
}

function serviceCredentialEnvironmentSummary() {
  const names = Object.keys(process.env)
    .filter((key) => /^(NAVIDROME|AUDIOMUSE|POCKET_ID|NAVIMUSE)_/i.test(key) && /(?:PASSWORD|TOKEN|SECRET|COOKIE|SESSION|API[_-]?KEY)/i.test(key))
    .sort();
  const prefixes = [...new Set(names.map((key) => {
    if (/^AUDIOMUSE_/i.test(key)) return 'AUDIOMUSE';
    if (/^NAVIDROME_/i.test(key)) return 'NAVIDROME';
    if (/^NAVIMUSE_/i.test(key)) return 'NAVIMUSE';
    if (/^POCKET_ID_/i.test(key)) return 'POCKET_ID';
    return 'UNKNOWN';
  }))].sort();
  return {
    count: names.length,
    prefixes
  };
}

function redactedBffOrigin() {
  return redactSupportText(process.env.VITE_NAVIMUSE_BFF_ORIGIN || 'unset');
}

const diagnostics = {
  diagnosticType: 'navimuse-macos-support-diagnostics',
  contract: 'docs/support-diagnostics.md',
  createdAt,
  commandTimeoutMs,
  maxCommandOutputChars,
  repository: {
    commit: commandOutput('git', ['rev-parse', 'HEAD']),
    branch: commandOutput('git', ['branch', '--show-current']),
    dirtyState: commandOutput('git', ['status', '--porcelain'])
  },
  package: {
    name: packageJson.name,
    version: packageJson.version,
    nodeEngine: packageJson.engines?.node || null
  },
  environment: {
    bffOrigin: redactedBffOrigin(),
    serviceCredentialVariables: serviceCredentialEnvironmentSummary(),
    macos: commandOutput('sw_vers'),
    arch: commandOutput('uname', ['-m']),
    node: commandOutput('node', ['--version']),
    npm: commandOutput('npm', ['--version']),
    rustc: commandOutput('rustc', ['--version']),
    cargo: commandOutput('cargo', ['--version']),
    tauriCli: commandOutput(resolve(repoRoot, 'node_modules/.bin/tauri'), ['--version'])
  },
  appBundle: {
    path: appBundlePath,
    exists: existsSync(appBundlePath)
  },
  tauri: releaseRelevantTauriConfig(tauriConfig),
  releaseEvidence: {
    command: 'npm --silent run native:macos:m7-evidence',
    summary: 'Run this command separately to capture one parseable JSON M7 release evidence object for the same commit.'
  },
  collectedCommandAllowlist,
  excludedDataCategories,
  exclusions: excludedDataCategories,
  collectionPolicy: 'The diagnostics JSON is built only from the fields above and the collectedCommandAllowlist; excludedDataCategories are listed as non-collected categories, not as values read from disk, browser storage, keychain, Docker, or service configuration.'
};

mkdirSync(dirname(outputPath), { recursive: true, mode: 0o700 });
chmodSync(dirname(outputPath), 0o700);
writeFileSync(outputPath, `${JSON.stringify(diagnostics, null, 2)}\n`, { mode: 0o600 });
console.log(outputPath);

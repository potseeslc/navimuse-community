import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { redactSupportText } from './support-redaction.mjs';

const shouldBuild = process.argv.includes('--build');
const bffOrigin = process.env.VITE_NAVIMUSE_BFF_ORIGIN || '';
const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const appBundlePath = fileURLToPath(new URL('../src-tauri/target/aarch64-apple-darwin/release/bundle/macos/NaviMuse.app', import.meta.url));
const distDir = fileURLToPath(new URL('../dist', import.meta.url));

function parseCommandTimeoutMs(value, fallback) {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const commandTimeoutMs = parseCommandTimeoutMs(process.env.NAVIMUSE_MACOS_EVIDENCE_COMMAND_TIMEOUT_MS, 1200000);
const environmentCommandTimeoutMs = parseCommandTimeoutMs(process.env.NAVIMUSE_MACOS_EVIDENCE_ENV_COMMAND_TIMEOUT_MS, 30000);

function redactedBffOrigin() {
  return redactSupportText(bffOrigin || 'unset');
}

function commandOutput(command, args = []) {
  try {
    return redactSupportText(execFileSync(command, args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: environmentCommandTimeoutMs }).trim());
  } catch (error) {
    const timedOut = error.signal === 'SIGTERM' || error.code === 'ETIMEDOUT';
    const output = [error.message, error.stdout, error.stderr].filter(Boolean).join('\n').trim();
    return redactSupportText(`${timedOut ? 'timed-out' : 'unavailable'}: ${output}`);
  }
}

function serviceCredentialEnvironmentVariables() {
  return Object.keys(process.env)
    .filter((key) => /^(NAVIDROME|AUDIOMUSE)_/i.test(key))
    .sort();
}

function distFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) return distFiles(path);
    return stat.isFile() ? [path] : [];
  });
}

function distCredentialMatches() {
  const textExtensions = new Set(['.css', '.html', '.js', '.json', '.map', '.txt']);
  return distFiles(distDir)
    .filter((path) => textExtensions.has(extname(path)))
    .flatMap((path) => {
      const contents = readFileSync(path, 'utf8');
      return [
        /NAVIDROME_/i.test(contents) ? 'NAVIDROME_' : '',
        /AUDIOMUSE_/i.test(contents) ? 'AUDIOMUSE_' : ''
      ].filter(Boolean).map((match) => `${match} in ${path.slice(dirname(distDir).length + 1)}`);
    });
}

const evidence = {
  commit: commandOutput('git', ['rev-parse', 'HEAD']),
  dirtyState: commandOutput('git', ['status', '--porcelain']),
  packageVersion: packageJson.version || 'unknown',
  macos: commandOutput('sw_vers'),
  arch: commandOutput('uname', ['-m']),
  rustc: commandOutput('rustc', ['--version']),
  cargo: commandOutput('cargo', ['--version']),
  rustupTargets: commandOutput('rustup', ['target', 'list', '--installed']),
  node: commandOutput('node', ['--version']),
  npm: commandOutput('npm', ['--version']),
  tauriCli: commandOutput(resolve(repoRoot, 'node_modules/.bin/tauri'), ['--version']),
  bffOrigin: redactedBffOrigin(),
  evidenceCommand: 'npm run native:macos:evidence',
  clientServiceCredentials: {
    environmentVariables: serviceCredentialEnvironmentVariables(),
    distAssetMatches: distCredentialMatches()
  },
  manualEvidenceRequired: ['signingIdentity', 'notarizationStatus', 'realSessionLifecycle'],
  buildCommand: 'VITE_NAVIMUSE_BFF_ORIGIN=<deployed-bff-origin> npm run tauri:build',
  appBundlePath,
  appBundleExists: false,
  buildAttempted: shouldBuild,
  buildStatus: 'not-run'
};

if (shouldBuild) {
  if (!bffOrigin) {
    evidence.buildStatus = 'skipped: VITE_NAVIMUSE_BFF_ORIGIN is required';
  } else if (String(evidence.rustc).startsWith('unavailable:') || String(evidence.cargo).startsWith('unavailable:')) {
    evidence.buildStatus = 'skipped: rustc and cargo are required';
  } else {
    try {
      execFileSync('npm', ['run', 'tauri:build'], {
        cwd: repoRoot,
        stdio: 'inherit',
        timeout: commandTimeoutMs,
        env: { ...process.env, VITE_NAVIMUSE_BFF_ORIGIN: bffOrigin }
      });
      evidence.buildStatus = existsSync(appBundlePath) ? 'passed' : 'failed: app bundle was not created';
    } catch (error) {
      const timedOut = error.signal === 'SIGTERM' || error.code === 'ETIMEDOUT';
      const output = [error.message, error.stdout, error.stderr].filter(Boolean).join('\n').trim();
      evidence.buildStatus = redactSupportText(`${timedOut ? 'timed-out' : 'failed'}: ${output}`);
    }
  }
}

evidence.appBundleExists = existsSync(evidence.appBundlePath);

console.log(JSON.stringify(evidence, null, 2));

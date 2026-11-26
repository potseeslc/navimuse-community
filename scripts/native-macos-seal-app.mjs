import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { signingIdentityPreflight } from './macos-signing-identities.mjs';
import { redactSupportText } from './support-redaction.mjs';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const appBundlePath = fileURLToPath(new URL('../src-tauri/target/aarch64-apple-darwin/release/bundle/macos/NaviMuse.app', import.meta.url));
const entitlementsPath = fileURLToPath(new URL('../src-tauri/entitlements.plist', import.meta.url));
function parseCommandTimeoutMs(value, fallback) {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
const commandTimeoutMs = parseCommandTimeoutMs(process.env.NAVIMUSE_MACOS_SEAL_TIMEOUT_MS, 120000);
const identityArgIndex = process.argv.indexOf('--identity');
const explicitIdentity = identityArgIndex >= 0 ? process.argv[identityArgIndex + 1] : null;
const identityArgumentMissing = identityArgIndex >= 0 && (!explicitIdentity || explicitIdentity.startsWith('--'));
const identity = identityArgIndex >= 0 && !identityArgumentMissing
  ? explicitIdentity
  : process.env.NAVIMUSE_MACOS_CODESIGN_IDENTITY || '-';
const requireReleaseIdentity = process.argv.includes('--release');
const identityArgumentInvalid = identity !== '-' && identity.startsWith('-');

function commandStatus(command, args) {
  try {
    return {
      status: 'passed',
      output: redactSupportText(execFileSync(command, args, {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: commandTimeoutMs
      }).trim())
    };
  } catch (error) {
    const timedOut = error.signal === 'SIGTERM' || error.code === 'ETIMEDOUT';
    return {
      status: timedOut ? 'timed-out' : 'unavailable',
      output: redactSupportText([error.message, error.stdout, error.stderr].filter(Boolean).join('\n').trim())
    };
  }
}

const availableIdentities = requireReleaseIdentity && identity !== '-' && !identityArgumentInvalid
  ? commandStatus('security', ['find-identity', '-v', '-p', 'codesigning'])
  : { status: 'not-run', output: '' };
const identityPreflight = availableIdentities.status === 'passed'
  ? signingIdentityPreflight(identity, availableIdentities.output)
  : { status: 'ready', matchingFingerprints: [] };

const evidence = {
  evidenceType: 'native-macos-app-seal',
  createdAt: new Date().toISOString(),
  appBundlePath,
  appBundleExists: existsSync(appBundlePath),
  identity: identity === '-' ? 'adhoc' : identity,
  signingIdentityMatchCount: identityPreflight.matchingFingerprints.length,
  signingIdentityFingerprints: identityPreflight.matchingFingerprints,
  releaseIdentityRequired: requireReleaseIdentity,
  hardenedRuntime: requireReleaseIdentity,
  entitlementsPath: requireReleaseIdentity ? entitlementsPath : null,
  sealAttempted: false,
  sealStatus: 'not-run',
  verification: { status: 'not-run' },
  m7ReleaseNote: 'Ad-hoc sealing can prove local bundle resources are sealed, but M7 release exit still requires Developer ID signing, notarization, Gatekeeper pass, and pinned-device manual evidence.'
};

if (identityArgumentMissing) {
  evidence.sealStatus = 'unavailable';
  evidence.verification = { status: 'not-run', reason: '--identity requires a signing identity value' };
} else if (identityArgumentInvalid) {
  evidence.sealStatus = 'unavailable';
  evidence.verification = { status: 'not-run', reason: 'signing identity must not start with -' };
} else if (!evidence.appBundleExists) {
  evidence.sealStatus = 'unavailable';
  evidence.verification = { status: 'not-run', reason: 'app bundle does not exist' };
} else if (identityPreflight.status === 'ambiguous') {
  evidence.sealStatus = 'unavailable';
  evidence.verification = {
    status: 'not-run',
    reason: 'multiple valid certificates share this signing identity name; rerun with one listed SHA-1 fingerprint'
  };
} else if (requireReleaseIdentity && identity === '-') {
  evidence.sealStatus = 'unavailable';
  evidence.verification = { status: 'not-run', reason: 'release sealing requires NAVIMUSE_MACOS_CODESIGN_IDENTITY or --identity' };
} else {
  const signArgs = ['--force', '--sign', identity, appBundlePath];
  signArgs.splice(1, 0, '--deep');
  if (requireReleaseIdentity) {
    signArgs.splice(1, 0, '--options', 'runtime', '--entitlements', entitlementsPath);
  }
  evidence.sealAttempted = true;
  const seal = commandStatus('codesign', signArgs);
  evidence.sealStatus = seal.status;
  evidence.sealOutput = seal.output;
  evidence.verification = seal.status === 'passed'
    ? commandStatus('codesign', ['--verify', '--deep', '--strict', '--verbose=2', appBundlePath])
    : { status: 'not-run', reason: 'app seal did not pass; see sealOutput' };
}

console.log(JSON.stringify(evidence, null, 2));
process.exitCode = evidence.sealStatus === 'passed' && evidence.verification.status === 'passed' ? 0 : 1;

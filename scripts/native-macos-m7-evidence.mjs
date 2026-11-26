import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { redactSupportText } from './support-redaction.mjs';

const shouldBuild = process.argv.includes('--build');
const shouldVerify = process.argv.includes('--verify');
const shouldReleaseSeal = process.argv.includes('--release');
const releaseCodesignIdentity = (process.env.NAVIMUSE_MACOS_CODESIGN_IDENTITY || '').trim();
const releaseIdentityIsExplicit = releaseCodesignIdentity.length > 0 && !releaseCodesignIdentity.startsWith('-');
function parseCommandTimeoutMs(value, fallback) {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
const commandTimeoutMs = parseCommandTimeoutMs(process.env.NAVIMUSE_M7_COMMAND_TIMEOUT_MS, 1200000);
const environmentCommandTimeoutMs = parseCommandTimeoutMs(process.env.NAVIMUSE_M7_ENV_COMMAND_TIMEOUT_MS, 30000);
const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const appBundlePath = fileURLToPath(new URL('../src-tauri/target/aarch64-apple-darwin/release/bundle/macos/NaviMuse.app', import.meta.url));
const distDir = fileURLToPath(new URL('../dist', import.meta.url));
const bffOrigin = process.env.VITE_NAVIMUSE_BFF_ORIGIN || '';
const releaseCandidateStartedAt = new Date().toISOString();
const credentialMarkerPatterns = Object.freeze([
  ['NAVIDROME_', /NAVIDROME_/i],
  ['AUDIOMUSE_', /AUDIOMUSE_/i],
  ['NAVIMUSE_SETUP_TOKEN', /NAVIMUSE_SETUP_TOKEN/i],
  ['POCKET_ID_', /POCKET_ID_/i],
  ['OIDC client secret', /OIDC[_-]?CLIENT[_-]?SECRET|CLIENT[_-]?SECRET/i],
  ['API key', /API[_-]?KEY/i],
  ['provider private id', /PROVIDER[_-]?(?:ID|SECRET|TOKEN)|POCKET[_-]?ID[_-]?(?:SECRET|TOKEN)/i]
]);
const credentialMarkerLabels = credentialMarkerPatterns.map(([label]) => label);

function commandOutput(command, args = []) {
  try {
    return redactSupportText(execFileSync(command, args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: environmentCommandTimeoutMs }).trim());
  } catch (error) {
    const timedOut = error.signal === 'SIGTERM' || error.code === 'ETIMEDOUT';
    const output = [error.message, error.stdout, error.stderr].filter(Boolean).join('\n').trim();
    return redactSupportText(`${timedOut ? 'timed-out' : 'unavailable'}: ${output}`);
  }
}

function commandStatusWithStderr(command, args = []) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: commandTimeoutMs
  });
  const output = redactSupportText([result.stdout, result.stderr].filter(Boolean).join('\n').trim());
  const timedOut = result.signal === 'SIGTERM' || result.error?.code === 'ETIMEDOUT';
  if (result.error) {
    return {
      status: timedOut ? 'timed-out' : 'unavailable',
      output: redactSupportText([result.error.message, result.stdout, result.stderr].filter(Boolean).join('\n').trim())
    };
  }
  if (timedOut) {
    return {
      status: 'timed-out',
      output
    };
  }
  return {
    status: result.status === 0 ? 'passed' : 'unavailable',
    output
  };
}

function pending(instruction) {
  return {
    status: 'pending-manual-validation',
    instruction
  };
}

function movedToM8(contract, instruction, extra = {}) {
  return {
    status: 'moved-to-m8-release-readiness',
    contract,
    instruction,
    ...extra
  };
}

function incompleteEvidenceItems(record) {
  const automated = Object.entries(record.automatedChecks)
    .filter(([, value]) => value?.status && value.status !== 'passed')
    .map(([name, value]) => ({
      area: `automatedChecks.${name}`,
      status: value.status,
      reason: value.reason || null
    }));
  const manual = Object.entries(record.manualEvidence)
    .filter(([, value]) => value?.status !== 'passed' && value?.status !== 'moved-to-m8-release-readiness')
    .map(([name, value]) => ({
      area: `manualEvidence.${name}`,
      status: value.status,
      contract: value.contract || null,
      instruction: value.instruction
    }));
  const releaseCandidate = record.buildStatus === 'passed' ? [] : [{
    area: 'buildStatus',
    status: record.buildStatus
  }];
  return [...releaseCandidate, ...automated, ...manual];
}

function serviceCredentialEnvironmentVariables() {
  return Object.keys(process.env)
    .filter((key) => /^(NAVIDROME|AUDIOMUSE|POCKET_ID|NAVIMUSE)_/i.test(key) && /(?:PASSWORD|TOKEN|SECRET|COOKIE|SESSION|API[_-]?KEY)/i.test(key))
    .sort();
}

function distFiles(dir, { depth = 0, maxDepth = 6 } = {}) {
  if (!existsSync(dir)) return [];
  if (depth > maxDepth) return [`unscanned: max-depth-exceeded ${dir}`];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch (error) {
    return [`unscanned: unreadable-dir ${redactSupportText(dir)}: ${redactSupportText(error.message)}`];
  }
  return entries.flatMap((entry) => {
    const path = join(dir, entry);
    let stat;
    try {
      stat = lstatSync(path);
    } catch (error) {
      return [`unscanned: unreadable-entry ${redactSupportText(path)}: ${redactSupportText(error.message)}`];
    }
    if (stat.isSymbolicLink()) return [`unscanned: symlink ${redactSupportText(path)}`];
    if (stat.isDirectory()) return distFiles(path, { depth: depth + 1, maxDepth });
    return stat.isFile() ? [path] : [];
  });
}

function bundleFiles(dir, { root = dir, depth = 0, maxDepth = 12 } = {}) {
  if (!existsSync(dir)) return { files: [], unscanned: [`missing bundle ${dir}`] };
  if (depth > maxDepth) return { files: [], unscanned: [`max-depth-exceeded ${dir}`] };
  let entries;
  try {
    entries = readdirSync(dir).sort();
  } catch (error) {
    return { files: [], unscanned: [`unreadable-dir ${dir}: ${error.message}`] };
  }
  return entries.reduce((result, entry) => {
    const path = join(dir, entry);
    let stat;
    try {
      stat = lstatSync(path);
    } catch (error) {
      result.unscanned.push(`unreadable-entry ${path}: ${error.message}`);
      return result;
    }
    if (stat.isSymbolicLink()) {
      result.unscanned.push(`symlink ${path}`);
      return result;
    }
    if (stat.isDirectory()) {
      const nested = bundleFiles(path, { root, depth: depth + 1, maxDepth });
      result.files.push(...nested.files);
      result.unscanned.push(...nested.unscanned);
      return result;
    }
    if (stat.isFile()) {
      result.files.push({
        path,
        relativePath: path.slice(root.length + 1),
        size: stat.size
      });
    }
    return result;
  }, { files: [], unscanned: [] });
}

function appBundleChecksum() {
  const { files, unscanned } = bundleFiles(appBundlePath);
  if (unscanned.length) {
    return {
      status: 'needs-review',
      algorithm: 'sha256',
      fileCount: files.length,
      unscanned
    };
  }
  const digest = createHash('sha256');
  for (const file of files.sort((a, b) => a.relativePath.localeCompare(b.relativePath))) {
    digest.update(file.relativePath);
    digest.update('\0');
    digest.update(String(file.size));
    digest.update('\0');
    digest.update(readFileSync(file.path));
    digest.update('\0');
  }
  return {
    status: 'passed',
    algorithm: 'sha256',
    treeSha256: digest.digest('hex'),
    fileCount: files.length,
    limitation: 'Directory tree digest covers sealed bundle file paths, sizes, and contents; distribution container checksums must still be recorded separately when packaging for notarization.'
  };
}

function distCredentialMatches() {
  const textExtensions = new Set(['.css', '.html', '.js', '.json', '.map', '.txt']);
  return distFiles(distDir)
    .filter((path) => path.startsWith('unscanned:') || textExtensions.has(extname(path)))
    .flatMap((path) => {
      if (path.startsWith('unscanned:')) return path;
      let contents;
      try {
        contents = readFileSync(path, 'utf8');
      } catch (error) {
        return `unscanned: unreadable-file ${redactSupportText(path)}: ${redactSupportText(error.message)}`;
      }
      return credentialMarkerPatterns
        .filter(([, pattern]) => pattern.test(contents))
        .map(([label]) => `${label} in ${path.slice(dirname(distDir).length + 1)}`);
    });
}

function clientServiceCredentialCheck() {
  const environmentVariables = serviceCredentialEnvironmentVariables();
  const distAssetMatches = distCredentialMatches();
  const unscannedDistAssets = distAssetMatches.filter((match) => match.startsWith('unscanned:'));
  const credentialMarkers = distAssetMatches.filter((match) => !match.startsWith('unscanned:'));
  const status = environmentVariables.length || credentialMarkers.length || unscannedDistAssets.length
    ? 'needs-review'
    : 'passed';
  return {
    status,
    environmentVariables,
    distAssetMatches,
    scannedPatterns: credentialMarkerLabels,
    scanPolicy: 'Pattern matches are reported as needs-review findings and never include matched credential values.',
    limitation: 'Automated scanning detects known NaviMuse credential markers; manual review is required for arbitrary literal credential values.'
  };
}

function signingPrerequisiteCheck() {
  const identities = commandStatusWithStderr('security', ['find-identity', '-v', '-p', 'codesigning']);
  const notarytool = commandStatusWithStderr('xcrun', ['notarytool', '--version']);
  const notarizationCredentialSource = process.env.NAVIMUSE_NOTARYTOOL_KEYCHAIN_PROFILE
    ? {
        status: 'passed',
        type: 'keychain-profile',
        variable: 'NAVIMUSE_NOTARYTOOL_KEYCHAIN_PROFILE',
        value: '[configured]'
      }
    : {
        status: 'needs-review',
        type: 'unset',
        instruction: 'Set NAVIMUSE_NOTARYTOOL_KEYCHAIN_PROFILE to the notarytool keychain profile name before release evidence capture; do not store notarization secrets in the repository or evidence JSON.'
      };
  const identityOutput = identities.output || '';
  const validIdentityMatch = identityOutput.match(/(\d+) valid identities found/);
  const validIdentityCount = validIdentityMatch ? Number.parseInt(validIdentityMatch[1], 10) : 0;
  const developerIdIdentities = identityOutput
    .split('\n')
    .filter((line) => /Developer ID Application/i.test(line))
    .map((line) => redactSupportText(line.trim()));
  return {
    status: validIdentityCount > 0 && developerIdIdentities.length > 0 && notarytool.status === 'passed' && notarizationCredentialSource.status === 'passed' ? 'passed' : 'needs-review',
    validIdentityCount,
    developerIdIdentityCount: developerIdIdentities.length,
    developerIdIdentities,
    notarytool: {
      status: notarytool.status,
      output: notarytool.output
    },
    notarizationCredentialSource,
    limitation: 'M7 release signing requires a Developer ID Application identity, notarytool, and a named notarization credential source; this check confirms local tool, identity, and credential-source availability only.'
  };
}

function rustTargetPrerequisiteCheck() {
  const installedTargets = commandStatusWithStderr('rustup', ['target', 'list', '--installed']);
  const output = installedTargets.output || '';
  const target = 'aarch64-apple-darwin';
  return {
    status: installedTargets.status === 'passed' && output.split(/\s+/).includes(target) ? 'passed' : 'needs-review',
    target,
    rustupTargets: installedTargets,
    limitation: 'M7 Apple Silicon release builds require the aarch64-apple-darwin Rust target before tauri:build can produce the pinned native bundle.'
  };
}

const evidence = {
  evidenceType: 'native-macos-m7-release-hardening',
  evidenceSchemaVersion: 1,
  releaseCandidateStartedAt,
  evidenceCommand: 'npm --silent run native:macos:m7-evidence',
  evidenceFlags: {
    build: shouldBuild,
    verify: shouldVerify,
    release: shouldReleaseSeal
  },
  commandTimeoutMs,
  environmentCommandTimeoutMs,
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
  tauriCli: commandOutput(`${repoRoot}/node_modules/.bin/tauri`, ['--version']),
  bffOrigin: redactSupportText(bffOrigin || 'unset'),
  appBundlePath,
  buildAttempted: shouldBuild,
  buildCommandInvoked: false,
  verificationAttempted: shouldVerify,
  releaseSealAttempted: shouldReleaseSeal,
  buildStatus: 'not-run',
  appBundleSignatureDetails: { status: 'not-run', reason: shouldBuild ? 'not checked before build completes' : 'no build in this evidence run' },
  automatedChecks: {
    productionBuild: { status: 'not-run' },
    testSuite: { status: 'not-run' },
    appBundleSeal: { status: 'not-run' },
    appBundleChecksum: { status: 'not-run' },
    appBundleCodesign: { status: 'not-run' },
    appBundleGatekeeper: { status: 'not-run' },
    clientServiceCredentials: clientServiceCredentialCheck(),
    rustTargetPrerequisites: rustTargetPrerequisiteCheck(),
    signingPrerequisites: signingPrerequisiteCheck()
  },
  manualEvidence: {
    signedArtifact: {
      ...movedToM8('docs/macos-m7-signing-notarization.md', 'Complete the documented Developer ID signed artifact proof against the M8 release candidate before public distribution.')
    },
    notarization: {
      ...movedToM8('docs/macos-m7-signing-notarization.md', 'Complete the documented Apple notarization and post-staple Gatekeeper proof against the M8 release candidate before public distribution.')
    },
    updateChannel: {
      ...movedToM8('docs/macos-m7-update-rollback.md', 'Complete the documented channel and rollback record against the signed M8 release candidate before public distribution.')
    },
    longSession: {
      ...movedToM8('docs/macos-m7-long-session.md', 'Complete the documented long-session run against the signed M8 release candidate before public distribution.')
    },
    webglRecovery: {
      ...movedToM8('docs/macos-m7-webgl-recovery.md', 'Complete the documented WebGL context-loss run against the signed M8 release candidate before public distribution.')
    },
    accessibility: {
      ...movedToM8('docs/macos-m7-accessibility.md', 'Complete the documented accessibility audit against the signed M8 release candidate before public distribution.')
    },
    privacySecurity: {
      ...movedToM8('docs/macos-m7-privacy-security-review.md', 'Complete the documented privacy/security review against the signed M8 release candidate before public distribution.')
    },
    migration: {
      ...movedToM8('docs/macos-m7-migration.md', 'Complete the documented PWA/native migration and rollback run against the signed M8 release candidate before public distribution.')
    },
    diagnostics: {
      ...movedToM8('docs/support-diagnostics.md', 'Review the generated diagnostics JSON for the signed M8 release candidate before public distribution.', { command: 'npm run native:macos:diagnostics' })
    }
  },
  distributionReleaseStatus: 'moved-to-m8-release-readiness',
  m7PlanningGateStatus: 'accepted-with-m8-release-readiness-follow-up',
  m7ExitStatus: 'accepted-hardening-planning-gate-final-distribution-proof-in-m8'
};

if (shouldBuild) {
  if (!bffOrigin) {
    evidence.buildStatus = 'skipped: VITE_NAVIMUSE_BFF_ORIGIN is required';
  } else if (shouldReleaseSeal && !releaseIdentityIsExplicit) {
    evidence.buildStatus = 'skipped: --release requires an explicit NAVIMUSE_MACOS_CODESIGN_IDENTITY before the build starts';
  } else if (String(evidence.rustc).startsWith('unavailable:') || String(evidence.cargo).startsWith('unavailable:')) {
    evidence.buildStatus = 'skipped: rustc and cargo are required';
  } else if (evidence.automatedChecks.rustTargetPrerequisites.status !== 'passed') {
    evidence.buildStatus = 'skipped: aarch64-apple-darwin Rust target is required';
  } else {
    evidence.buildCommandInvoked = true;
    const build = commandStatusWithStderr('npm', ['run', 'tauri:build']);
    evidence.buildStatus = build.status === 'passed' && existsSync(appBundlePath)
      ? 'passed'
      : `failed: ${build.output}`;
  }
}

evidence.appBundleExists = existsSync(appBundlePath);
if (shouldVerify) {
  evidence.automatedChecks.productionBuild = commandStatusWithStderr('npm', ['run', 'build']);
  evidence.automatedChecks.testSuite = commandStatusWithStderr('npm', ['test']);
}

if (shouldBuild && evidence.buildStatus === 'passed') {
  const sealArgs = ['scripts/native-macos-seal-app.mjs'];
  if (shouldReleaseSeal) {
    sealArgs.push('--release');
  }
  evidence.automatedChecks.appBundleSeal = commandStatusWithStderr('node', sealArgs);
  if (evidence.automatedChecks.appBundleSeal.status === 'passed') {
    evidence.appBundleSignatureDetails = commandStatusWithStderr('codesign', ['-dv', '--verbose=4', appBundlePath]);
    evidence.automatedChecks.appBundleChecksum = appBundleChecksum();
    evidence.automatedChecks.appBundleCodesign = commandStatusWithStderr('codesign', ['--verify', '--deep', '--strict', '--verbose=2', appBundlePath]);
    evidence.automatedChecks.appBundleGatekeeper = commandStatusWithStderr('spctl', ['-a', '-vv', appBundlePath]);
  } else {
    evidence.appBundleSignatureDetails = { status: 'not-run', reason: 'app bundle seal did not pass in this evidence run' };
    evidence.automatedChecks.appBundleChecksum = { status: 'not-run', reason: 'app bundle seal did not pass in this evidence run' };
    evidence.automatedChecks.appBundleCodesign = { status: 'not-run', reason: 'app bundle seal did not pass in this evidence run' };
    evidence.automatedChecks.appBundleGatekeeper = { status: 'not-run', reason: 'app bundle seal did not pass in this evidence run' };
  }
} else if (evidence.appBundleExists) {
  evidence.automatedChecks.appBundleSeal = { status: 'not-run', reason: 'stale bundle not sealed without a successful --build in this evidence run' };
  evidence.automatedChecks.appBundleChecksum = { status: 'not-run', reason: 'stale bundle not fingerprinted without a successful --build in this evidence run' };
  evidence.automatedChecks.appBundleCodesign = { status: 'not-run', reason: 'stale bundle not checked without a successful --build in this evidence run' };
  evidence.automatedChecks.appBundleGatekeeper = { status: 'not-run', reason: 'stale bundle not checked without a successful --build in this evidence run' };
}

evidence.incompleteEvidence = incompleteEvidenceItems(evidence);

console.log(JSON.stringify(evidence, null, 2));

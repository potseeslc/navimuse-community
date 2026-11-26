import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, mkdir, readFile, stat, symlink, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const packageLock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'));
const tauriConfig = JSON.parse(await readFile(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'));
const tauriEntitlements = await readFile(new URL('../src-tauri/entitlements.plist', import.meta.url), 'utf8');
const cargoToml = await readFile(new URL('../src-tauri/Cargo.toml', import.meta.url), 'utf8');
const tauriBuildScript = await readFile(new URL('../src-tauri/build.rs', import.meta.url), 'utf8');
const tauriLib = await readFile(new URL('../src-tauri/src/lib.rs', import.meta.url), 'utf8');
const tauriMain = await readFile(new URL('../src-tauri/src/main.rs', import.meta.url), 'utf8');
const rustToolchain = await readFile(new URL('../rust-toolchain.toml', import.meta.url), 'utf8');
const nativeEvidenceScript = await readFile(new URL('../scripts/native-macos-evidence.mjs', import.meta.url), 'utf8');
const sessionEvidenceScript = await readFile(new URL('../scripts/native-macos-session-evidence.mjs', import.meta.url), 'utf8');
const m7EvidenceScript = await readFile(new URL('../scripts/native-macos-m7-evidence.mjs', import.meta.url), 'utf8');
const macosSealScript = await readFile(new URL('../scripts/native-macos-seal-app.mjs', import.meta.url), 'utf8');
const diagnosticsScript = await readFile(new URL('../scripts/native-macos-diagnostics.mjs', import.meta.url), 'utf8');
const nativeDocs = await readFile(new URL('../docs/native-macos.md', import.meta.url), 'utf8');
const m7Docs = await readFile(new URL('../docs/macos-m7-release-hardening.md', import.meta.url), 'utf8');
const m7SecurityDocs = await readFile(new URL('../docs/macos-m7-privacy-security-review.md', import.meta.url), 'utf8');
const m7UpdateDocs = await readFile(new URL('../docs/macos-m7-update-rollback.md', import.meta.url), 'utf8');
const m7MigrationDocs = await readFile(new URL('../docs/macos-m7-migration.md', import.meta.url), 'utf8');
const m7AccessibilityDocs = await readFile(new URL('../docs/macos-m7-accessibility.md', import.meta.url), 'utf8');
const m7WebglDocs = await readFile(new URL('../docs/macos-m7-webgl-recovery.md', import.meta.url), 'utf8');
const m7LongSessionDocs = await readFile(new URL('../docs/macos-m7-long-session.md', import.meta.url), 'utf8');
const m7SigningDocs = await readFile(new URL('../docs/macos-m7-signing-notarization.md', import.meta.url), 'utf8');
const m7BuildAttemptDocs = await readFile(new URL('../docs/macos-m7-build-attempt-2026-08-29.md', import.meta.url), 'utf8');
const m7LaunchSmokeDocs = await readFile(new URL('../docs/macos-m7-launch-smoke-2026-08-30.md', import.meta.url), 'utf8');
const supportDiagnosticsDocs = await readFile(new URL('../docs/support-diagnostics.md', import.meta.url), 'utf8');
const masterPlan = await readFile(new URL('../docs/plans/NAVIMUSE_MACOS_TAURI_MASTER_PLAN_2026-08-21.md', import.meta.url), 'utf8');
const m8RedesignPlan = await readFile(new URL('../docs/plans/NAVIMUSE_M8_PRODUCT_REDESIGN_PLAN_2026-08-29.md', import.meta.url), 'utf8');

function removeCredentialScanEnvironment(env) {
  for (const key of Object.keys(env)) {
    if (/^(NAVIDROME|AUDIOMUSE|POCKET_ID|NAVIMUSE)_/i.test(key) && /(?:PASSWORD|TOKEN|SECRET|COOKIE|SESSION|API[_-]?KEY)/i.test(key)) {
      delete env[key];
    }
  }
}

function removeReleasePrerequisiteEnvironment(env) {
  delete env.NAVIMUSE_NOTARYTOOL_KEYCHAIN_PROFILE;
  delete env.NAVIMUSE_MACOS_CODESIGN_IDENTITY;
}

test('Tauri dependencies and scripts are pinned for the macOS shell', () => {
  assert.equal(packageJson.dependencies['@tauri-apps/api'], '^2.11.1');
  assert.equal(packageJson.devDependencies['@tauri-apps/cli'], '^2.11.4');
  assert.equal(packageLock.packages['node_modules/@tauri-apps/api'].version, '2.11.1');
  assert.equal(packageLock.packages['node_modules/@tauri-apps/cli'].version, '2.11.4');
  assert.equal(packageJson.scripts.tauri, 'tauri');
  assert.equal(packageJson.scripts['tauri:dev'], 'tauri dev');
  assert.equal(packageJson.scripts['tauri:build'], 'tauri build --target aarch64-apple-darwin');
  assert.equal(packageJson.scripts['native:macos:evidence'], 'node scripts/native-macos-evidence.mjs');
  assert.equal(packageJson.scripts['native:macos:seal-app'], 'node scripts/native-macos-seal-app.mjs');
  assert.equal(packageJson.scripts['native:macos:m7-evidence'], 'node scripts/native-macos-m7-evidence.mjs');
});

test('Tauri config keeps the shell thin and macOS-first', () => {
  assert.equal(tauriConfig.identifier, 'com.developer.navimuse');
  assert.equal(tauriConfig.build.beforeDevCommand, 'npm run dev');
  assert.equal(tauriConfig.build.devUrl, 'http://localhost:5173');
  assert.equal(tauriConfig.build.beforeBuildCommand, 'npm run build');
  assert.equal(tauriConfig.build.frontendDist, '../dist');
  assert.deepEqual(tauriConfig.bundle.targets, ['app']);
  assert.equal(tauriConfig.bundle.macOS.minimumSystemVersion, '14.0');
  assert.equal(tauriConfig.bundle.macOS.hardenedRuntime, true);
  assert.equal(tauriConfig.bundle.macOS.entitlements, 'entitlements.plist');
  assert.match(tauriEntitlements, /com\.apple\.developer\.associated-domains/);
  assert.match(tauriEntitlements, /webcredentials:id\.example\.com/);
  assert.equal(tauriConfig.app.windows[0].title, 'NaviMuse');
});

test('Rust manifest and docs pin the Apple Silicon target without adding a sidecar', () => {
  assert.match(cargoToml, /tauri = \{ version = "2\.11\.5", features = \[\] \}/);
  assert.match(cargoToml, /tauri-build = \{ version = "2\.6\.3", features = \[\] \}/);
  assert.match(rustToolchain, /channel = "1\.88\.0"/);
  assert.match(rustToolchain, /targets = \["aarch64-apple-darwin", "x86_64-unknown-linux-gnu"\]/);
  assert.match(nativeDocs, /Node BFF remains the authentication, service, and credential boundary/);
  assert.match(nativeDocs, /No Rust BFF, Node sidecar, Tauri mobile target, or non-macOS platform target is introduced/);
});

test('Rust build script and entry point stay wired to the generated Tauri context', () => {
  assert.match(cargoToml, /crate-type = \["staticlib", "cdylib", "rlib"\]/);
  assert.match(tauriBuildScript, /tauri_build::build\(\);/);
  assert.match(tauriLib, /tauri::Builder::default\(\)/);
  assert.match(tauriLib, /std::env::args\(\)\.any\(\|arg\| arg == "--m7-webgl-loss"\)/);
  assert.match(tauriLib, /\.on_page_load\(move \|webview, payload\|/);
  assert.match(tauriLib, /payload\.event\(\) != PageLoadEvent::Finished/);
  assert.match(tauriLib, /!matches!\(url\.scheme\(\), "tauri" \| "http" \| "https"\)/);
  assert.match(tauriLib, /Seed the evidence query/);
  assert.match(tauriLib, /before that redirect so the flag survives the secure bootstrap/);
  assert.match(tauriLib, /query_pairs\(\)\s+\.any\(\|\(key, value\)\| key == "navimuse-m7-webgl-loss" && value == "1"\)/);
  assert.match(tauriLib, /key != "view" && key != "navimuse-m7-webgl-loss"/);
  assert.match(tauriLib, /query\.append_pair\("view", "sonic"\)/);
  assert.match(tauriLib, /query\.append_pair\("navimuse-m7-webgl-loss", "1"\)/);
  assert.match(tauriLib, /webview\.navigate\(evidence_url\)/);
  assert.match(tauriLib, /if let Err\(error\) = webview\.navigate\(evidence_url\)/);
  assert.match(tauriLib, /NaviMuse M7 WebGL evidence navigation failed/);
  assert.match(tauriLib, /\.run\(tauri::generate_context!\(\)\)/);
  assert.match(tauriLib, /failed to run NaviMuse Tauri shell/);
  assert.match(tauriMain, /navimuse_lib::run\(\);/);
});

test('native packaging evidence path is defined without claiming an unbuilt app', () => {
  assert.match(nativeDocs, /VITE_NAVIMUSE_BFF_ORIGIN=<deployed-bff-origin> npm run tauri:build/);
  assert.match(nativeDocs, /VITE_NAVIMUSE_BFF_ORIGIN=<deployed-bff-origin> npm run native:macos:evidence -- --build/);
  assert.match(nativeDocs, /installed Rust targets are available/);
  assert.match(nativeDocs, /dirty Git state/);
  assert.match(nativeDocs, /service-named environment variables or built assets indicate Navidrome or AudioMuse credential exposure/);
  assert.match(nativeDocs, /manual evidence fields/);
  assert.match(nativeDocs, /signing identity or unsigned-development status/);
  assert.match(nativeDocs, /notarization was skipped, submitted, or accepted/);
  assert.match(nativeDocs, /no Navidrome or AudioMuse service credentials in the client environment/);
  assert.match(nativeDocs, /packaging path is defined but not that NaviMuse has passed native packaging exit evidence/);
  assert.match(nativeDocs, /"buildStatus": "passed"/);
  assert.match(nativeDocs, /"signingStatus": "ad-hoc signed; not notarized"/);
  assert.match(nativeDocs, /remaining M2 exit evidence is a real authenticated listening session/);
});

test('native packaging evidence command captures environment without requiring a build', async () => {
  const fixtureUrl = new URL('../dist/native-source-map-fixture.map', import.meta.url);
  const env = {
    ...process.env,
    VITE_NAVIMUSE_BFF_ORIGIN: '',
    NAVIDROME_PASSWORD: '',
    NAVIDROME_USERNAME: '',
    AUDIOMUSE_API_TOKEN: ''
  };
  delete env.VITE_NAVIMUSE_BFF_ORIGIN;
  delete env.NAVIDROME_PASSWORD;
  delete env.NAVIDROME_USERNAME;
  delete env.AUDIOMUSE_API_TOKEN;
  removeCredentialScanEnvironment(env);
  await mkdir(new URL('../dist/', import.meta.url), { recursive: true });
  await writeFile(fixtureUrl, JSON.stringify({
    version: 3,
    sourcesContent: ['const maybeConfigName = "NAVIDROME_TOKEN"; const otherName = "AUDIOMUSE_API_TOKEN";']
  }), { mode: 0o600 });
  try {
    const { stdout } = await execFileAsync('npm', ['run', 'native:macos:evidence'], { cwd: new URL('..', import.meta.url), encoding: 'utf8', env });
    const jsonStart = stdout.indexOf('{');
    const evidence = JSON.parse(stdout.slice(jsonStart));
    assert.equal(evidence.buildAttempted, false);
    // "not-run" is a no-build evidence capture state, not packaged app success.
    assert.equal(evidence.buildStatus, 'not-run', 'no-build evidence capture must not claim a packaged app');
    assert.equal(evidence.evidenceCommand, 'npm run native:macos:evidence');
    assert.match(evidence.commit, /^[0-9a-f]{40}$/);
    assert.equal(typeof evidence.dirtyState, 'string');
    assert.equal(evidence.packageVersion, packageJson.version);
    assert.match(evidence.macos, /ProductVersion:/);
    assert.match(evidence.arch, /^(arm64|aarch64)$/);
    assert.equal(typeof evidence.rustupTargets, 'string');
    assert.match(evidence.node, /^v\d+\./);
    assert.match(evidence.npm, /^\d+\./);
    assert.equal(evidence.bffOrigin, 'unset');
    assert.deepEqual(evidence.clientServiceCredentials.environmentVariables, []);
    assert.ok(evidence.clientServiceCredentials.distAssetMatches.includes('NAVIDROME_ in dist/native-source-map-fixture.map'));
    assert.ok(evidence.clientServiceCredentials.distAssetMatches.includes('AUDIOMUSE_ in dist/native-source-map-fixture.map'));
    assert.deepEqual(evidence.manualEvidenceRequired, ['signingIdentity', 'notarizationStatus', 'realSessionLifecycle']);
    assert.match(evidence.appBundlePath, /NaviMuse\.app$/);
    assert.match(nativeEvidenceScript, /redactSupportText/);
    assert.match(nativeEvidenceScript, /function redactedBffOrigin\(\)/);
    assert.match(nativeEvidenceScript, /'\.map'/);
    assert.match(nativeEvidenceScript, /parseCommandTimeoutMs\(process\.env\.NAVIMUSE_MACOS_EVIDENCE_COMMAND_TIMEOUT_MS, 1200000\)/);
    assert.match(nativeEvidenceScript, /parseCommandTimeoutMs\(process\.env\.NAVIMUSE_MACOS_EVIDENCE_ENV_COMMAND_TIMEOUT_MS, 30000\)/);
    assert.match(nativeEvidenceScript, /timeout: environmentCommandTimeoutMs/);
    assert.match(nativeEvidenceScript, /timeout: commandTimeoutMs/);
  } finally {
    await unlink(fixtureUrl).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
});

test('native macOS session evidence redacts support fields and bounds commands', async () => {
  const env = {
    ...process.env,
    VITE_NAVIMUSE_BFF_ORIGIN: 'https://navimuse.example.com/api?token=session-secret&item_id=track-secret',
    NAVIMUSE_MACOS_SESSION_EVIDENCE_COMMAND_TIMEOUT_MS: 'not-a-number'
  };
  const { stdout } = await execFileAsync('npm', ['run', 'native:macos:session-evidence'], { cwd: new URL('..', import.meta.url), encoding: 'utf8', env });
  const jsonStart = stdout.indexOf('{');
  const evidence = JSON.parse(stdout.slice(jsonStart));
  const serialized = JSON.stringify(evidence);
  assert.equal(evidence.evidenceType, 'native-macos-real-session');
  assert.equal(evidence.bffOrigin, 'https://navimuse.example.com/api?token=[redacted]&item_id=[redacted]');
  assert.match(evidence.commit, /^[0-9a-f]{40}$/);
  assert.equal(evidence.m2ExitStatus, 'incomplete-until-real-session-fields-pass');
  assert.equal(evidence.realSession.authentication.status, 'pending-manual-validation');
  assert.equal(serialized.includes('session-secret'), false);
  assert.equal(serialized.includes('track-secret'), false);
  assert.match(sessionEvidenceScript, /redactSupportText/);
  assert.match(sessionEvidenceScript, /parseCommandTimeoutMs\(process\.env\.NAVIMUSE_MACOS_SESSION_EVIDENCE_COMMAND_TIMEOUT_MS, 30000\)/);
  assert.match(sessionEvidenceScript, /timeout: commandTimeoutMs/);
  assert.match(sessionEvidenceScript, /return redactSupportText\(`\$\{timedOut \? 'timed-out' : 'unavailable'\}: \$\{output\}`\)/);
});

test('M7 release hardening evidence scaffold captures current state without claiming exit', async () => {
  assert.match(masterPlan, /Evidence scaffold: \[`..\/macos-m7-release-hardening.md`\]/);
  assert.match(m7Docs, /Signed artifact/);
  assert.match(m7Docs, /Notarization/);
  assert.match(m7Docs, /npm --silent run native:macos:m7-evidence/);
  assert.match(m7Docs, /stdout remains one parseable JSON/);
  assert.match(m7Docs, /automatedChecks\.appBundleChecksum/);
  assert.match(m7Docs, /moved-to-m8-release-readiness/);
  assert.match(m7Docs, /incompleteEvidence` reports only automated\s+checks/);
  assert.match(m7Docs, /SHA-256 directory-tree digest/);
  assert.match(m7Docs, /Update channel/);
  assert.match(m7Docs, /macos-m7-update-rollback.md/);
  assert.match(m7Docs, /Long session/);
  assert.match(m7Docs, /WebGL recovery/);
  assert.match(m7Docs, /Accessibility/);
  assert.match(m7Docs, /macos-m7-accessibility.md/);
  assert.match(m7Docs, /Privacy\/security/);
  assert.match(m7Docs, /macos-m7-privacy-security-review.md/);
  assert.match(m7Docs, /Migration/);
  assert.match(m7Docs, /macos-m7-migration.md/);
  assert.match(m7Docs, /Diagnostics/);
  assert.match(m7Docs, /support-diagnostics.md/);
  assert.match(m7Docs, /Moved to M8 release-readiness for current head; previous `7f50691` proof passed/);
  assert.match(m7Docs, /Manual private-preview channel and rollback rehearsal recorded for `7f50691`/);
  assert.match(m7Docs, /Deterministic context-loss trigger and sticky evidence result added; accepted for M7 planning gate with final packaged proof deferred/);
  assert.match(m7Docs, /Current `1f89785` diagnostics redaction and focused privacy spot evidence passed; broader release review remains for distribution/);
  assert.match(m7Docs, /accepts moving distribution evidence into M8/);
  assert.match(m7Docs, /does not mean the current\s+head is the public distribution candidate/);
  assert.match(m7Docs, /final current-head\s+notarization, stapling, Gatekeeper, packaged WebGL proof/);
  assert.match(m7Docs, /NAVIMUSE_M8_PRODUCT_REDESIGN_PLAN_2026-08-29\.md/);
  assert.match(m7Docs, /Passed for `7f50691` support diagnostic review/);
  assert.match(m7SecurityDocs, /Pocket ID authorization-code flow/);
  assert.match(m7SecurityDocs, /Protected writes/);
  assert.match(m7SecurityDocs, /Client bundle/);
  assert.match(m7SecurityDocs, /automated privacy\/security coverage passed/i);
  assert.match(m7SecurityDocs, /passed 136\/136 on 2026-08-30/);
  assert.match(m7SecurityDocs, /Tauri-origin CORS reads and preflights limited to `tauri:\/\/localhost`/);
  assert.match(m7SecurityDocs, /Remaining manual observation: inspect the signed packaged app/);
  assert.match(m7UpdateDocs, /manual private preview distribution/);
  assert.match(m7UpdateDocs, /Do not enable Tauri automatic updates until/);
  assert.match(m7UpdateDocs, /Rollback Procedure/);
  assert.match(m7UpdateDocs, /Release candidate commit: `7f506911295a87229bdffe1292598d330e3ed0b2`/);
  assert.match(m7UpdateDocs, /Notarization submission: `88a039ae-0d46-4b4d-bf19-cfec8969d50b`/);
  assert.match(m7UpdateDocs, /Result: passed for the manual private-preview channel/);
  assert.match(m7MigrationDocs, /navimuse\.queue\.v1/);
  assert.match(m7MigrationDocs, /navimuse\.sonic-atlas\.queue-transaction\.v1/);
  assert.match(m7MigrationDocs, /navimuse\.trackFeedback\.v1/);
  assert.match(m7MigrationDocs, /settings\.json` and `settings\.key` must be backed up and restored/);
  assert.match(m7MigrationDocs, /storage compatibility and fail-closed migration behavior passed/);
  assert.match(m7MigrationDocs, /Targeted migration verification/);
  assert.match(m7MigrationDocs, /covers the queue-store implementation/);
  assert.match(m7MigrationDocs, /covers the app-shell integration path/);
  assert.match(m7MigrationDocs, /passed 74\/74 on 2026-08-30/);
  assert.match(m7Docs, /Storage compatibility\/fail-closed behavior passed; live observation optional/);
  assert.match(m7AccessibilityDocs, /VoiceOver can identify/);
  assert.match(m7AccessibilityDocs, /Keyboard navigation reaches every primary command/);
  assert.match(m7AccessibilityDocs, /Reduced-motion mode avoids nonessential animation/);
  assert.match(m7AccessibilityDocs, /This audit is release hardening, not the M8 visual redesign/);
  assert.match(m7AccessibilityDocs, /automated accessibility coverage passed/i);
  assert.match(m7AccessibilityDocs, /passed 89\/89 on 2026-08-30/);
  assert.match(m7Docs, /Automated accessibility coverage passed; live VoiceOver\/contrast audit pending/);
  assert.match(m7Docs, /macos-m7-webgl-recovery.md/);
  assert.match(m7WebglDocs, /WebGL context loss/);
  assert.match(m7WebglDocs, /complete ordered Journey fallback/);
  assert.match(m7WebglDocs, /--m7-webgl-loss/);
  assert.match(m7WebglDocs, /navimuse-m7-webgl-loss=1/);
  assert.match(m7WebglDocs, /WEBGL_lose_context/);
  assert.match(m7WebglDocs, /release-candidate WebGL context-loss run/);
  assert.match(m7Docs, /macos-m7-long-session.md/);
  assert.match(m7LongSessionDocs, /two hours/);
  assert.match(m7LongSessionDocs, /sleep and wake recovery/);
  assert.match(m7LongSessionDocs, /output-device changes/);
  assert.match(m7Docs, /macos-m7-signing-notarization.md/);
  assert.match(m7SigningDocs, /Developer ID Application/);
  assert.match(m7SigningDocs, /NAVIMUSE_NOTARYTOOL_KEYCHAIN_PROFILE/);
  assert.match(m7SigningDocs, /notarytool submit/);
  assert.match(m7SigningDocs, /post-staple Gatekeeper/);
  assert.match(m7SigningDocs, /does not select certificates/);
  assert.match(m7SigningDocs, /npm run native:macos:seal-app/);
  assert.match(m7SigningDocs, /-- --release/);
  assert.match(m7SigningDocs, /npm --silent run native:macos:m7-evidence -- --build --release/);
  assert.match(m7SigningDocs, /codesign --deep --options runtime --entitlements/);
  assert.match(m7Docs, /local `codesign --verify` into a useful preflight/);
  assert.match(m7Docs, /does not satisfy the signed-artifact, notarization, or Gatekeeper exit gates/);
  assert.match(macosSealScript, /NAVIMUSE_MACOS_CODESIGN_IDENTITY/);
  assert.match(macosSealScript, /NAVIMUSE_MACOS_SEAL_TIMEOUT_MS/);
  assert.match(macosSealScript, /const signArgs = \['--force', '--sign', identity, appBundlePath\]/);
  assert.match(macosSealScript, /signArgs\.splice\(1, 0, '--deep'\)/);
  assert.match(macosSealScript, /'--options', 'runtime', '--entitlements', entitlementsPath/);
  assert.match(macosSealScript, /'--verify', '--deep', '--strict', '--verbose=2'/);
  assert.match(macosSealScript, /--identity requires a signing identity value/);
  assert.match(macosSealScript, /release sealing requires NAVIMUSE_MACOS_CODESIGN_IDENTITY or --identity/);
  assert.match(m7Docs, /macos-m7-build-attempt-2026-08-29.md/);
  assert.match(m7BuildAttemptDocs, /not a signed or notarized\s+release candidate/);
  assert.match(m7BuildAttemptDocs, /buildStatus`: `"passed"`/);
  assert.match(m7BuildAttemptDocs, /6b39fad60561c0295c8eef42e9bb81dc7c158a45/);
  assert.match(m7BuildAttemptDocs, /Signature`: `adhoc`/);
  assert.match(m7BuildAttemptDocs, /TeamIdentifier`: `not set`/);
  assert.match(m7BuildAttemptDocs, /code has no resources but signature indicates they must be present/);
  assert.match(m7BuildAttemptDocs, /Info\.plist=not bound/);
  assert.match(m7BuildAttemptDocs, /Sealed Resources=none/);
  assert.match(m7BuildAttemptDocs, /spctl -a -vv` still returned `rejected`/);
  assert.match(m7BuildAttemptDocs, /npm run native:macos:seal-app/);
  assert.match(m7BuildAttemptDocs, /0 valid identities found/);
  assert.match(m7BuildAttemptDocs, /no valid\s+Developer ID Application signing identity is installed/);
  assert.match(m7BuildAttemptDocs, /NAVIMUSE_SETUP_TOKEN in dist\/assets\/index-BJT4eZt9\.js/);
  assert.match(m7BuildAttemptDocs, /clientServiceCredentials\.status` returned `passed`/);
  assert.match(m7BuildAttemptDocs, /productionBuild\.status`: `passed`/);
  assert.match(m7BuildAttemptDocs, /testSuite\.status`: `timed-out`/);
  assert.match(m7BuildAttemptDocs, /d1ca38837fa8ced291f2065788b6be07d499b838/);
  assert.match(m7BuildAttemptDocs, /testSuite\.status`: `passed`/);
  assert.match(m7BuildAttemptDocs, /Remaining automated incomplete evidence/);
  assert.match(m7BuildAttemptDocs, /marker-name match, not a captured credential value/);
  assert.match(m7BuildAttemptDocs, /No setup token, OIDC secret, provider token, service password, cookie, or\s+library identifier value was copied/);
  assert.match(m7BuildAttemptDocs, /Current-Head Evidence Bundle/);
  assert.match(m7BuildAttemptDocs, /0d9bf9d8e1a7da29c131fa35c4931e60ef1471ef/);
  assert.match(m7BuildAttemptDocs, /comment 3851/);
  assert.match(m7BuildAttemptDocs, /comment 3852/);
  assert.match(m7BuildAttemptDocs, /comment 3854/);
  assert.match(m7BuildAttemptDocs, /comment 3856/);
  assert.match(m7Docs, /macos-m7-launch-smoke-2026-08-30\.md/);
  assert.match(m7Docs, /current PR head `7f506911295a87229bdffe1292598d330e3ed0b2` passed Developer ID signing/);
  assert.match(m7Docs, /Prior endurance accepted by product owner; current RC launch\/stability spot-check recorded/);
  assert.match(m7LaunchSmokeDocs, /Gatekeeper before launch: `.*accepted.*Notarized Developer ID/);
  assert.match(m7LaunchSmokeDocs, /Direct launch result: process stayed alive/);
  assert.match(m7LaunchSmokeDocs, /Diagnostics JSON permissions: `0600`/);
  assert.match(m7LaunchSmokeDocs, /release evidence was\s+refreshed for PR head `7f506911295a87229bdffe1292598d330e3ed0b2`/);
  assert.match(m7LaunchSmokeDocs, /notarization submission\s+`88a039ae-0d46-4b4d-bf19-cfec8969d50b`/i);
  assert.match(m7BuildAttemptDocs, /NODE_ENV=test node --test test\/layoutBrowser\.test\.mjs/);
  assert.match(m7BuildAttemptDocs, /isolated layout suite then\s+passed: 8\/8/);
  assert.match(m7BuildAttemptDocs, /Full `npm test` then passed/);
  assert.match(supportDiagnosticsDocs, /Every collected text field must pass through the shared support redactor/);
  assert.match(supportDiagnosticsDocs, /Unquoted free-text secret values are redacted to the end of the current line/);
  assert.match(supportDiagnosticsDocs, /Status: passed for release support review on/);
  assert.match(supportDiagnosticsDocs, /navimuse-macos-diagnostics-2026-08-30T16-04-48-942Z\.json/);
  assert.match(supportDiagnosticsDocs, /no collected cookies, service credentials, setup tokens/);
  assert.match(masterPlan, /## M8 - Cohesive product redesign/);
  assert.match(masterPlan, /NAVIMUSE_M8_PRODUCT_REDESIGN_PLAN_2026-08-29\.md/);
  assert.match(masterPlan, /M8 is a functional-preservation redesign/);
  assert.match(masterPlan, /carry final Apple notarization, stapling, Gatekeeper, release-channel, rollback,\s+diagnostics, and packaged WebGL proof as M8 release-readiness work/);
  assert.match(m8RedesignPlan, /do not satisfy the M8\.5 final Apple Silicon distribution-candidate gate/);
  assert.match(m8RedesignPlan, /must be proven on the exact\s+M8 release-candidate commit/);
  assert.match(m7EvidenceScript, /unreadable-dir \$\{redactSupportText\(dir\)\}/);
  assert.match(m7EvidenceScript, /unreadable-entry \$\{redactSupportText\(path\)\}/);
  assert.match(masterPlan, /Exit evidence: every required pass is accepted, and the complete functional coverage\s+matrix and visual-quality gates pass/);
  assert.match(masterPlan, /## M9 - iOS application/);
  assert.match(masterPlan, /## M10 - Android application/);
  const env = {
    ...process.env,
    VITE_NAVIMUSE_BFF_ORIGIN: 'https://navimuse.example.com/api?token=bff-token-secret&item_id=bff-item-secret',
    NAVIDROME_PASSWORD: '',
    NAVIDROME_USERNAME: '',
    AUDIOMUSE_API_TOKEN: ''
  };
  removeCredentialScanEnvironment(env);
  removeReleasePrerequisiteEnvironment(env);
  const { stdout } = await execFileAsync('npm', ['run', 'native:macos:m7-evidence'], { cwd: new URL('..', import.meta.url), encoding: 'utf8', env });
  const jsonStart = stdout.indexOf('{');
  const evidence = JSON.parse(stdout.slice(jsonStart));
  assert.equal(evidence.evidenceType, 'native-macos-m7-release-hardening');
  assert.equal(evidence.evidenceSchemaVersion, 1);
  assert.equal(evidence.evidenceCommand, 'npm --silent run native:macos:m7-evidence');
  assert.deepEqual(evidence.evidenceFlags, { build: false, verify: false, release: false });
  assert.equal(evidence.commandTimeoutMs, 1200000);
  assert.equal(evidence.environmentCommandTimeoutMs, 30000);
  assert.equal(evidence.bffOrigin, 'https://navimuse.example.com/api?token=[redacted]&item_id=[redacted]');
  assert.equal(JSON.stringify(evidence).includes('bff-token-secret'), false);
  assert.equal(JSON.stringify(evidence).includes('bff-item-secret'), false);
  assert.equal(evidence.buildAttempted, false);
  assert.equal(evidence.verificationAttempted, false);
  assert.equal(evidence.releaseSealAttempted, false);
  assert.equal(evidence.buildStatus, 'not-run');
  assert.match(evidence.appBundleSignatureDetails.status, /^(passed|not-run)$/);
  if (evidence.appBundleSignatureDetails.status === 'passed') {
    assert.match(evidence.appBundleSignatureDetails.output, /Signature=|Identifier=/);
  }
  assert.equal(evidence.automatedChecks.productionBuild.status, 'not-run');
  assert.equal(evidence.automatedChecks.testSuite.status, 'not-run');
  assert.equal(evidence.automatedChecks.appBundleSeal.status, 'not-run');
  assert.equal(evidence.automatedChecks.appBundleChecksum.status, 'not-run');
  assert.equal(evidence.automatedChecks.clientServiceCredentials.status, 'passed');
  assert.match(evidence.automatedChecks.rustTargetPrerequisites.status, /^(passed|needs-review)$/);
  assert.equal(evidence.automatedChecks.rustTargetPrerequisites.target, 'aarch64-apple-darwin');
  assert.match(evidence.automatedChecks.rustTargetPrerequisites.limitation, /Apple Silicon release builds require/);
  assert.match(evidence.automatedChecks.signingPrerequisites.status, /^(passed|needs-review)$/);
  assert.equal(typeof evidence.automatedChecks.signingPrerequisites.validIdentityCount, 'number');
  assert.equal(typeof evidence.automatedChecks.signingPrerequisites.developerIdIdentityCount, 'number');
  assert.ok(Array.isArray(evidence.automatedChecks.signingPrerequisites.developerIdIdentities));
  assert.match(evidence.automatedChecks.signingPrerequisites.notarytool.status, /^(passed|unavailable|timed-out)$/);
  assert.equal(evidence.automatedChecks.signingPrerequisites.notarizationCredentialSource.status, 'needs-review');
  assert.equal(evidence.automatedChecks.signingPrerequisites.notarizationCredentialSource.type, 'unset');
  assert.match(evidence.automatedChecks.signingPrerequisites.limitation, /credential-source availability/);
  assert.match(m7SigningDocs, /does not store the profile value/);
  assert.ok(Array.isArray(evidence.automatedChecks.clientServiceCredentials.environmentVariables));
  assert.ok(Array.isArray(evidence.automatedChecks.clientServiceCredentials.distAssetMatches));
  assert.deepEqual(evidence.automatedChecks.clientServiceCredentials.environmentVariables, []);
  assert.deepEqual(evidence.automatedChecks.clientServiceCredentials.distAssetMatches, []);
  assert.match(m7EvidenceScript, /'\.map'/);
  assert.deepEqual(evidence.automatedChecks.clientServiceCredentials.scannedPatterns, [
    'NAVIDROME_',
    'AUDIOMUSE_',
    'NAVIMUSE_SETUP_TOKEN',
    'POCKET_ID_',
    'OIDC client secret',
    'API key',
    'provider private id'
  ]);
  assert.equal(evidence.automatedChecks.clientServiceCredentials.scanPolicy, 'Pattern matches are reported as needs-review findings and never include matched credential values.');
  assert.match(m7EvidenceScript, /credentialMarkerPatterns = Object\.freeze/);
  assert.match(evidence.automatedChecks.clientServiceCredentials.limitation, /manual review is required/);
  assert.equal(evidence.automatedChecks.appBundleCodesign.status, 'not-run');
  assert.equal(evidence.automatedChecks.appBundleGatekeeper.status, 'not-run');
  assert.match(m7EvidenceScript, /maxDepth = 6/);
  assert.match(m7EvidenceScript, /isSymbolicLink\(\)/);
  assert.match(m7EvidenceScript, /unreadable-file/);
  assert.equal(evidence.manualEvidence.signedArtifact.status, 'moved-to-m8-release-readiness');
  assert.equal(evidence.manualEvidence.signedArtifact.contract, 'docs/macos-m7-signing-notarization.md');
  assert.equal(evidence.manualEvidence.notarization.status, 'moved-to-m8-release-readiness');
  assert.equal(evidence.manualEvidence.notarization.contract, 'docs/macos-m7-signing-notarization.md');
  assert.equal(evidence.manualEvidence.updateChannel.status, 'moved-to-m8-release-readiness');
  assert.equal(evidence.manualEvidence.updateChannel.contract, 'docs/macos-m7-update-rollback.md');
  assert.equal(evidence.manualEvidence.longSession.status, 'moved-to-m8-release-readiness');
  assert.equal(evidence.manualEvidence.longSession.contract, 'docs/macos-m7-long-session.md');
  assert.equal(evidence.manualEvidence.webglRecovery.status, 'moved-to-m8-release-readiness');
  assert.equal(evidence.manualEvidence.webglRecovery.contract, 'docs/macos-m7-webgl-recovery.md');
  assert.equal(evidence.manualEvidence.accessibility.status, 'moved-to-m8-release-readiness');
  assert.equal(evidence.manualEvidence.accessibility.contract, 'docs/macos-m7-accessibility.md');
  assert.equal(evidence.manualEvidence.privacySecurity.status, 'moved-to-m8-release-readiness');
  assert.equal(evidence.manualEvidence.privacySecurity.contract, 'docs/macos-m7-privacy-security-review.md');
  assert.equal(evidence.manualEvidence.migration.status, 'moved-to-m8-release-readiness');
  assert.equal(evidence.manualEvidence.migration.contract, 'docs/macos-m7-migration.md');
  assert.equal(evidence.manualEvidence.diagnostics.status, 'moved-to-m8-release-readiness');
  assert.equal(evidence.manualEvidence.diagnostics.contract, 'docs/support-diagnostics.md');
  assert.equal(evidence.manualEvidence.diagnostics.command, 'npm run native:macos:diagnostics');
  assert.equal(evidence.distributionReleaseStatus, 'moved-to-m8-release-readiness');
  assert.equal(evidence.m7PlanningGateStatus, 'accepted-with-m8-release-readiness-follow-up');
  assert.ok(Array.isArray(evidence.incompleteEvidence));
  assert.deepEqual(
    evidence.incompleteEvidence.map(item => item.area),
    [
      'buildStatus',
      'automatedChecks.productionBuild',
      'automatedChecks.testSuite',
      'automatedChecks.appBundleSeal',
      'automatedChecks.appBundleChecksum',
      'automatedChecks.appBundleCodesign',
      'automatedChecks.appBundleGatekeeper',
      ...(evidence.automatedChecks.rustTargetPrerequisites.status === 'passed' ? [] : ['automatedChecks.rustTargetPrerequisites']),
      ...(evidence.automatedChecks.signingPrerequisites.status === 'passed' ? [] : ['automatedChecks.signingPrerequisites'])
    ]
  );
  assert.equal(evidence.m7ExitStatus, 'accepted-hardening-planning-gate-final-distribution-proof-in-m8');
});

test('M7 credential scan detects secret-bearing NaviMuse environment variables', async () => {
  const env = {
    ...process.env,
    VITE_NAVIMUSE_BFF_ORIGIN: 'https://navimuse.example.com',
    NAVIMUSE_SETUP_TOKEN: 'test-setup-token',
    NAVIMUSE_OIDC_CLIENT_SECRET: 'test-client-secret',
    POCKET_ID_CLIENT_SECRET: 'test-pocket-secret',
    NAVIDROME_URL: 'https://navidrome.example',
    AUDIOMUSE_URL: 'https://audiomuse.example',
    POCKET_ID_ISSUER: 'https://pocket-id.example',
    VITE_NAVIMUSE_BFF_ORIGIN_LABEL: 'safe-label'
  };
  const { stdout } = await execFileAsync('npm', ['run', 'native:macos:m7-evidence'], { cwd: new URL('..', import.meta.url), encoding: 'utf8', env });
  const jsonStart = stdout.indexOf('{');
  const evidence = JSON.parse(stdout.slice(jsonStart));
  assert.equal(evidence.automatedChecks.clientServiceCredentials.status, 'needs-review');
  assert.deepEqual(evidence.automatedChecks.clientServiceCredentials.environmentVariables, [
    'NAVIMUSE_OIDC_CLIENT_SECRET',
    'NAVIMUSE_SETUP_TOKEN',
    'POCKET_ID_CLIENT_SECRET'
  ]);
  assert.ok(evidence.incompleteEvidence.some((item) => item.area === 'automatedChecks.clientServiceCredentials'));
  assert.equal(evidence.automatedChecks.clientServiceCredentials.environmentVariables.includes('VITE_NAVIMUSE_BFF_ORIGIN_LABEL'), false);
  assert.equal(evidence.automatedChecks.clientServiceCredentials.environmentVariables.includes('NAVIDROME_URL'), false);
  assert.equal(evidence.automatedChecks.clientServiceCredentials.environmentVariables.includes('AUDIOMUSE_URL'), false);
  assert.equal(evidence.automatedChecks.clientServiceCredentials.environmentVariables.includes('POCKET_ID_ISSUER'), false);
});

test('M7 signing prerequisite records notarization source without leaking profile value', async () => {
  const env = {
    ...process.env,
    VITE_NAVIMUSE_BFF_ORIGIN: 'https://navimuse.example.com',
    NAVIMUSE_NOTARYTOOL_KEYCHAIN_PROFILE: 'm7-profile-token-secret'
  };
  removeCredentialScanEnvironment(env);
  const { stdout } = await execFileAsync('npm', ['run', 'native:macos:m7-evidence'], { cwd: new URL('..', import.meta.url), encoding: 'utf8', env });
  const jsonStart = stdout.indexOf('{');
  const evidence = JSON.parse(stdout.slice(jsonStart));
  const source = evidence.automatedChecks.signingPrerequisites.notarizationCredentialSource;
  assert.equal(source.status, 'passed');
  assert.equal(source.type, 'keychain-profile');
  assert.equal(source.variable, 'NAVIMUSE_NOTARYTOOL_KEYCHAIN_PROFILE');
  assert.equal(source.value, '[configured]');
  assert.equal(JSON.stringify(evidence).includes('m7-profile-token-secret'), false);
});

test('M7 credential scan detects secret-bearing dist assets', async () => {
  const fixtureUrl = new URL('../dist/m7-credential-fixture.txt', import.meta.url);
  const env = {
    ...process.env,
    VITE_NAVIMUSE_BFF_ORIGIN: 'https://navimuse.example.com',
    NAVIDROME_PASSWORD: '',
    NAVIDROME_USERNAME: '',
    AUDIOMUSE_API_TOKEN: ''
  };
  removeCredentialScanEnvironment(env);
  await mkdir(new URL('../dist/', import.meta.url), { recursive: true });
  await writeFile(fixtureUrl, 'leaked markers: NAVIDROME_TOKEN\nPOCKET_ID_PASSWORD', { mode: 0o600 });
  try {
    const { stdout } = await execFileAsync('npm', ['run', 'native:macos:m7-evidence'], { cwd: new URL('..', import.meta.url), encoding: 'utf8', env });
    const jsonStart = stdout.indexOf('{');
    const evidence = JSON.parse(stdout.slice(jsonStart));
    assert.equal(evidence.automatedChecks.clientServiceCredentials.status, 'needs-review');
    assert.deepEqual(evidence.automatedChecks.clientServiceCredentials.environmentVariables, []);
    assert.ok(evidence.automatedChecks.clientServiceCredentials.distAssetMatches.includes('NAVIDROME_ in dist/m7-credential-fixture.txt'));
    assert.ok(evidence.automatedChecks.clientServiceCredentials.distAssetMatches.includes('POCKET_ID_ in dist/m7-credential-fixture.txt'));
    assert.ok(evidence.incompleteEvidence.some((item) => item.area === 'automatedChecks.clientServiceCredentials'));
  } finally {
    await unlink(fixtureUrl).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
});

test('M7 credential scan flags source-map references', async () => {
  const fixtureUrl = new URL('../dist/m7-source-map-fixture.map', import.meta.url);
  const env = {
    ...process.env,
    VITE_NAVIMUSE_BFF_ORIGIN: 'https://navimuse.example.com',
    NAVIDROME_PASSWORD: '',
    NAVIDROME_USERNAME: '',
    AUDIOMUSE_API_TOKEN: ''
  };
  removeCredentialScanEnvironment(env);
  await mkdir(new URL('../dist/', import.meta.url), { recursive: true });
  await writeFile(fixtureUrl, JSON.stringify({
    version: 3,
    sourcesContent: ['const maybeConfigName = "NAVIDROME_TOKEN"; const otherName = "POCKET_ID_PASSWORD";']
  }), { mode: 0o600 });
  try {
    const { stdout } = await execFileAsync('npm', ['run', 'native:macos:m7-evidence'], { cwd: new URL('..', import.meta.url), encoding: 'utf8', env });
    const jsonStart = stdout.indexOf('{');
    const evidence = JSON.parse(stdout.slice(jsonStart));
    assert.equal(evidence.automatedChecks.clientServiceCredentials.status, 'needs-review');
    assert.deepEqual(evidence.automatedChecks.clientServiceCredentials.environmentVariables, []);
    assert.ok(evidence.automatedChecks.clientServiceCredentials.distAssetMatches.includes('NAVIDROME_ in dist/m7-source-map-fixture.map'));
    assert.ok(evidence.automatedChecks.clientServiceCredentials.distAssetMatches.includes('POCKET_ID_ in dist/m7-source-map-fixture.map'));
  } finally {
    await unlink(fixtureUrl).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
});

test('M7 credential scan treats unscanned dist entries as needs-review', async () => {
  const fixtureUrl = new URL('../dist/m7-unscanned-symlink.txt', import.meta.url);
  const env = {
    ...process.env,
    VITE_NAVIMUSE_BFF_ORIGIN: 'https://navimuse.example.com'
  };
  removeCredentialScanEnvironment(env);
  await mkdir(new URL('../dist/', import.meta.url), { recursive: true });
  await unlink(fixtureUrl).catch(() => {});
  await symlink('/tmp/navimuse-m7-unscanned-target.txt', fixtureUrl);
  try {
    const { stdout } = await execFileAsync('npm', ['run', 'native:macos:m7-evidence'], { cwd: new URL('..', import.meta.url), encoding: 'utf8', env });
    const jsonStart = stdout.indexOf('{');
    const evidence = JSON.parse(stdout.slice(jsonStart));
    assert.equal(evidence.automatedChecks.clientServiceCredentials.status, 'needs-review');
    assert.deepEqual(evidence.automatedChecks.clientServiceCredentials.environmentVariables, []);
    assert.ok(evidence.automatedChecks.clientServiceCredentials.distAssetMatches.some((match) => match.includes('unscanned: symlink')));
    assert.ok(evidence.incompleteEvidence.some((item) => item.area === 'automatedChecks.clientServiceCredentials'));
  } finally {
    await unlink(fixtureUrl).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
});

test('M7 evidence script preserves stderr for failing build and test commands', () => {
  assert.match(m7EvidenceScript, /const output = \[error\.message, error\.stdout, error\.stderr\]\.filter\(Boolean\)\.join\('\\n'\)\.trim\(\)/);
  assert.match(m7EvidenceScript, /return redactSupportText\(`\$\{timedOut \? 'timed-out' : 'unavailable'\}: \$\{output\}`\)/);
  assert.match(m7EvidenceScript, /const output = redactSupportText\(\[result\.stdout, result\.stderr\]\.filter\(Boolean\)\.join\('\\n'\)\.trim\(\)\)/);
  assert.match(m7EvidenceScript, /output: redactSupportText\(\[result\.error\.message, result\.stdout, result\.stderr\]\.filter\(Boolean\)\.join\('\\n'\)\.trim\(\)\)/);
  assert.match(m7EvidenceScript, /parseCommandTimeoutMs\(process\.env\.NAVIMUSE_M7_COMMAND_TIMEOUT_MS, 1200000\)/);
  assert.match(m7EvidenceScript, /parseCommandTimeoutMs\(process\.env\.NAVIMUSE_M7_ENV_COMMAND_TIMEOUT_MS, 30000\)/);
  assert.match(m7EvidenceScript, /timeout: environmentCommandTimeoutMs/);
  assert.match(m7EvidenceScript, /const timedOut = result\.signal === 'SIGTERM' \|\| result\.error\?\.code === 'ETIMEDOUT'/);
  assert.match(m7EvidenceScript, /if \(timedOut\) \{\s+return \{\s+status: 'timed-out'/);
  assert.match(m7EvidenceScript, /productionBuild = commandStatusWithStderr\('npm', \['run', 'build'\]\)/);
  assert.match(m7EvidenceScript, /testSuite = commandStatusWithStderr\('npm', \['test'\]\)/);
  assert.match(m7EvidenceScript, /const sealArgs = \['scripts\/native-macos-seal-app\.mjs'\]/);
  assert.match(m7EvidenceScript, /appBundleSeal = commandStatusWithStderr\('node', sealArgs\)/);
  assert.match(m7EvidenceScript, /function appBundleChecksum\(\)/);
  assert.match(m7EvidenceScript, /treeSha256: digest\.digest\('hex'\)/);
  assert.match(m7EvidenceScript, /const shouldReleaseSeal = process\.argv\.includes\('--release'\)/);
  assert.match(m7EvidenceScript, /if \(shouldReleaseSeal\) \{\s+sealArgs\.push\('--release'\)/);
  assert.match(m7EvidenceScript, /if \(evidence\.automatedChecks\.appBundleSeal\.status === 'passed'\)/);
  assert.match(m7EvidenceScript, /app bundle seal did not pass in this evidence run/);
  assert.match(m7EvidenceScript, /appBundleSignatureDetails = commandStatusWithStderr\('codesign', \['-dv', '--verbose=4', appBundlePath\]\)/);
});

test('M7 release build evidence fails closed without a Developer ID identity', async () => {
  const appBundle = new URL('../src-tauri/target/aarch64-apple-darwin/release/bundle/macos/NaviMuse.app', import.meta.url);
  let bundleBefore = null;
  try {
    bundleBefore = await stat(appBundle);
  } catch {}
  const env = {
    ...process.env,
    VITE_NAVIMUSE_BFF_ORIGIN: 'https://navimuse.example.com',
    NAVIMUSE_MACOS_CODESIGN_IDENTITY: ''
  };
  delete env.NAVIMUSE_MACOS_CODESIGN_IDENTITY;
  const { stdout } = await execFileAsync('npm', ['run', 'native:macos:m7-evidence', '--', '--build', '--release'], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
    env
  });
  const jsonStart = stdout.indexOf('{');
  const evidence = JSON.parse(stdout.slice(jsonStart));
  assert.equal(evidence.buildAttempted, true);
  assert.equal(evidence.buildCommandInvoked, false);
  assert.equal(evidence.releaseSealAttempted, true);
  assert.deepEqual(evidence.evidenceFlags, { build: true, verify: false, release: true });
  assert.match(evidence.buildStatus, /skipped: --release requires an explicit NAVIMUSE_MACOS_CODESIGN_IDENTITY/);
  assert.equal(evidence.automatedChecks.appBundleSeal.status, 'not-run');
  if (bundleBefore) {
    const bundleAfter = await stat(appBundle);
    assert.equal(bundleAfter.mtimeMs, bundleBefore.mtimeMs);
  }
});

test('macOS seal app preflight reports unavailable release sealing inputs', async () => {
  assert.match(macosSealScript, /requireReleaseIdentity && identity === '-'/);
  assert.match(macosSealScript, /identityArgumentInvalid = identity !== '-' && identity\.startsWith\('-'\)/);
  assert.match(macosSealScript, /parseCommandTimeoutMs\(process\.env\.NAVIMUSE_MACOS_SEAL_TIMEOUT_MS, 120000\)/);
  assert.match(macosSealScript, /signing identity must not start with -/);
  assert.match(macosSealScript, /multiple valid certificates share this signing identity name/);
  assert.match(macosSealScript, /app seal did not pass; see sealOutput/);
  assert.match(macosSealScript, /release sealing requires NAVIMUSE_MACOS_CODESIGN_IDENTITY or --identity/);
  assert.match(macosSealScript, /hardenedRuntime: requireReleaseIdentity/);
  assert.match(macosSealScript, /entitlementsPath: requireReleaseIdentity \? entitlementsPath : null/);
  assert.match(macosSealScript, /signArgs\.splice\(1, 0, '--deep'\)/);
  const env = {
    ...process.env,
    NAVIMUSE_MACOS_CODESIGN_IDENTITY: ''
  };
  delete env.NAVIMUSE_MACOS_CODESIGN_IDENTITY;
  let error;
  try {
    await execFileAsync('npm', ['run', 'native:macos:seal-app', '--', '--release'], {
      cwd: new URL('..', import.meta.url),
      encoding: 'utf8',
      env
    });
  } catch (caught) {
    error = caught;
  }
  assert.ok(error);
  const jsonStart = error.stdout.indexOf('{');
  assert.ok(jsonStart >= 0);
  const evidence = JSON.parse(error.stdout.slice(jsonStart));
  assert.equal(evidence.evidenceType, 'native-macos-app-seal');
  assert.equal(evidence.sealStatus, 'unavailable');
  assert.match(evidence.verification.reason, /app bundle does not exist|release sealing requires NAVIMUSE_MACOS_CODESIGN_IDENTITY or --identity/);

  let invalidIdentityError;
  try {
    await execFileAsync('npm', ['run', 'native:macos:seal-app', '--', '--identity', '-sneaky'], {
      cwd: new URL('..', import.meta.url),
      encoding: 'utf8',
      env
    });
  } catch (caught) {
    invalidIdentityError = caught;
  }
  assert.ok(invalidIdentityError);
  const invalidIdentityJsonStart = invalidIdentityError.stdout.indexOf('{');
  assert.ok(invalidIdentityJsonStart >= 0);
  const invalidIdentityEvidence = JSON.parse(invalidIdentityError.stdout.slice(invalidIdentityJsonStart));
  assert.equal(invalidIdentityEvidence.sealStatus, 'unavailable');
  assert.equal(invalidIdentityEvidence.verification.reason, 'signing identity must not start with -');
});

test('support diagnostics command writes redacted valid JSON', async () => {
  assert.match(diagnosticsScript, /const output = \[error\.message, error\.stdout, error\.stderr\]\.filter\(Boolean\)\.join\('\\n'\)\.trim\(\)/);
  assert.match(diagnosticsScript, /return boundedSupportText\(`\$\{timedOut \? 'timed-out' : 'unavailable'\}: \$\{output\}`\)/);
  assert.match(diagnosticsScript, /const redacted = redactSupportText\(String\(value\)\)/);
  assert.match(diagnosticsScript, /truncated after \$\{maxCommandOutputChars\} redacted characters/);
  const env = {
    ...process.env,
    VITE_NAVIMUSE_BFF_ORIGIN: 'https://navimuse.example.com/api?token=url-secret&item_id=track-secret',
    NAVIDROME_PASSWORD: 'navidrome-secret',
    AUDIOMUSE_API_TOKEN: 'audio-secret',
    NAVIMUSE_SETUP_TOKEN: 'setup-secret',
    NAVIMUSE_OIDC_CLIENT_SECRET: 'oidc-secret',
    POCKET_ID_CLIENT_SECRET: 'pocket-secret',
    NAVIDROME_URL: 'https://navidrome.example',
    AUDIOMUSE_URL: 'https://audiomuse.example',
    POCKET_ID_ISSUER: 'https://pocket-id.example'
  };
  const { stdout } = await execFileAsync('npm', ['run', 'native:macos:diagnostics'], { cwd: new URL('..', import.meta.url), encoding: 'utf8', env });
  const outputPath = stdout.trim().split('\n').at(-1);
  try {
    const diagnostics = JSON.parse(await readFile(outputPath, 'utf8'));
    const diagnosticsDirStat = await stat(dirname(outputPath));
    const diagnosticsStat = await stat(outputPath);
    const serialized = JSON.stringify(diagnostics);
    assert.equal(diagnostics.diagnosticType, 'navimuse-macos-support-diagnostics');
    assert.equal(diagnostics.contract, 'docs/support-diagnostics.md');
    assert.match(outputPath, /\/\.scratch\/diagnostics\/navimuse-macos-diagnostics-/);
    assert.equal(diagnosticsDirStat.mode & 0o777, 0o700);
    assert.equal(diagnosticsStat.mode & 0o777, 0o600);
    assert.equal(diagnostics.commandTimeoutMs, 30000);
    assert.equal(diagnostics.maxCommandOutputChars, 12000);
    assert.ok(Array.isArray(diagnostics.exclusions));
    assert.ok(diagnostics.exclusions.includes('cookies'));
    assert.deepEqual(diagnostics.exclusions, diagnostics.excludedDataCategories);
    assert.deepEqual(diagnostics.collectedCommandAllowlist, [
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
    ]);
    assert.match(diagnostics.collectionPolicy, /built only from the fields above and the collectedCommandAllowlist/);
    assert.match(diagnostics.collectionPolicy, /not as values read from disk, browser storage, keychain, Docker, or service configuration/);
    assert.equal(diagnostics.environment.bffOrigin, 'https://navimuse.example.com/api?token=[redacted]&item_id=[redacted]');
    assert.deepEqual(diagnostics.environment.serviceCredentialVariables, {
      count: 5,
      prefixes: ['AUDIOMUSE', 'NAVIDROME', 'NAVIMUSE', 'POCKET_ID']
    });
    assert.equal(diagnostics.tauri.productName, 'NaviMuse');
    assert.equal(diagnostics.tauri.identifier, 'com.developer.navimuse');
    assert.deepEqual(diagnostics.tauri.bundle.targets, ['app']);
    assert.equal(diagnostics.tauri.bundle.macOS.minimumSystemVersion, '14.0');
    assert.equal(diagnostics.tauri.app.security.csp, null);
    assert.equal(diagnostics.releaseEvidence.command, 'npm --silent run native:macos:m7-evidence');
    assert.match(diagnostics.releaseEvidence.summary, /one parseable JSON M7 release evidence object/);
    assert.equal(serialized.includes('url-secret'), false);
    assert.equal(serialized.includes('track-secret'), false);
    assert.equal(serialized.includes('navidrome-secret'), false);
    assert.equal(serialized.includes('audio-secret'), false);
    assert.equal(serialized.includes('setup-secret'), false);
    assert.equal(serialized.includes('oidc-secret'), false);
    assert.equal(serialized.includes('pocket-secret'), false);
    assert.equal(serialized.includes('NAVIDROME_PASSWORD'), false);
    assert.equal(serialized.includes('AUDIOMUSE_API_TOKEN'), false);
    assert.equal(serialized.includes('NAVIMUSE_SETUP_TOKEN'), false);
    assert.equal(serialized.includes('NAVIMUSE_OIDC_CLIENT_SECRET'), false);
    assert.equal(serialized.includes('POCKET_ID_CLIENT_SECRET'), false);
  } finally {
    await unlink(outputPath).catch(() => {});
  }
});

test('support diagnostics command falls back for invalid timeout configuration', async () => {
  const env = {
    ...process.env,
    NAVIMUSE_DIAGNOSTICS_COMMAND_TIMEOUT_MS: 'not-a-number'
  };
  const { stdout } = await execFileAsync('npm', ['run', 'native:macos:diagnostics'], { cwd: new URL('..', import.meta.url), encoding: 'utf8', env });
  const outputPath = stdout.trim().split('\n').at(-1);
  try {
    const diagnostics = JSON.parse(await readFile(outputPath, 'utf8'));
    assert.equal(diagnostics.commandTimeoutMs, 30000);
  } finally {
    await unlink(outputPath).catch(() => {});
  }
});

test('Tauri macOS package icons exist for generated context and app bundle', async () => {
  await access(new URL('../src-tauri/icons/icon.png', import.meta.url));
  await access(new URL('../src-tauri/icons/icon.icns', import.meta.url));
});

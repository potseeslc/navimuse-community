import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { redactSupportText } from './support-redaction.mjs';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const appBundlePath = fileURLToPath(new URL('../src-tauri/target/aarch64-apple-darwin/release/bundle/macos/NaviMuse.app', import.meta.url));
const bffOrigin = process.env.VITE_NAVIMUSE_BFF_ORIGIN || '';
const sessionStartedAt = new Date().toISOString();

function parseCommandTimeoutMs(value, fallback) {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const commandTimeoutMs = parseCommandTimeoutMs(process.env.NAVIMUSE_MACOS_SESSION_EVIDENCE_COMMAND_TIMEOUT_MS, 30000);

function commandOutput(command, args = []) {
  try {
    return redactSupportText(execFileSync(command, args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: commandTimeoutMs }).trim());
  } catch (error) {
    const timedOut = error.signal === 'SIGTERM' || error.code === 'ETIMEDOUT';
    const output = [error.message, error.stdout, error.stderr].filter(Boolean).join('\n').trim();
    return redactSupportText(`${timedOut ? 'timed-out' : 'unavailable'}: ${output}`);
  }
}

function pendingField(instruction) {
  return {
    status: 'pending-manual-validation',
    instruction
  };
}

const evidence = {
  evidenceType: 'native-macos-real-session',
  sessionStartedAt,
  commit: commandOutput('git', ['rev-parse', 'HEAD']),
  dirtyState: commandOutput('git', ['status', '--porcelain']),
  packageVersion: packageJson.version || 'unknown',
  macos: commandOutput('sw_vers'),
  arch: commandOutput('uname', ['-m']),
  rustc: commandOutput('rustc', ['--version']),
  cargo: commandOutput('cargo', ['--version']),
  node: commandOutput('node', ['--version']),
  npm: commandOutput('npm', ['--version']),
  bffOrigin: redactSupportText(bffOrigin || 'unset'),
  appBundlePath,
  appBundleExists: existsSync(appBundlePath),
  realSession: {
    authentication: pendingField('Launch the packaged .app, complete Pocket ID sign-in through the deployed BFF, quit, relaunch, and confirm session recovery without service credentials in the client.'),
    playback: pendingField('Play a real Navidrome library track and record title, artist, approximate duration, play, pause, seek, skip, and stream-continuity results.'),
    sleepWake: pendingField('During playback, sleep the MacBook Air, wake it, and record whether session, queue, and playback recover.'),
    networkRecovery: pendingField('During playback, interrupt network access, restore it, and record degraded-state and recovery behavior.'),
    outputDeviceChange: pendingField('During playback, switch audio output devices and record whether playback continues or recovers.'),
    mediaKeys: pendingField('Use hardware or system media controls for play, pause, previous, next, seek, and stop where available; record each result.'),
    nowPlayingMetadata: pendingField('Verify macOS now-playing metadata shows the current title, artist, album, playback state, and position.'),
    battery: pendingField('Record power source, battery percentage before and after the listening window, and whether App Nap or Low Power Mode affected playback.'),
    memory: pendingField('Record NaviMuse process memory at launch, after playback starts, and after the lifecycle checks.'),
    crash: pendingField('Check for NaviMuse crash reports for this session and record none found or exact crash report identifiers.'),
    logs: pendingField('Capture relevant NaviMuse, WebView, and BFF log excerpts or record that no unexpected errors appeared.')
  },
  m2ExitStatus: 'incomplete-until-real-session-fields-pass'
};

console.log(JSON.stringify(evidence, null, 2));

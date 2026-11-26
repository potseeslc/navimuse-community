import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { lockSessionForOnboarding, onboardingMode } from '../src/onboardingState.js';

const mainSource = await readFile(new URL('../src/main.jsx', import.meta.url), 'utf8');
const onboardingSource = await readFile(new URL('../src/OnboardingSurface.jsx', import.meta.url), 'utf8');

test('onboarding owns every state before an authenticated application session', () => {
  assert.equal(onboardingMode({}), 'loading');
  assert.equal(onboardingMode({ resolved: true, error: 'offline' }), 'error');
  assert.equal(onboardingMode({ resolved: true, adminConfigured: false }), 'setup');
  assert.equal(onboardingMode({ resolved: true, adminConfigured: true, authenticated: false }), 'login');
  assert.equal(onboardingMode({ resolved: true, adminConfigured: true, authenticated: true }), 'app');
});

test('expired sessions return to onboarding without navigating into Settings', () => {
  const expired = lockSessionForOnboarding({ adminConfigured: true, authenticated: true, authMode: 'oidc', user: { name: 'Listener' } });
  assert.deepEqual(expired, { adminConfigured: true, authenticated: false, authMode: 'oidc', user: { name: 'Listener' } });
  assert.equal(onboardingMode({ ...expired, resolved: true }), 'login');
  const unlockHandler = mainSource.match(/const showUnlock = \(\) => \{[\s\S]*?\n    \};/)?.[0] || '';
  assert.match(unlockHandler, /lockSessionForOnboarding/);
  assert.doesNotMatch(unlockHandler, /setActiveTab\('settings'\)/);
  assert.match(mainSource, /if \(currentOnboardingMode !== 'app'\) \{/);
  assert.match(mainSource, /<OnboardingSurface/);
});

test('onboarding exposes distinct Pocket ID, password, setup, loading, and retry states', () => {
  assert.match(onboardingSource, /Continue with Pocket ID/);
  assert.match(onboardingSource, /Unlock NaviMuse/);
  assert.match(onboardingSource, /Secure and continue/);
  assert.match(onboardingSource, /<LoadingDots label="Opening NaviMuse"/);
  assert.match(onboardingSource, /Try again/);
  assert.match(mainSource, /refreshSession\(\{ showLoading: true \}\)/);
  assert.match(mainSource, /finally \{\s*if \(sessionAliveRef.current && requestId === sessionRequestRef.current\) setSessionResolved\(true\)/);
});

test('packaged startup completes the first-party redirect before mounting the app', () => {
  const redirectBranch = mainSource.match(/if \(nativeFirstPartyRedirect\) \{[\s\S]*?window\.location\.replace\(nativeFirstPartyRedirect\);[\s\S]*?\} else \{[\s\S]*?createRoot\(document\.getElementById\('root'\)\)/)?.[0] || '';
  assert.match(redirectBranch, /window\.location\.replace\(nativeFirstPartyRedirect\)/);
  assert.match(redirectBranch, /\} else \{[\s\S]*?createRoot/);

  const redirectIndex = mainSource.indexOf('if (nativeFirstPartyRedirect) {');
  const appMountIndex = mainSource.indexOf("createRoot(document.getElementById('root'))");
  assert.ok(redirectIndex > 0);
  assert.ok(appMountIndex > redirectIndex);
});

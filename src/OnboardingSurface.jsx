import { TowerArtwork } from './TowerArtwork.jsx';
import {LoadingDots} from './LoadingDots.jsx';
import React, { useState } from 'react';
import { Fingerprint, KeyRound, LoaderCircle, RadioTower, ShieldCheck, Wifi } from 'lucide-react';
import { onboardingMode } from './onboardingState.js';

export function OnboardingSurface({ message, onLogin, onRetry, onSetup, onSignIn, session }) {
  const mode = onboardingMode(session);
  const [password, setPassword] = useState('');
  const [setupToken, setSetupToken] = useState('');
  const [busy, setBusy] = useState(false);

  const submitPassword = async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const succeeded = mode === 'setup'
        ? await onSetup(password, setupToken)
        : await onLogin(password);
      if (succeeded) {
        setPassword('');
        setSetupToken('');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="onboarding-shell">
      <section className="onboarding-frame" aria-label="NaviMuse secure access">
        <header className="onboarding-brand">
          <RadioTower aria-hidden="true" size={30} strokeWidth={1.6} />
          <span>NaviMuse</span>
        </header>
        <TowerArtwork />
        <div className="onboarding-copy">
          {mode === 'loading' && (
            <div className="onboarding-state" role="status">
              <LoadingDots label="Opening NaviMuse"/>
              <h1>NaviMuse</h1>
              <p>Checking the secure listening session on this device.</p>
            </div>
          )}
          {mode === 'error' && (
            <div className="onboarding-state" role="alert">
              <Wifi size={28} />
              <h1>NaviMuse is out of reach</h1>
              <p>{session.error}</p>
              <button className="onboarding-primary" type="button" onClick={onRetry}>Try again</button>
            </div>
          )}
          {mode === 'login' && session.authMode === 'oidc' && (
            <div className="onboarding-state">
              <p className="onboarding-eyebrow">Secure access</p>
              <h1>Welcome back</h1>
              <p>Sign in to continue listening.</p>
              <button className="onboarding-primary" type="button" onClick={onSignIn}>
                <Fingerprint size={20} /> Continue with Pocket ID
              </button>
              <SessionStatus />
              {message && <p className="onboarding-message" role="status">{message}</p>}
            </div>
          )}
          {(mode === 'setup' || (mode === 'login' && session.authMode !== 'oidc')) && (
            <form className="onboarding-state" onSubmit={submitPassword}>
              <p className="onboarding-eyebrow">{mode === 'setup' ? 'First run' : 'Secure access'}</p>
              <h1>{mode === 'setup' ? 'Make NaviMuse yours' : 'Welcome back'}</h1>
              <p>{mode === 'setup' ? 'Secure this installation before connecting your music services.' : 'Unlock your listening space to continue.'}</p>
              {mode === 'setup' && (
                <label className="onboarding-field">
                  <span>Setup token</span>
                  <input autoComplete="one-time-code" onChange={(event) => setSetupToken(event.target.value)} placeholder="From the NaviMuse server" required value={setupToken} />
                </label>
              )}
              <label className="onboarding-field">
                <span>{mode === 'setup' ? 'Create an admin password' : 'Admin password'}</span>
                <input autoComplete={mode === 'setup' ? 'new-password' : 'current-password'} minLength={12} onChange={(event) => setPassword(event.target.value)} placeholder="At least 12 characters" required type="password" value={password} />
              </label>
              <button className="onboarding-primary" disabled={busy} type="submit">
                {mode === 'setup' ? <ShieldCheck size={20} /> : <KeyRound size={20} />}
                {busy ? 'Please wait…' : (mode === 'setup' ? 'Secure and continue' : 'Unlock NaviMuse')}
              </button>
              <SessionStatus />
              {message && <p className="onboarding-message" role="status">{message}</p>}
            </form>
          )}
        </div>
      </section>
    </main>
  );
}

function SessionStatus() {
  return <p className="onboarding-found"><span aria-hidden="true" /> NaviMuse found</p>;
}

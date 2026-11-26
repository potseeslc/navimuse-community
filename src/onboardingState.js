export function onboardingMode(session = {}) {
  if (!session.resolved) return 'loading';
  if (session.error) return 'error';
  if (!session.adminConfigured) return 'setup';
  if (!session.authenticated) return 'login';
  return 'app';
}

export function lockSessionForOnboarding(session = {}) {
  return { ...session, authenticated: false };
}

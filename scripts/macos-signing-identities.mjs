const SHA1_FINGERPRINT = /^[A-Fa-f0-9]{40}$/;

export function parseCodesigningIdentities(output) {
  return String(output || '')
    .split('\n')
    .map((line) => line.match(/^\s*\d+\)\s+([A-Fa-f0-9]{40})\s+"([^"]+)"\s*$/))
    .filter(Boolean)
    .map((match) => ({ fingerprint: match[1].toUpperCase(), name: match[2] }));
}

export function signingIdentityPreflight(identity, identityOutput) {
  if (identity === '-' || SHA1_FINGERPRINT.test(identity || '')) {
    return { status: 'ready', matchingFingerprints: [] };
  }

  const matchingFingerprints = parseCodesigningIdentities(identityOutput)
    .filter((candidate) => candidate.name === identity)
    .map((candidate) => candidate.fingerprint);

  return {
    status: matchingFingerprints.length > 1 ? 'ambiguous' : 'ready',
    matchingFingerprints
  };
}

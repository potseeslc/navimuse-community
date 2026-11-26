const identifierKeyPattern = String.raw`(?:(?:raw|provider|navidrome|audiomuse|atlas)[_-]?)?(?:item|track|point|song)[_-]?id`;
const knownSecretKeyPattern = String.raw`navimuse_session|NAVIMUSE_SETUP_TOKEN|NAVIDROME_PASSWORD|AUDIOMUSE_API_TOKEN|NAVIMUSE_OIDC_CLIENT_SECRET`;
const genericSecretKeyPattern = String.raw`[A-Z0-9_-]*(?:PASSWORD|TOKEN|SECRET|COOKIE|SESSION)[A-Z0-9_-]*`;
const freeTextAssignmentPattern = new RegExp(
  String.raw`\b(?:${identifierKeyPattern}|${knownSecretKeyPattern}|${genericSecretKeyPattern})\b\s*[:=]\s*`,
  'gi'
);

function redactFreeTextAssignments(value) {
  const matches = [...value.matchAll(freeTextAssignmentPattern)];
  if (matches.length === 0) {
    return value;
  }

  let redacted = '';
  let cursor = 0;
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const nextMatch = matches[index + 1];
    const valueStart = match.index + match[0].length;
    const openingQuote = value[valueStart];
    let valueEnd = nextMatch?.index ?? value.length;
    let separator = '';

    if (openingQuote === '"' || openingQuote === "'") {
      const closingQuoteIndex = value.indexOf(openingQuote, valueStart + 1);
      if (closingQuoteIndex >= 0 && closingQuoteIndex < valueEnd) {
        valueEnd = closingQuoteIndex + 1;
      }
    } else {
      const lineEndMatch = value.slice(valueStart, valueEnd).match(/\r?\n/);
      if (lineEndMatch?.index >= 0) {
        valueEnd = valueStart + lineEndMatch.index;
      } else if (nextMatch) {
        const valueWithSeparator = value.slice(valueStart, valueEnd);
        separator = valueWithSeparator.match(/[\s&;,]+$/)?.[0] ?? '';
        valueEnd -= separator.length;
      }
      const closingQuoteIndex = value.slice(valueStart, valueEnd).search(/["']/);
      if (closingQuoteIndex >= 0) {
        valueEnd = valueStart + closingQuoteIndex;
        separator = '';
      }
    }

    redacted += value.slice(cursor, valueStart);
    redacted += '[redacted]';
    redacted += separator;
    cursor = valueEnd + separator.length;
  }
  redacted += value.slice(cursor);
  return redacted;
}

export function redactSupportText(value) {
  const structuredRedacted = String(value ?? '')
    .replace(/("([A-Z0-9_-]*(?:(?:PASSWORD|TOKEN|SECRET|COOKIE|SESSION)|API[_-]?KEY)[A-Z0-9_-]*)"\s*:\s*)"[^"]*"/gi, '$1"[redacted]"')
    .replace(/("([A-Z0-9_-]*(?:(?:PASSWORD|TOKEN|SECRET|COOKIE|SESSION)|API[_-]?KEY)[A-Z0-9_-]*)"\s*:\s*)-?\d+(?:\.\d+)?/gi, '$1"[redacted]"')
    .replace(/("authorization"\s*:\s*)"[^"]*"/gi, '$1"[redacted]"')
    .replace(/("(?:(?:raw|provider|navidrome|audiomuse|atlas)?[_-]?)?(?:item|track|point|song)[_-]?id"\s*:\s*)"[^"]*"/gi, '$1"[redacted]"')
    .replace(/(authorization\s*:\s*)(["']).*?\2/gi, '$1[redacted]')
    .replace(/((?:cookie|set-cookie)\s*:\s*)(["']).*?\2/gi, '$1[redacted]')
    .replace(/(authorization\s*:\s*)[^\n\r"',;}]+/gi, '$1[redacted]')
    .replace(/((?:cookie|set-cookie)\s*:\s*)[^\n\r"',}]+/gi, '$1[redacted]')
    .replace(/\b(https?:\/\/)[^/?#\s"',;{}]+@/gi, '$1[redacted]@')
    .replace(/([?&](?:password|token|api[_-]?key|item[_-]?id|track[_-]?id|point[_-]?id|song[_-]?id|setup[_-]?token|client[_-]?secret)=)[^&\s"',;}]+/gi, '$1[redacted]');

  return redactFreeTextAssignments(structuredRedacted);
}

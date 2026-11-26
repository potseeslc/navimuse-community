import { apiJson, jsonRequest } from './apiClient.js';
import { parseAtlasPointInspectionRequest, parseAtlasResolutionError, validateAtlasPointInspectionAgainstRequest } from '../../shared/sonic-atlas/index.js';

export async function inspectAtlasPoint({ identity, pointId, requestId = `inspect-${crypto.randomUUID()}`, signal } = {}) {
  const request = parseAtlasPointInspectionRequest({
    contractVersion: 'sonic-atlas/v1', kind: 'atlas-point-inspection-request',
    identity, pointId, requestId
  });
  signal?.throwIfAborted();
  let onAbort;
  const aborted = new Promise((_, reject) => {
    onAbort = () => reject(signal.reason);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
  try {
    const payload = await Promise.race([
      apiJson('/api/atlas/points/inspect', jsonRequest('POST', request, {
        signal, cache: 'no-store', headers: { 'x-requested-with': 'NaviMuse', 'x-request-id': requestId }
      }), 'That Atlas track could not be loaded.'),
      aborted
    ]);
    signal?.throwIfAborted();
    return validateAtlasPointInspectionAgainstRequest(payload, request);
  } catch (error) {
    if (signal?.aborted) throw signal.reason;
    // Keep upstream text out of the inspector. Only correlated public errors
    // may supply a specific recovery state.
    const safeError = new Error('That Atlas track could not be loaded.');
    if (Number.isInteger(error?.status)) safeError.status = error.status;
    if (error?.payload) {
      try {
        const atlas = parseAtlasResolutionError(error.payload);
        if (atlas.requestId === requestId) safeError.atlas = atlas;
      } catch { /* Untrusted/malformed errors retain the generic message. */ }
    }
    throw safeError;
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
}

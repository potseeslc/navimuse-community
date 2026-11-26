import { parseAtlasPointInspectionRequest, parseAtlasResolutionError, validateAtlasPointInspectionAgainstRequest } from '../shared/sonic-atlas/index.js';
import { inspectAtlasPoint } from './services/atlasPointInspectionService.js';

// The caller supplies the current account/library scope and a point from a
// validated tile. Scope is a lifecycle guard, never an authorization claim.
export function createAtlasPointSelection({ inspect = inspectAtlasPoint, onChange = () => {} } = {}) {
  let scope = null;
  let revision = 0;
  let pending = null;
  let disposed = false;
  let state = Object.freeze({ status: 'idle' });
  const publish = next => { state = Object.freeze(next); onChange(state); };
  const invalidate = () => { revision++; pending?.abort(); pending = null; };
  return Object.freeze({
    getState: () => state,
    setScope(nextScope) {
      if (disposed) return;
      if (nextScope !== null && (typeof nextScope !== 'string' || !nextScope.trim())) throw new TypeError('An explicit account/library scope is required');
      if (scope === nextScope) return;
      invalidate(); scope = nextScope; publish({status: 'idle'});
    },
    clear() {
      if (disposed) return;
      invalidate(); publish({status: 'idle'});
    },
    async select({ identity, pointId, coordinate }) {
      if (disposed || scope === null) throw new Error('Atlas selection requires an active scope');
      if (!Number.isFinite(coordinate?.x) || !Number.isFinite(coordinate?.y)) throw new TypeError('An exact tile coordinate is required');
      const expectedCoordinate = Object.freeze({x: coordinate.x, y: coordinate.y});
      const request = parseAtlasPointInspectionRequest({contractVersion: 'sonic-atlas/v1', kind: 'atlas-point-inspection-request', requestId: `inspect-${crypto.randomUUID()}`, identity, pointId});
      invalidate();
      const selectedRevision = revision;
      const controller = new AbortController();
      pending = controller;
      const isCurrent = () => !disposed && selectedRevision === revision && !controller.signal.aborted;
      publish({status: 'loading', pointId, coordinate: expectedCoordinate});
      try {
        const response = await inspect({...request, signal: controller.signal});
        if (!isCurrent()) return;
        const result = validateAtlasPointInspectionAgainstRequest(response, request);
        if (result.coordinate.x !== expectedCoordinate.x || result.coordinate.y !== expectedCoordinate.y) throw new Error('Atlas coordinate mismatch');
        pending = null;
        publish({status: 'ready', pointId, coordinate: expectedCoordinate, result});
      } catch (error) {
        if (!isCurrent()) return;
        pending = null;
        // UI receives no transport payload, credentials, or arbitrary error text.
        let details = {message: 'That Atlas track could not be loaded.', retryable: true};
        try {
          const atlas = parseAtlasResolutionError(error?.atlas);
          if (atlas.requestId === request.requestId) details = {message: atlas.message, retryable: atlas.retryable, code: atlas.code};
        } catch { /* Only the fixed public error catalog can refine recovery. */ }
        publish({status: 'failed', pointId, coordinate: expectedCoordinate, ...details});
      }
    },
    dispose() {
      if (disposed) return;
      invalidate(); disposed = true; scope = null;
      state = Object.freeze({status: 'idle'});
    }
  });
}

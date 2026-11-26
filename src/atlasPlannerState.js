export function isCurrentAtlasPlan(capturedGeneration, currentGeneration) {
  return capturedGeneration === currentGeneration;
}

export function invalidatedPlannerState() {
  return Object.freeze({ planning: false });
}

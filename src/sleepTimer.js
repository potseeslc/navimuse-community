export const SLEEP_TIMER_MINUTES = Object.freeze([15, 30, 45, 60, 90]);
export function sleepTimerDeadline(minutes, now = Date.now()) {
  if (!SLEEP_TIMER_MINUTES.includes(minutes)) throw new Error('Choose a sleep timer duration.');
  return now + minutes * 60000;
}
export function sleepTimerLabel(deadline, now = Date.now()) {
  const seconds = Math.max(0, Math.ceil((deadline - now) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
// Absolute deadlines avoid extending the timer when browser callbacks are delayed.
export function createSleepTimer({now = Date.now, onExpire, onChange = () => {}}) {
  let deadline = 0;
  return {
    get deadline() { return deadline; },
    start(minutes) { deadline = sleepTimerDeadline(minutes, now()); onChange(deadline); },
    cancel() { deadline = 0; onChange(0); },
    tick() {
      if (!deadline || now() < deadline) return false;
      deadline = 0; onChange(0); onExpire(); return true;
    }
  };
}

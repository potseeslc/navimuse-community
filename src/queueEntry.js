export function clearQueueEntry(entryRef) {
  entryRef.current = { opener: null, closePlayer: false };
}

export function setQueueEntry(entryRef, opener, closePlayer = false) {
  entryRef.current = { opener: opener || null, closePlayer: Boolean(closePlayer) };
}

export function finishQueueEntry(entryRef, { closePanel, closePlayer, preservePlayer = false, scheduleFocus }) {
  const entry = entryRef.current || { opener: null, closePlayer: false };
  if (entry.closePlayer && !preservePlayer) closePlayer?.();
  else closePanel?.();
  clearQueueEntry(entryRef);
  scheduleFocus(() => {
    if (entry.opener?.isConnected) entry.opener.focus();
  });
  return entry;
}

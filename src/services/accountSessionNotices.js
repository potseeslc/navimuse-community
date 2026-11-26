// This is a recheck hint, never an authentication result. Cookie mutations stay
// serialized by Web Locks; recipients obtain identity only from the BFF.
export function createAccountSessionNotices(name, factory = value => new globalThis.window.BroadcastChannel(value)) {
  const listeners = new Set();
  let channel = null;
  function open() {
    if (channel) return channel;
    try {
      channel = factory(name);
      channel.onmessage = ({data}) => {
        if (!data || data.version !== 1 || data.type !== 'session-changed' || Object.keys(data).length !== 2) return;
        for (const listener of listeners) listener();
      };
    } catch { channel = null; }
    return channel;
  }
  function close() {
    try { channel?.close(); } catch {}
    channel = null;
  }
  return Object.freeze({
    subscribe(listener) {
      listeners.add(listener);
      open();
      return () => { listeners.delete(listener); if (!listeners.size) close(); };
    },
    publish() {
      // Notification support must not turn a successful server mutation into an
      // apparent failure. A one-shot client does not retain a channel handle.
      try { open()?.postMessage({version:1,type:'session-changed'}); } catch {}
      finally { if (!listeners.size) close(); }
    },
  });
}

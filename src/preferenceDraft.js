// Adopt refreshed saved fields without replacing the listener's unsaved edits.
// Preferences are a normalized tree of scalar values, owned by appSettings.
export function refreshPreferenceDraft(previous, draft, saved) {
  return Object.fromEntries(Object.entries(saved).map(([key, value]) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return [key, refreshPreferenceDraft(previous?.[key] || {}, draft?.[key] || {}, value)];
    }
    const local = draft?.[key];
    return [key, local === undefined || Object.is(local, previous?.[key]) ? value : local];
  }));
}

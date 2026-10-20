// Which browser origins may call the API. ALLOWED_EXTENSION_IDS (comma-separated) pins it to
// PR Lens's own extension ID; unset, any extension may call it (handy before an ID is fixed).
// This only stops other browser extensions and websites. Scripts can still call the API
// directly; what they can use is limited by needing a valid GitHub token and the free tiers.
export function allowedOrigin(origin: string, allowedExtensionIds: string | undefined): string | null {
  if (!origin.startsWith('chrome-extension://')) return null;
  if (allowedExtensionIds === undefined || allowedExtensionIds.trim() === '') return origin;
  const ids = allowedExtensionIds.split(',').map((id) => id.trim());
  return ids.includes(origin.slice('chrome-extension://'.length)) ? origin : null;
}

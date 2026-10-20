import type { AskResponse, PrData } from '@pr-lens/shared';

export type SavedTurn = { question: string; response: AskResponse };

// Kept in chrome.storage.session: survives closing and reopening the panel, cleared when the
// browser closes, never synced. Keyed by commit, so a new push starts a fresh conversation.
const key = (pr: PrData) => `ask:${pr.owner}/${pr.repo}#${pr.number}@${pr.headSha}`.toLowerCase();

export async function loadConversation(pr: PrData): Promise<SavedTurn[]> {
  const stored = (await chrome.storage.session.get(key(pr)))[key(pr)];
  return Array.isArray(stored) ? (stored as SavedTurn[]) : [];
}

export async function saveConversation(pr: PrData, turns: SavedTurn[]): Promise<void> {
  if (turns.length === 0) await chrome.storage.session.remove(key(pr));
  else await chrome.storage.session.set({ [key(pr)]: turns });
}

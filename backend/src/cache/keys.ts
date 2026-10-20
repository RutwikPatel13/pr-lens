import type { PrRef } from '@pr-lens/shared';

// Bump to invalidate every cached entry of that kind: old keys stop matching and expire.
// PR_DETAILS_VERSION: GitHub fields we store, or the risk rules (their flags are cached with the details).
// ANALYSIS_VERSION: prompts, chunking, models, or the PrAnalysis shape.
// ASK_VERSION: Ask prompts, context gathering, or the AskResponse shape.
// REPLY_VERSION: the suggested-reply prompt or the SuggestedReply shape.
export const PR_DETAILS_VERSION = 1;
export const ANALYSIS_VERSION = 1;
export const ASK_VERSION = 1;
export const REPLY_VERSION = 2;

export const CACHE_TTL_SECONDS = 30 * 24 * 60 * 60;

// GitHub owner/repo names are case-insensitive; the URL may use either.
const prId = (ref: PrRef, headSha: string) => `${ref.owner.toLowerCase()}/${ref.repo.toLowerCase()}#${ref.number}@${headSha}`;

export const detailsKey = (ref: PrRef, headSha: string) => `details:v${PR_DETAILS_VERSION}:${prId(ref, headSha)}`;
export const analysisKey = (ref: PrRef, headSha: string) => `analysis:v${ANALYSIS_VERSION}:${prId(ref, headSha)}`;

// Questions that differ only in case or spacing share an answer.
export function normalizeQuestion(question: string): string {
  return question.trim().replace(/\s+/g, ' ').toLowerCase();
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Only first questions in a conversation are cached (follow-ups depend on what came before).
// Hashed to keep KV keys short whatever the question's length.
export async function askKey(ref: PrRef, headSha: string, question: string): Promise<string> {
  return `ask:v${ASK_VERSION}:${prId(ref, headSha)}:${await sha256Hex(normalizeQuestion(question))}`;
}

// A new comment in the thread changes the key, so the suggestion is redrafted; so does a new
// commit. The viewer is part of it: a reply is written as a particular person.
export const replyKey = (ref: PrRef, headSha: string, threadId: string, commentCount: number, lastCommentAt: string, viewer: string) =>
  `reply:v${REPLY_VERSION}:${prId(ref, headSha)}:${threadId}:${commentCount}:${lastCommentAt}:${viewer.toLowerCase()}`;

import type { NotReadFile, PrData } from '@pr-lens/shared';
import type { PromptFile } from './chunking';
import type { MapFileNotes } from './schemas';
import type { LlmRequest } from './types';

const SYSTEM = `You help a code reviewer understand a GitHub pull request before they read it.
Be specific and brief. Describe what the code does, not what it might do in general.
Never invent files, functions or line references that aren't in the input.
Reply with a single JSON object and nothing else.`;

const MAX_DESCRIPTION_CHARS = 2_000;
const MAX_COMMITS = 30;

function describePr(pr: PrData): string {
  const description = pr.body.trim() === '' ? '(none)' : pr.body.slice(0, MAX_DESCRIPTION_CHARS);
  return `Pull request: ${pr.title}
Repository: ${pr.owner}/${pr.repo}, merging ${pr.headRef} into ${pr.baseRef}
Description:
${description}`;
}

function describeFile(file: PromptFile): string {
  const flags = file.ruleFlags.map((f) => `- rule flag ${f.ruleId}${f.lines === null ? '' : ` at ${f.lines.side === 'RIGHT' ? 'R' : 'L'}${f.lines.start}`}: ${f.explanation}`);
  return [file.header, ...flags, file.numberedDiff, ...(file.truncated ? ['[diff truncated here]'] : [])].join('\n');
}

export function mapRequest(pr: PrData, files: PromptFile[]): LlmRequest {
  return {
    system: SYSTEM,
    maxOutputTokens: 4_000,
    prompt: `${describePr(pr)}

Below are some of the changed files. Each diff line starts with its line reference:
R<n> is line n of the new file, L<n> is line n of the old file. "+" means added, "-" removed.
A rule engine has already flagged some files; those flags are listed under the file header.

${files.map(describeFile).join('\n\n')}

For every file above, return:
- "path": exactly as written in its header
- "role": one of "schema", "config", "core", "api", "ui", "test", "docs", "other"
- "summary": one or two sentences on what changed in this file
- "concerns": up to 3 specific things the reviewer should check (a likely bug, an unhandled case, risky behavior). Use [] if nothing stands out. For each:
  - "line": the most relevant line reference from the diff, like "R12", or null
  - "category": one of "schema", "auth", "payments", "config", "dependencies", "tests", "secrets", "logic"
  - "severity": "high", "medium" or "low"
  - "explanation": one sentence
  Only repeat a rule flag if you can add something specific, such as whether it's actually a problem in context.

JSON shape:
{"files":[{"path":"src/example.ts","role":"core","summary":"...","concerns":[{"line":"R12","category":"logic","severity":"medium","explanation":"..."}]}]}`,
  };
}

export function reduceRequest(pr: PrData, notes: MapFileNotes[], notRead: NotReadFile[]): LlmRequest {
  const commits = pr.commits.slice(0, MAX_COMMITS).map((c) => `- ${c.message.split('\n')[0]}`);
  const issues = pr.linkedIssues.map((i) => `- #${i.number} ${i.title}`);
  const files = notes.map((n) => `- ${n.path} [${n.role}]: ${n.summary}`);
  const skipped = notRead.map((n) => `- ${n.path} (${n.reason})`);

  return {
    system: SYSTEM,
    maxOutputTokens: 3_000,
    prompt: `${describePr(pr)}

Linked issues:
${issues.length > 0 ? issues.join('\n') : '(none)'}

Commit messages:
${commits.length > 0 ? commits.join('\n') : '(none)'}

Changed files, with a note on each:
${files.length > 0 ? files.join('\n') : '(none)'}

Changed files not read (lockfiles, generated files, or too large):
${skipped.length > 0 ? skipped.join('\n') : '(none)'}

Return:
- "what": 2 to 4 sentences on what this PR changes, for someone about to review it
- "why": 1 or 2 sentences on the likely reason, based on the description, commits and linked issues. If the reason isn't clear, say so.
- "areas": short names of the parts of the system it touches, at most 6
- "reviewOrder": every file from "Changed files" above, in the order a reviewer should read them, each with a short "reason". Put files that define data or contracts first (schema, migrations, shared types, config), then core logic, then API and UI, then tests and docs.

JSON shape:
{"what":"...","why":"...","areas":["..."],"reviewOrder":[{"path":"src/example.ts","reason":"..."}]}`,
  };
}

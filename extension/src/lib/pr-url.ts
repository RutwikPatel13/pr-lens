export type PrRef = {
  owner: string;
  repo: string;
  number: number;
};

// Matches /owner/repo/pull/123 plus any sub-page (/files, /commits, ...).
const PR_PATH = /^\/(?<owner>[A-Za-z0-9-]+)\/(?<repo>[A-Za-z0-9._-]+)\/pull\/(?<number>\d+)(?:\/|$)/;

export function parsePrUrl(url: string | undefined): PrRef | null {
  if (url === undefined || !URL.canParse(url)) return null;

  const { origin, pathname } = new URL(url);
  if (origin !== 'https://github.com') return null;

  const groups = PR_PATH.exec(pathname)?.groups;
  if (groups?.owner === undefined || groups.repo === undefined || groups.number === undefined) {
    return null;
  }

  return { owner: groups.owner, repo: groups.repo, number: Number(groups.number) };
}

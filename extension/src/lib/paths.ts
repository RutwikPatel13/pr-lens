// Side-panel-friendly paths: the file name matters most, so long names keep their end.
const MAX_NAME = 36;

export function splitPath(path: string): { dir: string; name: string } {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? { dir: '', name: path } : { dir: path.slice(0, slash), name: path.slice(slash + 1) };
}

export function shortName(name: string, max = MAX_NAME): string {
  return name.length <= max ? name : `…${name.slice(-(max - 1))}`;
}

export function shortPath(path: string, max = MAX_NAME): string {
  return path.length <= max ? path : `…${path.slice(-(max - 1))}`;
}

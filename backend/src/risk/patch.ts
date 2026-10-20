// The parser lives in /shared so the extension can run custom rules over the same diff lines.
export { parsePatch, type DiffLine } from '@pr-lens/shared/patch';

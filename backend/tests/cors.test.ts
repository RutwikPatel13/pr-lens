import { describe, expect, it } from 'vitest';
import { allowedOrigin } from '../src/cors';

describe('allowedOrigin', () => {
  it('allows only the listed extension IDs when configured', () => {
    expect(allowedOrigin('chrome-extension://abc', 'abc, def')).toBe('chrome-extension://abc');
    expect(allowedOrigin('chrome-extension://def', 'abc,def')).toBe('chrome-extension://def');
    expect(allowedOrigin('chrome-extension://evil', 'abc,def')).toBeNull();
  });

  it('allows any extension when no IDs are configured', () => {
    expect(allowedOrigin('chrome-extension://anything', undefined)).toBe('chrome-extension://anything');
  });

  it('never allows websites', () => {
    expect(allowedOrigin('https://evil.example', undefined)).toBeNull();
    expect(allowedOrigin('https://github.com', 'abc')).toBeNull();
  });
});

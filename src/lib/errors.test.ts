// src/lib/errors.test.ts
import { describe, it, expect } from 'vitest';
import { TransientError, TerminalError, ExternalApiError } from './errors';

describe('error classes', () => {
  it('TransientError is an Error with its name', () => {
    const e = new TransientError('timeout');
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('TransientError');
    expect(e.message).toBe('timeout');
  });

  it('TerminalError is distinguishable from TransientError', () => {
    const e = new TerminalError('bad json');
    expect(e.name).toBe('TerminalError');
    expect(e instanceof TransientError).toBe(false);
  });

  it('ExternalApiError captures service + status + body', () => {
    const e = new ExternalApiError('perplexity', 429, 'rate limit');
    expect(e.service).toBe('perplexity');
    expect(e.status).toBe(429);
    expect(e.body).toBe('rate limit');
    expect(e.message).toContain('perplexity');
    expect(e.message).toContain('429');
  });
});

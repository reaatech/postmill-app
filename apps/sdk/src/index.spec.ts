import { describe, expect, it } from 'vitest';
import Postmill from './index';

describe('Postmill SDK', () => {
  it('exports a configurable Postmill client', () => {
    const client = new Postmill('test-api-key');
    expect(client).toBeInstanceOf(Postmill);
    expect(typeof client.post).toBe('function');
    expect(typeof client.postList).toBe('function');
    expect(typeof client.upload).toBe('function');
    expect(typeof client.integrations).toBe('function');
    expect(typeof client.deletePost).toBe('function');
  });

  it('allows overriding the API base path', () => {
    const client = new Postmill('test-api-key', 'https://custom.example.com');
    expect(client).toBeInstanceOf(Postmill);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  setCredentials,
  getCredential,
  getEnvOr,
  clearCredentials,
  replaceCredentialsMap,
} from './credentials';

describe('credentials', () => {
  beforeEach(() => {
    clearCredentials();
    vi.unstubAllEnvs();
  });

  describe('setCredentials / getCredential', () => {
    it('sets and retrieves a credential entry', () => {
      setCredentials('github', { clientId: 'abc', clientSecret: 'secret' });
      expect(getCredential('github', 'clientId')).toBe('abc');
      expect(getCredential('github', 'clientSecret')).toBe('secret');
    });

    it('returns undefined for all keys when identifier is missing', () => {
      expect(getCredential('nonexistent', 'clientId')).toBeUndefined();
      expect(getCredential('nonexistent', 'clientSecret')).toBeUndefined();
      expect(getCredential('nonexistent', 'redirectUri')).toBeUndefined();
      expect(getCredential('nonexistent', 'token')).toBeUndefined();
    });

    it('overwrites an existing entry', () => {
      setCredentials('twitter', { clientId: 'old' });
      setCredentials('twitter', { clientId: 'new' });
      expect(getCredential('twitter', 'clientId')).toBe('new');
    });

    it('returns undefined for keys not present in entry', () => {
      setCredentials('slack', { clientId: '123' });
      expect(getCredential('slack', 'clientSecret')).toBeUndefined();
      expect(getCredential('slack', 'redirectUri')).toBeUndefined();
      expect(getCredential('slack', 'token')).toBeUndefined();
    });

    it('handles all four credential key types', () => {
      setCredentials('all-keys', {
        clientId: 'cid',
        clientSecret: 'cs',
        redirectUri: 'ru',
        token: 'tok',
      });
      expect(getCredential('all-keys', 'clientId')).toBe('cid');
      expect(getCredential('all-keys', 'clientSecret')).toBe('cs');
      expect(getCredential('all-keys', 'redirectUri')).toBe('ru');
      expect(getCredential('all-keys', 'token')).toBe('tok');
    });

    it('stores and retrieves entries with empty string values', () => {
      setCredentials('empty', { clientId: '' });
      expect(getCredential('empty', 'clientId')).toBe('');
    });

    it('handles entries with undefined field values', () => {
      setCredentials('undef', { clientId: undefined });
      expect(getCredential('undef', 'clientId')).toBeUndefined();
    });

    it('supports multiple independent providers', () => {
      setCredentials('a', { clientId: 'a-id' });
      setCredentials('b', { clientId: 'b-id' });
      expect(getCredential('a', 'clientId')).toBe('a-id');
      expect(getCredential('b', 'clientId')).toBe('b-id');
    });
  });

  describe('getEnvOr', () => {
    it('returns the cached value when it exists', () => {
      setCredentials('github', { clientId: 'cached-id' });
      expect(getEnvOr('GITHUB_CLIENT_ID', 'github', 'clientId')).toBe('cached-id');
    });

    it('falls back to process.env when cache is missing', () => {
      vi.stubEnv('MY_VAR', 'env-value');
      expect(getEnvOr('MY_VAR', 'missing', 'clientId')).toBe('env-value');
    });

    it('returns empty string when neither cache nor env exists', () => {
      expect(getEnvOr('NONEXISTENT_VAR', 'missing', 'clientId')).toBe('');
    });

    it('falls through to env when cached value is empty string (falsy)', () => {
      vi.stubEnv('FALLBACK', 'from-env');
      setCredentials('test', { clientId: '' });
      expect(getEnvOr('FALLBACK', 'test', 'clientId')).toBe('from-env');
    });

    it('prefers cached value over process.env', () => {
      vi.stubEnv('GITHUB_CLIENT_ID', 'env-id');
      setCredentials('github', { clientId: 'cached-id' });
      expect(getEnvOr('GITHUB_CLIENT_ID', 'github', 'clientId')).toBe('cached-id');
    });

    it('returns empty string when env var is undefined', () => {
      expect(getEnvOr('SOME_UNDEFINED_KEY', 'nope', 'clientId')).toBe('');
    });
  });

  describe('clearCredentials', () => {
    it('removes all entries', () => {
      setCredentials('a', { clientId: '1' });
      setCredentials('b', { clientId: '2' });
      clearCredentials();
      expect(getCredential('a', 'clientId')).toBeUndefined();
      expect(getCredential('b', 'clientId')).toBeUndefined();
    });

    it('is idempotent', () => {
      clearCredentials();
      clearCredentials();
      expect(getCredential('anything', 'clientId')).toBeUndefined();
    });
  });

  describe('replaceCredentialsMap', () => {
    it('replaces the entire credentials map atomically', () => {
      setCredentials('old', { clientId: 'old-value' });
      const newMap = new Map();
      newMap.set('new', { clientId: 'new-value' });
      replaceCredentialsMap(newMap);
      expect(getCredential('old', 'clientId')).toBeUndefined();
      expect(getCredential('new', 'clientId')).toBe('new-value');
    });

    it('does not share reference with the passed-in map after replacement', () => {
      const external = new Map();
      external.set('ext', { clientId: 'ext-value' });
      replaceCredentialsMap(external);
      external.set('later', { clientId: 'later-value' });
      expect(getCredential('later', 'clientId')).toBeUndefined();
    });

    it('works with an empty map', () => {
      setCredentials('a', { clientId: '1' });
      replaceCredentialsMap(new Map());
      expect(getCredential('a', 'clientId')).toBeUndefined();
    });
  });

  describe('integration scenarios', () => {
    it('supports a full lifecycle: set, get, replace, clear', () => {
      setCredentials('x', { token: 'tok1' });
      expect(getCredential('x', 'token')).toBe('tok1');
      replaceCredentialsMap(new Map([['y', { token: 'tok2' }]]));
      expect(getCredential('x', 'token')).toBeUndefined();
      expect(getCredential('y', 'token')).toBe('tok2');
      clearCredentials();
      expect(getCredential('y', 'token')).toBeUndefined();
    });
  });
});

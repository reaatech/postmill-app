import { Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';

// Create a mock Redis implementation for testing environments
class MockRedis {
  private data: Map<string, any> = new Map();

  async get(key: string) {
    return this.data.get(key);
  }

  async set(key: string, value: any, ttl?: number) {
    this.data.set(key, value);
    return 'OK';
  }

  async del(key: string) {
    this.data.delete(key);
    return 1;
  }

  async exists(key: string) {
    return this.data.has(key) ? 1 : 0;
  }
}

// Use real Redis if REDIS_URL is defined, otherwise use MockRedis
const rawClient = process.env.REDIS_URL
  ? new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null,
      connectTimeout: 10000,
    })
  : (new MockRedis() as unknown as Redis);

/**
 * @deprecated Use RedisService instead
 */
export const ioRedis = rawClient;

@Injectable()
export class RedisService {
  private _client: Redis;

  constructor() {
    this._client = rawClient;
  }

  get client(): Redis {
    return this._client;
  }

  async get(key: string) {
    return this._client.get(key);
  }

  async set(key: string, value: any, ttl?: number) {
    if (ttl) {
      return this._client.set(key, value, 'EX', ttl);
    }
    return this._client.set(key, value);
  }

  async del(key: string) {
    return this._client.del(key);
  }

  async exists(key: string) {
    return this._client.exists(key);
  }
}

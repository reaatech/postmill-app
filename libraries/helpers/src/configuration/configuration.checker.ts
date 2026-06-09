import { readFileSync, existsSync } from 'fs';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

export class ConfigurationChecker {
  cfg: dotenv.DotenvParseOutput;
  issues: string[] = [];

  readEnvFromFile() {
    const envFile = resolve(__dirname, '../../../.env');

    if (!existsSync(envFile)) {
      console.error('Env file not found!: ', envFile);
      return;
    }

    const handle = readFileSync(envFile, 'utf-8');

    this.cfg = dotenv.parse(handle);
  }

  readEnvFromProcess() {
    this.cfg = process.env;
  }

  check() {
    this.checkDatabaseServers();
    this.checkNonEmpty('JWT_SECRET');
    this.checkIsValidUrl('MAIN_URL');
    this.checkIsValidUrl('FRONTEND_URL');
    this.checkIsValidUrl('NEXT_PUBLIC_BACKEND_URL');
    this.checkIsValidUrl('BACKEND_INTERNAL_URL');
    this.checkDeprecatedStorageVars();
    this.checkDeprecatedChannelVars();
    this.checkDeprecatedAiVars();
  }

  checkDeprecatedStorageVars() {
    const deprecatedStorageVars = [
      'STORAGE_PROVIDER',
      'CLOUDFLARE_ACCOUNT_ID',
      'CLOUDFLARE_ACCESS_KEY',
      'CLOUDFLARE_SECRET_ACCESS_KEY',
      'CLOUDFLARE_BUCKETNAME',
      'CLOUDFLARE_BUCKET_URL',
      'CLOUDFLARE_REGION',
    ];

    for (const key of deprecatedStorageVars) {
      if (this.get(key)) {
        this.issues.push(key + ' is deprecated. Use per-tenant storage config instead (Settings → Storage tab).');
      }
    }
  }

  checkDeprecatedChannelVars() {
    const deprecatedChannelVars = [
      'LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET',
      'REDDIT_CLIENT_ID', 'REDDIT_CLIENT_SECRET',
      'GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET',
      'THREADS_APP_ID', 'THREADS_APP_SECRET',
      'FACEBOOK_APP_ID', 'FACEBOOK_APP_SECRET',
      'YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET',
      'TIKTOK_CLIENT_ID', 'TIKTOK_CLIENT_SECRET',
      'PINTEREST_CLIENT_ID', 'PINTEREST_CLIENT_SECRET',
      'DRIBBBLE_CLIENT_ID', 'DRIBBBLE_CLIENT_SECRET',
      'DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET', 'DISCORD_BOT_TOKEN_ID',
      'SLACK_ID', 'SLACK_SECRET', 'SLACK_SIGNING_SECRET',
      'MASTODON_CLIENT_ID', 'MASTODON_CLIENT_SECRET',
      'INSTAGRAM_APP_ID', 'INSTAGRAM_APP_SECRET',
      'BEEHIIVE_API_KEY', 'BEEHIIVE_PUBLICATION_ID',
      'X_API_KEY', 'X_API_SECRET',
    ];

    for (const key of deprecatedChannelVars) {
      if (this.get(key)) {
        this.issues.push(key + ' is deprecated. Use per-tenant channel config instead (Settings → Channels tab).');
      }
    }
  }

  checkDeprecatedAiVars() {
    if (this.get('OPENAI_API_KEY')) {
      this.issues.push('OPENAI_API_KEY is deprecated. Use per-tenant AI config instead (Settings → AI tab).');
    }
  }

  checkNonEmpty(key: string, description?: string): boolean {
    const v = this.get(key);

    if (!description) {
      description = '';
    }

    if (!v) {
      this.issues.push(key + ' not set. ' + description);
      return false;
    }

    if (v.length === 0) {
      this.issues.push(key + ' is empty.' + description);
      return false;
    }

    return true;
  }

  get(key: string): string | undefined {
    return this.cfg[key as keyof typeof this.cfg];
  }

  checkDatabaseServers() {
    this.checkRedis();
    this.checkIsValidUrl('DATABASE_URL');
  }

  checkRedis() {
    if (!this.cfg.REDIS_URL) {
      this.issues.push('REDIS_URL not set');
    }

    try {
      const redisUrl = new URL(this.cfg.REDIS_URL);

      if (redisUrl.protocol !== 'redis:') {
        this.issues.push('REDIS_URL must start with redis://');
      }
    } catch (error) {
      this.issues.push('REDIS_URL is not a valid URL');
    }
  }

  checkIsValidUrl(key: string) {
    if (!this.checkNonEmpty(key)) {
      return;
    }

    const urlString = this.get(key);

    try {
      new URL(urlString);
    } catch (error) {
      this.issues.push(key + ' is not a valid URL');
    }

    if (urlString.endsWith('/')) {
      this.issues.push(key + ' should not end with /');
    }
  }

  hasIssues() {
    return this.issues.length > 0;
  }

  getIssues() {
    return this.issues;
  }

  getIssuesCount() {
    return this.issues.length;
  }
}

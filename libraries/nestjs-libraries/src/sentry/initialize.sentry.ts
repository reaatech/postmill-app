import * as Sentry from '@sentry/nestjs';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import { capitalize } from 'lodash';

const SENSITIVE_FIELDS = new Set([
  'Authorization', 'auth', 'cookie', 'showorg', 'impersonate',
  'apiKey', 'api_key', 'pos_', 'pca_', 'pcs_', 'pm_',
  'password', 'secret', 'accessToken', 'access_token',
  'refreshToken', 'refresh_token', 'token',
]);

function scrubValue(value: unknown): unknown {
  if (typeof value === 'string') {
    for (const prefix of SENSITIVE_FIELDS) {
      if (value.startsWith(prefix + ':') || value.startsWith(prefix + '=')) return '[REDACTED]';
    }
  }
  return value;
}

function scrubHeaders(headers?: Record<string, string>): Record<string, string> | undefined {
  if (!headers) return headers;
  const scrubbed: Record<string, string> = {};
  for (const [key, val] of Object.entries(headers)) {
    if (SENSITIVE_FIELDS.has(key)) {
      scrubbed[key] = '[REDACTED]';
    } else {
      scrubbed[key] = val;
    }
  }
  return scrubbed;
}

function scrubRequestData(data: any): any {
  if (!data || typeof data !== 'object') return data;
  const scrubbed = { ...data };
  if (scrubbed.headers) scrubbed.headers = scrubHeaders(scrubbed.headers);
  if (scrubbed.cookies) scrubbed.cookies = '[REDACTED]';
  if (scrubbed.data && typeof scrubbed.data === 'string') {
    try {
      const parsed = JSON.parse(scrubbed.data);
      scrubbed.data = JSON.stringify(scrubRequestBody(parsed));
    } catch {
      scrubbed.data = '[REDACTED]';
    }
  }
  return scrubbed;
}

function scrubRequestBody(body: any): any {
  if (!body || typeof body !== 'object') return body;
  if (Array.isArray(body)) return body.map(scrubRequestBody);
  const scrubbed: Record<string, any> = {};
  for (const [key, val] of Object.entries(body)) {
    if (SENSITIVE_FIELDS.has(key)) {
      scrubbed[key] = '[REDACTED]';
    } else {
      scrubbed[key] = typeof val === 'object' && val !== null ? scrubRequestBody(val) : val;
    }
  }
  return scrubbed;
}

export const initializeSentry = (appName: string, allowLogs = false) => {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) {
    return null;
  }

  try {
    Sentry.init({
      initialScope: {
        tags: {
          service: appName,
          component: 'nestjs',
        },
        contexts: {
          app: {
            name: `Postmill ${capitalize(appName)}`,
          },
        },
      },
      environment: process.env.NODE_ENV || 'development',
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      spotlight: process.env.SENTRY_SPOTLIGHT === '1',
      integrations: [
        // Add our Profiling integration
        nodeProfilingIntegration(),
        ...(allowLogs
          ? [Sentry.consoleLoggingIntegration({ levels: ['warn', 'error'] })]
          : []),
        Sentry.openAIIntegration({
          recordInputs: false,
          recordOutputs: false,
        }),
      ],
      tracesSampleRate: 1.0,
      enableLogs: true,

      // Profiling
      profileSessionSampleRate: process.env.NODE_ENV === 'development' ? 1.0 : 0.45,
      profileLifecycle: 'trace',

      beforeSend(event, _hint) {
        if (event.request) {
          event.request = scrubRequestData(event.request);
        }
        if (event.user) {
          const user = { ...event.user };
          user.email = '[REDACTED]';
          user.username = '[REDACTED]';
          event.user = user;
        }
        if (event.extra) {
          const extra = { ...event.extra };
          for (const key of Object.keys(extra)) {
            extra[key] = scrubRequestBody(extra[key]);
          }
          event.extra = extra;
        }
        return event;
      },

      beforeBreadcrumb(breadcrumb, _hint) {
        if (breadcrumb.data) {
          breadcrumb.data = scrubRequestBody(breadcrumb.data);
        }
        if (breadcrumb.message) {
          breadcrumb.message = breadcrumb.message.length > 500
            ? breadcrumb.message.slice(0, 500)
            : breadcrumb.message;
        }
        return breadcrumb;
      },
    });
  } catch (err) {
    console.error('Failed to initialize Sentry:', err);
  }
  return true;
};

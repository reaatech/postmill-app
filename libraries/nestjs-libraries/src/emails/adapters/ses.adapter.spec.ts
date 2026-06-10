import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as crypto from 'crypto';

vi.mock('@aws-sdk/client-sesv2', () => ({
  SESv2Client: vi.fn(),
  SendEmailCommand: vi.fn(),
}));

vi.mock('@gitroom/nestjs-libraries/dtos/webhooks/safe.fetch', () => ({
  safeFetch: vi.fn(),
}));

import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { safeFetch } from '@gitroom/nestjs-libraries/dtos/webhooks/safe.fetch';
import { SesAdapter } from './ses.adapter';

describe('SesAdapter', () => {
  let adapter: SesAdapter;
  let mockSend: ReturnType<typeof vi.fn>;

  const defaultTopicArn = 'arn:aws:sns:us-east-1:123456789012:my-topic';

  beforeEach(() => {
    process.env.EMAIL_REGION = 'us-east-1';
    process.env.EMAIL_FROM_ADDRESS = 'noreply@example.com';
    process.env.EMAIL_FROM_NAME = 'Test Sender';
    process.env.EMAIL_WEBHOOK_SECRET = defaultTopicArn;

    vi.clearAllMocks();

    mockSend = vi.fn().mockResolvedValue({ MessageId: 'ses-msg-001' });
    vi.mocked(SESv2Client).mockImplementation(function (config: any) {
      return { send: mockSend, _config: config };
    } as any);
    vi.mocked(SendEmailCommand).mockImplementation(function (this: any, params: any) {
      Object.assign(this, params);
      return this;
    } as any);

    adapter = new SesAdapter();
  });

  afterEach(() => {
    delete process.env.EMAIL_REGION;
    delete process.env.EMAIL_FROM_ADDRESS;
    delete process.env.EMAIL_FROM_NAME;
    delete process.env.EMAIL_WEBHOOK_SECRET;
    delete process.env.EMAIL_SES_ACCESS_KEY_ID;
    delete process.env.EMAIL_SES_SECRET_ACCESS_KEY;
  });

  describe('metadata', () => {
    it('has name "ses"', () => {
      expect(adapter.name).toBe('ses');
    });

    it('has correct capabilities', () => {
      expect(adapter.capabilities).toEqual({
        webhooks: true,
        openTracking: false,
        clickTracking: false,
      });
    });

    it('has required env keys', () => {
      expect(adapter.requiredEnvKeys).toEqual([
        'EMAIL_REGION',
        'EMAIL_FROM_ADDRESS',
        'EMAIL_FROM_NAME',
      ]);
    });
  });

  describe('isConfigured', () => {
    it('returns true when EMAIL_REGION is set', () => {
      expect(adapter.isConfigured()).toBe(true);
    });

    it('returns false when EMAIL_REGION is not set', () => {
      process.env.EMAIL_REGION = '';
      expect(adapter.isConfigured()).toBe(false);
    });
  });

  describe('send', () => {
    const sendParams = {
      to: 'user@example.com',
      subject: 'Welcome',
      html: '<h1>Welcome</h1>',
      fromName: 'Test Sender',
      fromAddress: 'noreply@example.com',
    };

    it('calls SESv2Client.send with correct SendEmailCommand params', async () => {
      const result = await adapter.send(sendParams);

      expect(SendEmailCommand).toHaveBeenCalledWith({
        FromEmailAddress: 'Test Sender <noreply@example.com>',
        Destination: { ToAddresses: ['user@example.com'] },
        Content: {
          Simple: {
            Subject: { Data: 'Welcome' },
            Body: { Html: { Data: '<h1>Welcome</h1>' } },
          },
        },
      });
      expect(mockSend).toHaveBeenCalled();
      expect(result).toEqual({ providerMessageId: 'ses-msg-001' });
    });

    it('includes ReplyToAddresses when replyTo provided', async () => {
      await adapter.send({ ...sendParams, replyTo: 'reply@example.com' });

      expect(SendEmailCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          ReplyToAddresses: ['reply@example.com'],
        }),
      );
    });

    it('returns MessageId from response', async () => {
      mockSend.mockResolvedValueOnce({ MessageId: 'custom-message-id' });

      const result = await adapter.send(sendParams);
      expect(result).toEqual({ providerMessageId: 'custom-message-id' });
    });

    it('constructs client with EMAIL_SES_ACCESS_KEY_ID/SECRET when provided', async () => {
      process.env.EMAIL_SES_ACCESS_KEY_ID = 'AKID1234';
      process.env.EMAIL_SES_SECRET_ACCESS_KEY = 'super-secret';

      vi.clearAllMocks();
      mockSend = vi.fn().mockResolvedValue({ MessageId: 'ses-msg-001' });
      vi.mocked(SESv2Client).mockImplementation(function (config: any) {
        return { send: mockSend, _config: config };
      } as any);
      vi.mocked(SendEmailCommand).mockImplementation(function (this: any, params: any) {
        Object.assign(this, params);
        return this;
      } as any);
      adapter = new SesAdapter();

      await adapter.send(sendParams);

      expect(SESv2Client).toHaveBeenCalledWith({
        region: 'us-east-1',
        credentials: {
          accessKeyId: 'AKID1234',
          secretAccessKey: 'super-secret',
        },
      });
    });
  });

  describe('verifyWebhook', () => {
    const snsSubscribeUrl = 'https://sns.us-east-1.amazonaws.com/?Action=ConfirmSubscription&Token=abc123';
    const snsCertUrl = 'https://sns.us-east-1.amazonaws.com/SimpleNotificationService-certificate.pem';

    describe('SubscriptionConfirmation', () => {
      it('validates TopicArn matches EMAIL_WEBHOOK_SECRET', async () => {
        vi.mocked(safeFetch).mockResolvedValue({ ok: true } as any);

        const rawBody = Buffer.from(JSON.stringify({
          TopicArn: defaultTopicArn,
          SubscribeURL: snsSubscribeUrl,
        }));
        const headers = { 'x-amz-sns-message-type': 'SubscriptionConfirmation' };

        const result = await adapter.verifyWebhook(rawBody, headers);
        expect(result).toBe(true);
      });

      it('rejects wrong TopicArn', async () => {
        const rawBody = Buffer.from(JSON.stringify({
          TopicArn: 'arn:aws:sns:us-east-1:123456789012:different-topic',
          SubscribeURL: snsSubscribeUrl,
        }));
        const headers = { 'x-amz-sns-message-type': 'SubscriptionConfirmation' };

        const result = await adapter.verifyWebhook(rawBody, headers);
        expect(result).toBe(false);
      });

      it('rejects non-sns hostname in SubscribeURL', async () => {
        const rawBody = Buffer.from(JSON.stringify({
          TopicArn: defaultTopicArn,
          SubscribeURL: 'https://evil.com/confirm',
        }));
        const headers = { 'x-amz-sns-message-type': 'SubscriptionConfirmation' };

        const result = await adapter.verifyWebhook(rawBody, headers);
        expect(result).toBe(false);
      });

      it('fetches SubscribeURL via safeFetch', async () => {
        vi.mocked(safeFetch).mockResolvedValue({ ok: true } as any);

        const rawBody = Buffer.from(JSON.stringify({
          TopicArn: defaultTopicArn,
          SubscribeURL: snsSubscribeUrl,
        }));
        const headers = { 'x-amz-sns-message-type': 'SubscriptionConfirmation' };

        await adapter.verifyWebhook(rawBody, headers);

        expect(safeFetch).toHaveBeenCalledWith(snsSubscribeUrl, { method: 'GET' });
      });
    });

    describe('Notification', () => {
      const buildSnsSigningString = (payload: any): string => {
        const lines: string[] = [];
        lines.push('Message');
        lines.push(payload.Message ?? '');
        lines.push('MessageId');
        lines.push(payload.MessageId ?? '');
        if (payload.Subject != null) {
          lines.push('Subject');
          lines.push(payload.Subject);
        }
        lines.push('Timestamp');
        lines.push(payload.Timestamp ?? '');
        lines.push('TopicArn');
        lines.push(payload.TopicArn ?? '');
        lines.push('Type');
        lines.push(payload.Type ?? '');
        return lines.join('\n') + '\n';
      };

      it('returns false when TopicArn does not match EMAIL_WEBHOOK_SECRET', async () => {
        const rawBody = Buffer.from(JSON.stringify({
          TopicArn: 'arn:aws:sns:us-east-1:123456789012:wrong-topic',
          Type: 'Notification',
        }));
        const headers = { 'x-amz-sns-message-type': 'Notification' };

        const result = await adapter.verifyWebhook(rawBody, headers);
        expect(result).toBe(false);
      });

      it('returns true when signature is valid', async () => {
        const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
          modulusLength: 2048,
          publicKeyEncoding: { type: 'spki', format: 'pem' },
          privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
        });

        const payload = {
          Type: 'Notification',
          MessageId: 'msg-uuid-1234',
          TopicArn: defaultTopicArn,
          Message: JSON.stringify({ notificationType: 'Delivery', mail: { messageId: 'abcd' } }),
          Timestamp: '2024-01-01T00:00:00.000Z',
          SigningCertUrl: snsCertUrl,
        };

        const signingString = buildSnsSigningString(payload);
        const signature = crypto
          .sign('sha1WithRSAEncryption', Buffer.from(signingString), privateKey)
          .toString('base64');

        (payload as any).Signature = signature;

        vi.mocked(safeFetch).mockResolvedValue({
          ok: true,
          text: () => Promise.resolve(publicKey as string),
        } as any);

        const rawBody = Buffer.from(JSON.stringify(payload));
        const headers = { 'x-amz-sns-message-type': 'Notification' };

        const result = await adapter.verifyWebhook(rawBody, headers);
        expect(result).toBe(true);
      });

      it('handles SigningCertURL (uppercase) alias', async () => {
        const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
          modulusLength: 2048,
          publicKeyEncoding: { type: 'spki', format: 'pem' },
          privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
        });

        const payload = {
          Type: 'Notification',
          MessageId: 'msg-uuid-1234',
          TopicArn: defaultTopicArn,
          Message: JSON.stringify({ notificationType: 'Delivery', mail: { messageId: 'abcd' } }),
          Timestamp: '2024-01-01T00:00:00.000Z',
          SigningCertURL: snsCertUrl,
        };

        const signingString = buildSnsSigningString(payload);
        const signature = crypto
          .sign('sha1WithRSAEncryption', Buffer.from(signingString), privateKey)
          .toString('base64');

        (payload as any).Signature = signature;

        vi.mocked(safeFetch).mockResolvedValue({
          ok: true,
          text: () => Promise.resolve(publicKey as string),
        } as any);

        const rawBody = Buffer.from(JSON.stringify(payload));
        const headers = { 'x-amz-sns-message-type': 'Notification' };

        const result = await adapter.verifyWebhook(rawBody, headers);
        expect(result).toBe(true);
      });

      it('verifies SignatureVersion 2 with RSA-SHA256', async () => {
        const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
          modulusLength: 2048,
          publicKeyEncoding: { type: 'spki', format: 'pem' },
          privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
        });

        const payload = {
          Type: 'Notification',
          MessageId: 'msg-uuid-5678',
          TopicArn: defaultTopicArn,
          Subject: 'Test Subject',
          Message: JSON.stringify({ notificationType: 'Delivery', mail: { messageId: 'abcd' } }),
          Timestamp: '2024-01-01T00:00:00.000Z',
          SigningCertUrl: snsCertUrl,
          SignatureVersion: '2',
        };

        const signingString = buildSnsSigningString(payload);
        const signature = crypto
          .sign('RSA-SHA256', Buffer.from(signingString), privateKey)
          .toString('base64');

        (payload as any).Signature = signature;

        vi.mocked(safeFetch).mockResolvedValue({
          ok: true,
          text: () => Promise.resolve(publicKey as string),
        } as any);

        const rawBody = Buffer.from(JSON.stringify(payload));
        const headers = { 'x-amz-sns-message-type': 'Notification' };

        const result = await adapter.verifyWebhook(rawBody, headers);
        expect(result).toBe(true);
      });

      it('returns false when signature is invalid', async () => {
        const { publicKey } = crypto.generateKeyPairSync('rsa', {
          modulusLength: 2048,
          publicKeyEncoding: { type: 'spki', format: 'pem' },
          privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
        });

        const payload = {
          Type: 'Notification',
          MessageId: 'msg-uuid-1234',
          TopicArn: defaultTopicArn,
          Message: JSON.stringify({ notificationType: 'Delivery', mail: { messageId: 'abcd' } }),
          Timestamp: '2024-01-01T00:00:00.000Z',
          SigningCertUrl: snsCertUrl,
          Signature: 'aW52YWxpZFNpZ25hdHVyZQ==',
        };

        vi.mocked(safeFetch).mockResolvedValue({
          ok: true,
          text: () => Promise.resolve(publicKey as string),
        } as any);

        const rawBody = Buffer.from(JSON.stringify(payload));
        const headers = { 'x-amz-sns-message-type': 'Notification' };

        const result = await adapter.verifyWebhook(rawBody, headers);
        expect(result).toBe(false);
      });

      it('returns false when SigningCertUrl has non-sns hostname', async () => {
        const rawBody = Buffer.from(JSON.stringify({
          Type: 'Notification',
          MessageId: 'msg-1',
          TopicArn: defaultTopicArn,
          Message: 'test',
          Timestamp: '2024-01-01T00:00:00Z',
          SigningCertUrl: 'https://evil.com/cert.pem',
          Signature: 'base64sig',
        }));
        const headers = { 'x-amz-sns-message-type': 'Notification' };

        const result = await adapter.verifyWebhook(rawBody, headers);
        expect(result).toBe(false);
      });
    });

    it('returns false for unknown message types', async () => {
      const rawBody = Buffer.from(JSON.stringify({
        TopicArn: defaultTopicArn,
      }));
      const headers = { 'x-amz-sns-message-type': 'UnknownType' };

      const result = await adapter.verifyWebhook(rawBody, headers);
      expect(result).toBe(false);
    });

    it('returns false when payload is invalid JSON', async () => {
      const rawBody = Buffer.from('not-json');
      const headers = { 'x-amz-sns-message-type': 'Notification' };

      const result = await adapter.verifyWebhook(rawBody, headers);
      expect(result).toBe(false);
    });
  });

  describe('parseWebhook', () => {
    it('maps Delivery to delivered', () => {
      const message = JSON.stringify({
        notificationType: 'Delivery',
        mail: {
          messageId: 'msg-001',
          destination: ['user@example.com'],
          timestamp: '2024-01-01T00:00:00Z',
        },
      });

      const rawBody = Buffer.from(JSON.stringify({ Message: message }));
      const result = adapter.parseWebhook(rawBody, {});

      expect(result).toEqual([
        {
          providerMessageId: 'msg-001',
          recipient: 'user@example.com',
          status: 'delivered',
          occurredAt: expect.any(Date),
        },
      ]);
    });

    it('maps Bounce to bounced', () => {
      const message = JSON.stringify({
        notificationType: 'Bounce',
        mail: {
          messageId: 'msg-002',
          destination: ['bad@example.com'],
          timestamp: '2024-01-01T00:00:00Z',
        },
      });

      const rawBody = Buffer.from(JSON.stringify({ Message: message }));
      const result = adapter.parseWebhook(rawBody, {});

      expect(result).toEqual([
        expect.objectContaining({
          providerMessageId: 'msg-002',
          status: 'bounced',
        }),
      ]);
    });

    it('maps Complaint to complained', () => {
      const message = JSON.stringify({
        notificationType: 'Complaint',
        mail: {
          messageId: 'msg-003',
          destination: ['user@example.com'],
          timestamp: '2024-01-01T00:00:00Z',
        },
      });

      const rawBody = Buffer.from(JSON.stringify({ Message: message }));
      const result = adapter.parseWebhook(rawBody, {});

      expect(result).toEqual([
        expect.objectContaining({
          status: 'complained',
        }),
      ]);
    });

    it('returns [] for unknown notificationType', () => {
      const message = JSON.stringify({
        notificationType: 'Rendering Failure',
        mail: {
          messageId: 'msg-004',
        },
      });

      const rawBody = Buffer.from(JSON.stringify({ Message: message }));
      const result = adapter.parseWebhook(rawBody, {});

      expect(result).toEqual([]);
    });
  });
});

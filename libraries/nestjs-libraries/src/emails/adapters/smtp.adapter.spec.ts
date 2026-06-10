import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(),
  },
}));

import nodemailer from 'nodemailer';
import { SmtpAdapter } from './smtp.adapter';

describe('SmtpAdapter', () => {
  let adapter: SmtpAdapter;
  let mockSendMail: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env.EMAIL_SMTP_HOST = 'smtp.example.com';
    process.env.EMAIL_SMTP_PORT = '587';
    process.env.EMAIL_FROM_ADDRESS = 'noreply@example.com';
    process.env.EMAIL_FROM_NAME = 'Test Sender';

    vi.clearAllMocks();

    mockSendMail = vi.fn().mockResolvedValue({ messageId: '<abc123@example.com>' });
    vi.mocked(nodemailer.createTransport).mockReturnValue({
      sendMail: mockSendMail,
    } as any);

    adapter = new SmtpAdapter();
  });

  afterEach(() => {
    delete process.env.EMAIL_SMTP_HOST;
    delete process.env.EMAIL_SMTP_PORT;
    delete process.env.EMAIL_FROM_ADDRESS;
    delete process.env.EMAIL_FROM_NAME;
    delete process.env.EMAIL_SMTP_USER;
    delete process.env.EMAIL_SMTP_PASS;
  });

  describe('metadata', () => {
    it('has name "smtp"', () => {
      expect(adapter.name).toBe('smtp');
    });

    it('has all capabilities disabled', () => {
      expect(adapter.capabilities).toEqual({
        webhooks: false,
        openTracking: false,
        clickTracking: false,
      });
    });

    it('has required env keys', () => {
      expect(adapter.requiredEnvKeys).toEqual([
        'EMAIL_SMTP_HOST',
        'EMAIL_SMTP_PORT',
        'EMAIL_FROM_ADDRESS',
        'EMAIL_FROM_NAME',
      ]);
    });
  });

  describe('isConfigured', () => {
    it('returns true when EMAIL_SMTP_HOST and EMAIL_SMTP_PORT are set', () => {
      expect(adapter.isConfigured()).toBe(true);
    });

    it('returns false when EMAIL_SMTP_HOST is missing', () => {
      process.env.EMAIL_SMTP_HOST = '';
      expect(adapter.isConfigured()).toBe(false);
    });

    it('returns false when EMAIL_SMTP_PORT is missing', () => {
      process.env.EMAIL_SMTP_PORT = '';
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

    it('calls nodemailer.createTransport then sendMail with correct params', async () => {
      const result = await adapter.send(sendParams);

      expect(nodemailer.createTransport).toHaveBeenCalledWith({
        host: 'smtp.example.com',
        port: 587,
        secure: false,
      });
      expect(mockSendMail).toHaveBeenCalledWith({
        from: 'Test Sender <noreply@example.com>',
        to: 'user@example.com',
        subject: 'Welcome',
        text: '<h1>Welcome</h1>',
        html: '<h1>Welcome</h1>',
      });
      expect(result).toEqual({ providerMessageId: '<abc123@example.com>' });
    });

    it('includes replyTo when provided', async () => {
      await adapter.send({ ...sendParams, replyTo: 'reply@example.com' });

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          replyTo: 'reply@example.com',
        }),
      );
    });

    it('returns messageId from sendMail result', async () => {
      mockSendMail.mockResolvedValueOnce({ messageId: '<custom@test.com>' });

      const result = await adapter.send(sendParams);
      expect(result.providerMessageId).toBe('<custom@test.com>');
    });
  });

  describe('optional methods', () => {
    it('does not have verifyWebhook', () => {
      expect((adapter as any).verifyWebhook).toBeUndefined();
    });

    it('does not have parseWebhook', () => {
      expect((adapter as any).parseWebhook).toBeUndefined();
    });
  });

  describe('transporter auth', () => {
    it('includes auth when EMAIL_SMTP_USER is set', async () => {
      process.env.EMAIL_SMTP_USER = 'smtpuser';
      process.env.EMAIL_SMTP_PASS = 'smtppass';
      vi.clearAllMocks();
      mockSendMail = vi.fn().mockResolvedValue({ messageId: '<id>' });
      vi.mocked(nodemailer.createTransport).mockReturnValue({
        sendMail: mockSendMail,
      } as any);

      const newAdapter = new SmtpAdapter();
      await newAdapter.send({
        to: 'user@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
        fromName: 'Test',
        fromAddress: 'noreply@example.com',
      });

      expect(nodemailer.createTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          auth: { user: 'smtpuser', pass: 'smtppass' },
        }),
      );
    });

    it('omits auth when EMAIL_SMTP_USER is not set', async () => {
      await adapter.send({
        to: 'user@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
        fromName: 'Test',
        fromAddress: 'noreply@example.com',
      });

      expect(nodemailer.createTransport).toHaveBeenCalledWith(
        expect.not.objectContaining({
          auth: expect.anything(),
        }),
      );
    });
  });
});

import { Injectable, Optional } from '@nestjs/common';
import { parseQualified } from '@gitroom/provider-kernel';
import { EmailAdapter } from '@gitroom/nestjs-libraries/emails/email-adapter.interface';
import { ProviderResolutionService } from '@gitroom/nestjs-libraries/providers/provider-resolution.service';

@Injectable()
export class EmailAdapterRegistry {
  private readonly _instances = new Map<string, EmailAdapter>();

  constructor(
    // 4.9: resolve email providers through ProviderResolutionService so every
    // email call rides the telemetry proxy and feeds the per-version health
    // counters — rather than calling `mod.create(ctx)` on the raw kernel module.
    @Optional()
    private readonly _resolution?: ProviderResolutionService,
  ) {}

  /** Eager registration (kept for tests and callers that already have an instance). */
  register(adapter: EmailAdapter): void {
    this._instances.set(adapter.name, adapter);
  }

  getAdapter(name: string): EmailAdapter | undefined {
    return this._instances.get(name);
  }

  getActiveAdapter(): EmailAdapter {
    const raw = process.env.EMAIL_PROVIDER || '';
    return this._resolveViaKernel(raw);
  }

  /**
   * Resolve the active email module through ProviderResolutionService (kernel +
   * telemetry proxy). EMAIL_PROVIDER accepts a qualified id ("resend@v1"); a bare
   * name ("resend") resolves to the latest active version.
   */
  private _resolveViaKernel(raw: string): EmailAdapter {
    if (!raw) {
      return this._kernelEmpty();
    }

    try {
      const { providerId, version } = parseQualified(raw);
      const adapter = this._resolution!.resolveEmail(
        providerId,
        version ? { version } : {},
      );
      if (adapter && adapter.isConfigured()) {
        return adapter;
      }
      return this._kernelEmpty();
    } catch {
      return this._kernelEmpty();
    }
  }

  private _kernelEmpty(): EmailAdapter {
    try {
      return this._resolution!.resolveEmail('empty');
    } catch {
      return this._instances.get('empty')!;
    }
  }

  list(): EmailAdapter[] {
    return Array.from(this._instances.values());
  }
}

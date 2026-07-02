import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  ProviderKernel,
  ProviderRuntimeContext,
  parseQualified,
  DEFAULT_VERSION,
} from '@gitroom/provider-kernel';
import { EmailAdapter } from '@gitroom/nestjs-libraries/emails/email-adapter.interface';
import { PROVIDER_KERNEL } from '@gitroom/nestjs-libraries/providers/providers.module';
import { RuntimeContextFactory } from '@gitroom/nestjs-libraries/providers/runtime-context.factory';

@Injectable()
export class EmailAdapterRegistry {
  private readonly _instances = new Map<string, EmailAdapter>();

  constructor(
    @Optional()
    @Inject(PROVIDER_KERNEL)
    private readonly _kernel?: ProviderKernel,
    @Optional()
    private readonly _runtimeContext?: RuntimeContextFactory,
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

  /** Resolve the active email module through the provider kernel. */
  private _resolveViaKernel(raw: string): EmailAdapter {
    const ctx = this._runtimeContext!.build({});
    if (!raw) {
      return this._kernelEmpty(ctx);
    }

    try {
      // EMAIL_PROVIDER accepts a qualified id ("resend@v1"); a bare name
      // ("resend") resolves to the latest active version.
      const { providerId, version } = parseQualified(raw);
      const mod = version
        ? this._kernel!.resolveForRead<unknown, EmailAdapter>(
            'email',
            providerId,
            version,
          )
        : this._kernel!.latestActive<unknown, EmailAdapter>('email', providerId);

      if (!mod) {
        return this._kernelEmpty(ctx);
      }

      const adapter = mod.create(ctx);
      if (adapter && adapter.isConfigured()) {
        return adapter;
      }
      return this._kernelEmpty(ctx);
    } catch {
      return this._kernelEmpty(ctx);
    }
  }

  private _kernelEmpty(ctx: ProviderRuntimeContext): EmailAdapter {
    try {
      const mod = this._kernel!.resolveForRead<unknown, EmailAdapter>(
        'email',
        'empty',
        DEFAULT_VERSION,
      );
      return mod.create(ctx);
    } catch {
      return this._instances.get('empty')!;
    }
  }

  list(): EmailAdapter[] {
    return Array.from(this._instances.values());
  }
}

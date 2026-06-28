import {
  Body,
  Controller,
  Get,
  HttpException,
  Inject,
  Logger,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { Response, Request } from 'express';

import { CreateOrgUserDto } from '@gitroom/nestjs-libraries/dtos/auth/create.org.user.dto';
import { LoginUserDto } from '@gitroom/nestjs-libraries/dtos/auth/login.user.dto';
import { AuthService } from '@gitroom/backend/services/auth/auth.service';
import { ForgotReturnPasswordDto } from '@gitroom/nestjs-libraries/dtos/auth/forgot-return.password.dto';
import { ForgotPasswordDto } from '@gitroom/nestjs-libraries/dtos/auth/forgot.password.dto';
import { ResendActivationDto } from '@gitroom/nestjs-libraries/dtos/auth/resend-activation.dto';
import { RefreshTokenDto } from '@gitroom/nestjs-libraries/dtos/auth/refresh-token.dto';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { getCookieUrlFromDomain } from '@gitroom/helpers/subdomain/subdomain.management';
import { EmailService } from '@gitroom/nestjs-libraries/services/email.service';
import { RealIP } from 'nestjs-real-ip';
import { UserAgent } from '@gitroom/nestjs-libraries/user/user.agent';
import { Provider } from '@prisma/client';
import * as Sentry from '@sentry/nestjs';
import { issueCsrfToken } from '@gitroom/backend/services/auth/csrf.middleware';
import { AuthProviderRepository } from '@gitroom/nestjs-libraries/database/prisma/auth-providers/auth-provider.repository';
import { ProviderKernel, DEFAULT_VERSION } from '@gitroom/provider-kernel';
import { PROVIDER_KERNEL } from '@gitroom/nestjs-libraries/providers/providers.module';

@ApiTags('Auth')
@Controller('/auth')
export class AuthController {
  constructor(
    private _authService: AuthService,
    private _emailService: EmailService,
    private _authProviderRepository: AuthProviderRepository,
    @Inject(PROVIDER_KERNEL) private _kernel: ProviderKernel
  ) {}

  // Latest-active kernel version + status for an auth provider. Degrades to
  // v1/active when the auth domain has no kernel module registered for this
  // provider yet.
  private _versionInfo(provider: string): {
    version: string;
    status: string;
  } {
    const providerId = provider.toLowerCase();
    const latest = this._kernel.latestActive('auth', providerId);
    if (latest) {
      return {
        version: latest.manifest.version,
        status: latest.manifest.status,
      };
    }
    const manifests = this._kernel.versions('auth', providerId);
    if (manifests.length > 0) {
      const manifest = manifests[manifests.length - 1];
      return { version: manifest.version, status: manifest.status };
    }
    return { version: DEFAULT_VERSION, status: 'active' };
  }

  @Get('/providers')
  async getProviders() {
    const dbProviders = await this._authProviderRepository.list();
    const enabledFromDb = dbProviders.filter((p) => p.enabled);

    if (enabledFromDb.length > 0) {
      return {
        providers: enabledFromDb.map((p) => ({
          provider: p.provider,
          displayName:
            p.displayName ||
            (p.provider === 'GENERIC'
              ? process.env.NEXT_PUBLIC_POSTMILL_OAUTH_DISPLAY_NAME || 'OIDC'
              : p.provider.charAt(0) + p.provider.slice(1).toLowerCase()),
          ...this._versionInfo(p.provider),
        })),
      };
    }

    const providers: {
      provider: string;
      displayName: string;
      version: string;
      status: string;
    }[] = [
      { provider: 'LOCAL', displayName: 'Email', ...this._versionInfo('LOCAL') },
    ];

    if (process.env.IS_GENERAL) {
      if (process.env.POSTMILL_GENERIC_OAUTH) {
        providers.push({
          provider: 'GENERIC',
          displayName:
            process.env.NEXT_PUBLIC_POSTMILL_OAUTH_DISPLAY_NAME || 'OIDC',
          ...this._versionInfo('GENERIC'),
        });
      } else {
        providers.push({
          provider: 'GOOGLE',
          displayName: 'Google',
          ...this._versionInfo('GOOGLE'),
        });
        if (process.env.NEYNAR_CLIENT_ID) {
          providers.push({
            provider: 'FARCASTER',
            displayName: 'Farcaster',
            ...this._versionInfo('FARCASTER'),
          });
        }
        if (process.env.STRIPE_PUBLISHABLE_KEY) {
          providers.push({
            provider: 'WALLET',
            displayName: 'Wallet',
            ...this._versionInfo('WALLET'),
          });
        }
      }
    } else {
      providers.push({
        provider: 'GITHUB',
        displayName: 'GitHub',
        ...this._versionInfo('GITHUB'),
      });
    }

    return { providers };
  }

  @Get('/can-register')
  async canRegister() {
    return {
      register: await this._authService.canRegister(Provider.LOCAL as string),
    };
  }

  @Post('/register')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async register(
    @Req() req: Request,
    @Body() body: CreateOrgUserDto,
    @Res({ passthrough: false }) response: Response,
    @RealIP() ip: string,
    @UserAgent() userAgent: string
  ) {
    try {
      const getOrgFromCookie = this._authService.getOrgFromCookie(
        req?.cookies?.org
      );

      const { jwt, refreshToken, addedOrg } = await this._authService.routeAuth(
        body.provider,
        body,
        ip,
        userAgent,
        getOrgFromCookie
      );

      const activationRequired =
        body.provider === 'LOCAL' && this._emailService.hasProvider();

      if (activationRequired) {
        response.header('activate', 'true');
        response.status(200).json({ activate: true });
        return;
      }

      response.cookie('auth', jwt, {
        domain: getCookieUrlFromDomain(process.env.FRONTEND_URL!),
        ...(!process.env.NOT_SECURED || process.env.NODE_ENV !== 'development'
          ? {
              secure: true,
              httpOnly: true,
              sameSite: 'none',
            }
          : {}),
        expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365),
      });

      response.cookie('refresh_token', refreshToken, {
        domain: getCookieUrlFromDomain(process.env.FRONTEND_URL!),
        ...(!process.env.NOT_SECURED || process.env.NODE_ENV !== 'development'
          ? {
              secure: true,
              httpOnly: true,
              sameSite: 'none',
            }
          : {}),
        expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
      });

      issueCsrfToken(response);

      if (typeof addedOrg !== 'boolean' && addedOrg?.organizationId) {
        response.cookie('showorg', addedOrg.organizationId, {
          domain: getCookieUrlFromDomain(process.env.FRONTEND_URL!),
          ...(!process.env.NOT_SECURED || process.env.NODE_ENV !== 'development'
            ? {
                secure: true,
                httpOnly: true,
                sameSite: 'none',
              }
            : {}),
          expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365),
        });

      }

      Sentry.metrics.count('new_user', 1);
      response.header('onboarding', 'true');
      response.status(200).json({
        register: true,
      });
    } catch (e: any) {
      Logger.error('Registration failed', e instanceof Error ? e.message : String(e), AuthController.name);
      response.status(400).send('Registration failed');
    }
  }

  @Post('/login')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async login(
    @Req() req: Request,
    @Body() body: LoginUserDto,
    @Res({ passthrough: false }) response: Response,
    @RealIP() ip: string,
    @UserAgent() userAgent: string
  ) {
    try {
      const getOrgFromCookie = this._authService.getOrgFromCookie(
        req?.cookies?.org
      );

      const { jwt, refreshToken, addedOrg } = await this._authService.routeAuth(
        body.provider,
        body,
        ip,
        userAgent,
        getOrgFromCookie
      );

      response.cookie('auth', jwt, {
        domain: getCookieUrlFromDomain(process.env.FRONTEND_URL!),
        ...(!process.env.NOT_SECURED || process.env.NODE_ENV !== 'development'
          ? {
              secure: true,
              httpOnly: true,
              sameSite: 'none',
            }
          : {}),
        expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365),
      });

      response.cookie('refresh_token', refreshToken, {
        domain: getCookieUrlFromDomain(process.env.FRONTEND_URL!),
        ...(!process.env.NOT_SECURED || process.env.NODE_ENV !== 'development'
          ? {
              secure: true,
              httpOnly: true,
              sameSite: 'none',
            }
          : {}),
        expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
      });

      if (typeof addedOrg !== 'boolean' && addedOrg?.organizationId) {
        response.cookie('showorg', addedOrg.organizationId, {
          domain: getCookieUrlFromDomain(process.env.FRONTEND_URL!),
          ...(!process.env.NOT_SECURED || process.env.NODE_ENV !== 'development'
            ? {
                secure: true,
                httpOnly: true,
                sameSite: 'none',
              }
            : {}),
          expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365),
        });

      }

      issueCsrfToken(response);
      response.header('reload', 'true');
      response.status(200).json({
        login: true,
      });
    } catch (e: any) {
      Logger.error('Login failed', e instanceof Error ? e.message : String(e), AuthController.name);
      response.status(400).send('Invalid credentials');
    }
  }

  @Post('/forgot')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async forgot(@Body() body: ForgotPasswordDto) {
    try {
      await this._authService.forgot(body.email);
      return {
        forgot: true,
      };
    } catch (e) {
      return {
        forgot: false,
      };
    }
  }

  @Post('/forgot-return')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async forgotReturn(@Body() body: ForgotReturnPasswordDto) {
    const reset = await this._authService.forgotReturn(body);
    return {
      reset: !!reset,
    };
  }

  @Get('/oauth-mobile-callback')
  mobileCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res({ passthrough: false }) response: Response
  ) {
    const scheme = process.env.MOBILE_APP_SCHEME || 'postiz://auth/callback';
    const params = new URLSearchParams();
    if (code) params.set('code', code);
    if (state) params.set('state', state);
    return response.redirect(302, `${scheme}?${params.toString()}`);
  }

  @Get('/oauth/:provider')
  async oauthLink(@Param('provider') provider: string, @Query() query: any) {
    return this._authService.oauthLink(provider, query);
  }

  @Post('/activate')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async activate(
    @Body('code') code: string,
    @Body('datafast_visitor_id') datafast_visitor_id: string,
    @Res({ passthrough: false }) response: Response
  ) {
    const activate = await this._authService.activate(
      code,
      datafast_visitor_id
    );
    if (!activate) {
      return response.status(200).json({ can: false });
    }

    response.cookie('auth', activate, {
      domain: getCookieUrlFromDomain(process.env.FRONTEND_URL!),
      ...(!process.env.NOT_SECURED || process.env.NODE_ENV !== 'development'
        ? {
            secure: true,
            httpOnly: true,
            sameSite: 'none',
          }
        : {}),
      expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365),
    });

    issueCsrfToken(response);
    response.header('onboarding', 'true');

    return response.status(200).json({ can: true });
  }

  @Post('/resend-activation')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async resendActivation(@Body() body: ResendActivationDto) {
    try {
      await this._authService.resendActivationEmail(body.email);
      return {
        success: true,
      };
    } catch (e: any) {
      console.error('Resend activation failed:', e);
      return {
        success: false,
        message: 'Resend activation failed',
      };
    }
  }

  @Post('/oauth/:provider/exists')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async oauthExists(
    @Body('code') code: string,
    @Body('redirect_uri') redirect_uri: string,
    @Param('provider') provider: string,
    @Res({ passthrough: false }) response: Response,
    @RealIP() ip: string,
    @UserAgent() userAgent: string
  ) {
    const { jwt, token, userId } = await this._authService.checkExists(
      provider,
      code,
      redirect_uri
    );

    if (token) {
      return response.json({ token });
    }

    response.cookie('auth', jwt, {
      domain: getCookieUrlFromDomain(process.env.FRONTEND_URL!),
      ...(!process.env.NOT_SECURED || process.env.NODE_ENV !== 'development'
        ? {
            secure: true,
            httpOnly: true,
            sameSite: 'none',
          }
        : {}),
      expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365),
    });

    if (userId) {
      const refreshToken = await this._authService.createSession(userId, ip, userAgent);
      response.cookie('refresh_token', refreshToken, {
        domain: getCookieUrlFromDomain(process.env.FRONTEND_URL!),
        ...(!process.env.NOT_SECURED || process.env.NODE_ENV !== 'development'
          ? {
              secure: true,
              httpOnly: true,
              sameSite: 'none',
            }
          : {}),
        expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
      });
    }

    issueCsrfToken(response);

    response.header('reload', 'true');

    response.status(200).json({
      login: true,
    });
  }

  @Post('/refresh')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async refresh(
    @Req() req: Request,
    @Body() body: RefreshTokenDto,
    @Res({ passthrough: false }) response: Response,
    @RealIP() ip: string,
    @UserAgent() userAgent: string
  ) {
    try {
      const refreshToken = body.refreshToken || req.cookies?.refresh_token;
      if (!refreshToken) {
        throw new HttpException('Refresh token is missing', 400);
      }

      const { jwt, refreshToken: newRefreshToken } =
        await this._authService.refreshAccessToken(refreshToken, ip, userAgent);

      response.cookie('auth', jwt, {
        domain: getCookieUrlFromDomain(process.env.FRONTEND_URL!),
        ...(!process.env.NOT_SECURED || process.env.NODE_ENV !== 'development'
          ? {
              secure: true,
              httpOnly: true,
              sameSite: 'none',
            }
          : {}),
        expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365),
      });

      response.cookie('refresh_token', newRefreshToken, {
        domain: getCookieUrlFromDomain(process.env.FRONTEND_URL!),
        ...(!process.env.NOT_SECURED || process.env.NODE_ENV !== 'development'
          ? {
              secure: true,
              httpOnly: true,
              sameSite: 'none',
            }
          : {}),
        expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
      });

      issueCsrfToken(response);
      response.status(200).json({ login: true });
    } catch (e: unknown) {
      Logger.error('Refresh failed', e instanceof Error ? e.message : String(e), AuthController.name);
      response.status(401).json({ error: 'Invalid or expired refresh token' });
    }
  }
}

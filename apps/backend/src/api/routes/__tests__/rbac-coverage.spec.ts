import { describe, it, expect } from 'vitest';
import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';

import { REQUIRE_PERMISSION_KEY } from '@gitroom/backend/services/auth/rbac/require-permission.decorator';

// Org-resource controllers whose mutating routes MUST carry @RequirePermission.
import { IntegrationsController } from '../integrations.controller';
import { CampaignsController } from '../campaigns.controller';
import { SocialCommentsController } from '../social-comments.controller';
import { AiUserController } from '../ai-user.controller';
import { RolesController } from '../roles.controller';

// Self-scoped controllers (act only on the caller's own user/session). Whole-controller exempt.
import { UsersController } from '../users.controller';
import { ApiKeysController } from '../api-keys.controller';
import { NotificationsController } from '../notifications.controller';

// ---------------------------------------------------------------------------
// B3 — RBAC coverage regression test.
//
// `OrgRbacGuard` is global but ALLOW-BY-DEFAULT: a mutating route with no
// @RequirePermission metadata ships open. This test makes that safe by
// construction — it reflects over each controller's @Post/@Put/@Patch/@Delete
// handlers and asserts every mutating handler EITHER carries the metadata OR is
// on an explicit, justified allowlist. A newly-added ungated mutation fails here
// until it is gated or deliberately allowlisted.
// ---------------------------------------------------------------------------

// Controllers that are exempt in their entirety (every route is caller-self-scoped or
// a public/webhook entrypoint — there is no org-resource to gate by role).
const SELF_SCOPED_CONTROLLERS = new Set<string>([
  // /user/* — every mutation targets the authenticated user's own profile, password,
  // sessions, org membership, or impersonation (super-admin checked in-handler).
  'UsersController',
  // /api-keys/* — a user managing their own API keys.
  'ApiKeysController',
  // /notifications/* — a user marking their own notifications read / managing prefs / push tokens.
  'NotificationsController',
]);

// Specific handlers that are intentionally NOT RBAC-gated, keyed `Controller.method`.
const SELF_SCOPED_ALLOWLIST = new Set<string>([
  // Stateless external onboarding handshake — registers a Moltbook agent with the
  // external service and returns a claim URL/api key. Mutates no org resource.
  'IntegrationsController.moltbookRegister',

  // Ephemeral AI generation/search routes (B2): billing- + throttle-gated, not RBAC.
  // They produce transient output and persist no governed org config.
  'AiUserController.createMediaJob',
  'AiUserController.generateHashtags',
  'AiUserController.draftCommentReply',
  'AiUserController.bestTimeToPost',
  'AiUserController.repurposeContent',
  'AiUserController.checkCompliance',
  'AiUserController.translateContent',
  'AiUserController.searchBrandMemory',
  'AiUserController.generateVariants',
]);

const MUTATING = new Set<number>([
  RequestMethod.POST,
  RequestMethod.PUT,
  RequestMethod.PATCH,
  RequestMethod.DELETE,
]);

const CONTROLLERS: Array<{ name: string; ctor: any }> = [
  { name: 'IntegrationsController', ctor: IntegrationsController },
  { name: 'CampaignsController', ctor: CampaignsController },
  { name: 'SocialCommentsController', ctor: SocialCommentsController },
  { name: 'AiUserController', ctor: AiUserController },
  { name: 'RolesController', ctor: RolesController },
  { name: 'UsersController', ctor: UsersController },
  { name: 'ApiKeysController', ctor: ApiKeysController },
  { name: 'NotificationsController', ctor: NotificationsController },
];

interface MutatingHandler {
  controller: string;
  method: string;
  httpMethod: number;
  gated: boolean;
  exempt: boolean;
}

function collectMutatingHandlers(): MutatingHandler[] {
  const out: MutatingHandler[] = [];
  for (const { name, ctor } of CONTROLLERS) {
    const proto = ctor.prototype;
    for (const methodName of Object.getOwnPropertyNames(proto)) {
      if (methodName === 'constructor') continue;
      const handler = proto[methodName];
      if (typeof handler !== 'function') continue;

      const httpMethod = Reflect.getMetadata(METHOD_METADATA, handler);
      // Only Nest route handlers carry METHOD_METADATA.
      if (httpMethod === undefined) continue;
      if (!MUTATING.has(httpMethod)) continue;

      const key = `${name}.${methodName}`;
      const gated = !!Reflect.getMetadata(REQUIRE_PERMISSION_KEY, handler);
      const exempt =
        SELF_SCOPED_CONTROLLERS.has(name) || SELF_SCOPED_ALLOWLIST.has(key);

      out.push({ controller: name, method: methodName, httpMethod, gated, exempt });
    }
  }
  return out;
}

describe('RBAC coverage — every org-resource mutation is gated or explicitly allowlisted', () => {
  const handlers = collectMutatingHandlers();

  it('discovers mutating route handlers across the curated controllers', () => {
    // Sanity: reflection actually found routes (guards against a metadata-key regression
    // silently turning the whole test into a no-op).
    expect(handlers.length).toBeGreaterThan(20);
  });

  it('every mutating handler carries @RequirePermission OR is on the self-scoped allowlist', () => {
    const offenders = handlers
      .filter((h) => !h.gated && !h.exempt)
      .map((h) => `${h.controller}.${h.method}`);

    expect(
      offenders,
      `Ungated mutating route(s) found. Add @RequirePermission(resource, action) ` +
        `or, if genuinely self-scoped/public, add to SELF_SCOPED_ALLOWLIST with a justification:\n` +
        offenders.join('\n')
    ).toEqual([]);
  });

  it('the named org-resource controllers have every mutation RBAC-gated (no allowlist leakage)', () => {
    const gatedControllers = [
      'IntegrationsController',
      'CampaignsController',
      'SocialCommentsController',
      'RolesController',
    ];
    for (const name of gatedControllers) {
      const ungated = handlers
        .filter((h) => h.controller === name && !h.gated)
        // IntegrationsController.moltbookRegister is the single allowlisted exception.
        .filter((h) => !SELF_SCOPED_ALLOWLIST.has(`${h.controller}.${h.method}`))
        .map((h) => h.method);
      expect(ungated, `${name} has an ungated mutation`).toEqual([]);
    }
  });
});

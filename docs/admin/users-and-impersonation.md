# Users & Impersonation

Super-admins can act as another user from the admin bar — useful for support and reproducing
account-specific issues.

---

## Impersonation

From the admin bar, a super-admin can search for a user and impersonate them, then stop
impersonating to return to their own session. While impersonating, you see the app as that user —
their organizations, channels, and posts.

Use it to:

- Reproduce a problem a user reports without asking for their credentials.
- Verify a channel connection or a scheduled post from the user's perspective.
- Check what a non-admin actually sees (admin-only controls are gated and won't appear).

> **Note:** impersonation is a privileged capability. The "Channels" admin control is hidden for
> non-super-admins, and all admin endpoints enforce the super-admin check server-side, so
> impersonating a regular user does not expose admin configuration to that session.

## Super-admin vs regular users

- **Regular users** schedule posts, manage their own channels, view their analytics, and use the AI
  features available to them.
- **Super-admins** additionally configure instance-wide settings: [channels](./channels.md),
  [AI settings](./ai-settings.md), and the [errors/stats](./errors-and-stats.md) diagnostics, and
  can impersonate.

## Registration & activation

Whether new users can self-register, and whether they must confirm by email, is controlled by
environment configuration (`DISABLE_REGISTRATION`, `RESEND_API_KEY`). See
[Configuration](../self-hosting/configuration.md).

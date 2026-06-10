# Adding a Social Channel Provider

This guide walks through adding a new social media channel provider to Postmill.
The system currently supports 36 providers (plus one commented-out provider,
`MastodonCustomProvider`, in the integration manager). Reference implementations include
**Tumblr**, **Pixelfed**, and **PeerTube** (the three most recently added).

## Step 1: Implement the provider class

Create a new file in `libraries/nestjs-libraries/src/integrations/social/`
(e.g. `yourprovider.provider.ts`).

Your class must extend `SocialAbstract` and implement `SocialProvider`:

```typescript
import { SocialAbstract } from '../social.abstract';
import { SocialProvider } from './social.integrations.interface';

export class YourProvider extends SocialAbstract implements SocialProvider {
  // ...
}
```

### Required properties

```typescript
identifier = 'yourprovider';       // Unique string ID
name = 'Your Provider';            // Display name
editor: 'none' | 'normal' | 'markdown' | 'html' = 'normal';
scopes = ['scope1', 'scope2'];     // OAuth scopes
isBetweenSteps = false;            // Whether provider uses two-step (app → page) flow
```

### Auth models

The `SocialProvider` interface extends `IAuthenticator`. Implement one of these
auth models:

**OAuth 2.0** (most common):

```typescript
async generateAuthUrl(clientInformation?: ClientInformation): Promise<GenerateAuthUrlResponse> {
  return {
    url: 'https://provider.com/oauth/authorize?...',
    codeVerifier: '<random-verifier>',
    state: '<random-state>',
  };
}

async authenticate(
  params: { code: string; codeVerifier: string; refresh?: string },
  clientInformation?: ClientInformation
): Promise<AuthTokenDetails | string> {
  // Exchange code for token
  return {
    id: '<account-id>',
    name: '<account-name>',
    accessToken: '<token>',
    refreshToken: '<refresh>',
    expiresIn: 3600,
    picture: '<avatar-url>',
    username: '<handle>',
  };
}

async refreshToken(refreshToken: string, clientInformation?: ClientInformation): Promise<AuthTokenDetails> {
  // Refresh the access token
}
```

**Custom fields** (API key, instance URL, etc.):

```typescript
async customFields(): Promise<{
  key: string;
  label: string;
  defaultValue?: string;
  validation: string;
  type: 'text' | 'password';
}[]> {
  return [
    { key: 'apiKey', label: 'API Key', type: 'password', validation: '/^.+$/' },
    { key: 'instanceUrl', label: 'Instance URL', type: 'text', validation: '/^https?:\\/\\/.+$/' },
  ];
}
```

**Two-step providers** (app auth → page/company selection):
Set `isBetweenSteps = true` and implement either `pages()` or `companies()` on
the provider.

### Posting

Implement the `post()` method from `ISocialMediaIntegration`:

```typescript
async post(
  id: string,
  accessToken: string,
  postDetails: PostDetails[],
  integration: Integration
): Promise<PostResponse[]> {
  // Publish the post
  return [{
    id: postDetails[0].id,
    postId: '<platform-post-id>',
    releaseURL: '<platform-url>',
    status: 'published',
  }];
}
```

`postDetails` contains:
- `message` — post text
- `media` — array of `{ type: 'image'|'video', path, alt?, thumbnail? }`
- `poll` — `{ options: string[], duration: number }` (if poll is supported)
- `firstComment` — optional first comment text
- `settings` — provider-specific settings

### Media handling

Override `maxLength(additionalSettings?)` to return the character limit.
Override `checkValidity()` to validate media type, dimensions, count, etc.:

```typescript
maxLength(additionalSettings?: any): number {
  return 500;
}

async checkValidity(
  posts: Array<ValidityMedia[]>,
  settings: any,
  additionalSettings: any[]
): Promise<string | true> {
  // Validate media count, size, dimensions
  // Return true if valid, or an error message string
  return true;
}
```

### Token refresh

If the provider supports token refresh, handle it in `handleErrors()`:

```typescript
handleErrors(body: string, status: number) {
  if (status === 401) {
    return { type: 'refresh-token', value: 'Retrying with refreshed token' };
  }
  return undefined;
}
```

The temporal workflow automatically handles `RefreshToken` exceptions by
refreshing the token and retrying.

### Outbound HTTP

All outbound HTTP calls MUST use `this.fetch()` or the standalone `safeFetch`:

```typescript
import { safeFetch } from '@gitroom/nestjs-libraries/dtos/webhooks/safe.fetch';

const response = await safeFetch('https://api.provider.com/endpoint', {
  method: 'POST',
  headers: { Authorization: `Bearer ${accessToken}` },
  body: JSON.stringify(payload),
});
```

Never use bare `fetch()` — safeFetch provides SSRF protection.

## Step 2: Optional — implement social comments

If the provider supports comment reading/reply/liking, implement
`ISocialMediaComments`:

```typescript
commentsCapabilities = { read: true, reply: true, like: false };

async fetchComments(
  id: string,
  accessToken: string,
  postId: string,
  cursor: string | undefined,
  integration: Integration
): Promise<{ comments: SocialCommentDTO[]; nextCursor?: string }> {
  // Fetch comments
  return { comments: [...], nextCursor: '<pagination>' };
}

async replyToComment(
  id: string,
  accessToken: string,
  postId: string,
  parentCommentId: string,
  message: string,
  integration: Integration
): Promise<SocialCommentDTO> {
  // Post a reply
}

async likeComment(
  id: string,
  accessToken: string,
  postId: string,
  commentId: string,
  like: boolean,
  integration: Integration
): Promise<{ liked: boolean; likeCount?: number }> {
  // Like/unlike a comment
}
```

## Step 3: Register in the provider capabilities matrix

Add an entry to `PROVIDER_CAPABILITIES` in
`libraries/nestjs-libraries/src/integrations/social/provider-capabilities.ts`:

```typescript
'yourprovider': {
  analytics: false,
  comments: false,
  firstComment: true,
  poll: false,
  video: false,
  carousel: false,
  altText: false,
  maxMedia: 4,
  linkPreview: false,
  refreshToken: false,
  watchlist: false,
},
```

Columns:

| Capability | Meaning |
|-----------|---------|
| `analytics` | Provider supports fetching analytics data |
| `comments` | Provider supports comment read/reply/like |
| `firstComment` | Provider supports posting a first comment after the main post |
| `poll` | Provider supports poll posts |
| `video` | Provider supports video uploads |
| `carousel` | Provider supports multi-image carousels |
| `altText` | Provider supports alt text on images |
| `maxMedia` | Maximum number of media items per post |
| `linkPreview` | Provider generates link previews |
| `refreshToken` | Provider supports token refresh |
| `watchlist` | Provider supports public-metric probing for competitor tracking |

## Step 4: Register in the integration manager

Import your provider and add it to the `socialIntegrationList` array in
`libraries/nestjs-libraries/src/integrations/integration.manager.ts`:

```typescript
import { YourProvider } from '@gitroom/nestjs-libraries/integrations/social/yourprovider.provider';

export const socialIntegrationList: Array<SocialAbstract & SocialProvider> = [
  // ...existing providers...
  new YourProvider(),
];
```

## Step 5: Frontend composer component

Create a provider-specific editor component in
`apps/frontend/src/components/new-launch/` (e.g. `yourprovider.component.tsx`).

The component should render any provider-specific settings fields (character
counter, media preview, poll options, etc.) and integrate with the shared
composer form.

## Step 6: Provider icon and settings

- Add a provider icon in the frontend's icon registry.
- Wire the provider into the settings form if it has custom fields.

## Step 7: Tests

Add a test file (e.g. `yourprovider.provider.spec.ts`) that:
- Exports a mock config
- Tests auth flow
- Tests posting with various media types
- Verifies error handling
- Counts assertions match expected results

Use the existing `TumblrProvider`, `PixelfedProvider`, and `PeerTubeProvider`
as reference implementations — they demonstrate OAuth2, custom fields, and
instance-URL patterns respectively.

## Summary checklist

1. [ ] Create provider class extending `SocialAbstract` implementing `SocialProvider`
2. [ ] Implement `getAuthConfig()` (OAuth or custom fields)
3. [ ] Implement `post()` method
4. [ ] Optional: implement `ISocialMediaComments` for comment support
5. [ ] Add entry to `PROVIDER_CAPABILITIES` matrix
6. [ ] Register in `integration.manager.ts` socialIntegrationList
7. [ ] Add frontend editor component
8. [ ] Use `safeFetch` for all outbound HTTP
9. [ ] Write tests

> Verified against v3.7.0

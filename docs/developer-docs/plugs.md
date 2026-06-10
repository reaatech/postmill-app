# Plugs

Plugs are automation hooks attached to social channel providers. They allow
providers to define custom actions that run either on a schedule (polling) or
immediately after a post is published.

## Two plug types

### Auto Plugs (`@Plug` decorator)

Polling-based background jobs that react to analytics or time-based triggers.

Declared with the `@Plug` decorator from `@gitroom/helpers/decorators/plug.decorator`:

```typescript
@Plug({
  identifier: 'republish-top-post',
  title: 'Republish top post',
  description: 'When a post reaches a certain number of likes, republish it',
  runEveryMilliseconds: 3600000,  // How often to check
  totalRuns: 10,                  // Max number of runs (0 = unlimited)
  disabled: false,
  fields: [
    {
      name: 'likes',
      description: 'Number of likes threshold',
      type: 'number',
      placeholder: '100',
      validation: /^\d+$/,
    },
  ],
})
```

Parameters:
- `identifier` — unique plug name
- `runEveryMilliseconds` — polling interval
- `totalRuns` — max runs (0 = unlimited)
- `fields` — configuration fields the user fills in the UI

### Internal / Post Plugs (`@PostPlug` decorator)

One-shot actions executed immediately after a post is successfully published.

Declared with the `@PostPlug` decorator from
`@gitroom/helpers/decorators/post.plug.ts`:

```typescript
@PostPlug({
  identifier: 'repost-as-page',
  title: 'Repost as LinkedIn Page',
  description: 'After posting, have your LinkedIn Page repost it',
  pickIntegration: ['linkedin-page'],  // Only show when these providers are connected
  fields: [
    {
      name: 'message',
      description: 'Repost message',
      type: 'text',
      placeholder: 'Check out this post!',
    },
  ],
})
```

Parameters:
- `identifier` — unique plug name
- `pickIntegration` — array of provider identifiers that must be connected for this plug
  to be available
- `fields` — configuration fields

## How plugs work

### Registration

1. Providers declare plugs using `@Plug` or `@PostPlug` decorators on methods.
2. The decorators store metadata on the prototype via `Reflect.defineMetadata`
   (`custom:plug` for auto plugs, `custom:internal_plug` for post plugs).
3. `IntegrationManager.getAllPlugs()` reads this `Reflect` metadata at runtime
   and returns all available plug definitions.
4. The frontend fetches `/integrations/plug/list` to discover available plugs.

### Configuration

1. Users configure plugs on the Plugs page (`/plugs`).
2. The frontend fetches `/integrations/:id/plugs` to get existing configurations.
3. Configuration is saved via `POST /integrations/:id/plugs` with `PlugDto`.
4. Data is stored in the `Plugs` Prisma table, upserted by
   `(plugFunction, integrationId)`.

### Execution

**Auto Plugs**: During the post workflow, `PostActivity` checks configured plugs.
When conditions are met, the plug handler is called.

**Post Plugs**: Executed by `PostActivity` immediately after a successful
`provider.post()`. The workflow processes post plugs before completing.

### Deduplication

The `ExisingPlugData` model prevents re-reposting. When a post plug runs, it
records that the plug has been executed for this post/plug combination so that
retries (e.g. Temporal `continueAsNew`) don't trigger duplicate actions.

## Frontend integration

The frontend features:
- `plugs.tsx` — sidebar with plug categories and a list of configured plugs
- `plug.tsx` — individual plug cards with a configuration modal built with
  `react-hook-form` + `yup` validation

The configuration modal renders fields based on the plug's `fields` definition
(type, placeholder, validation regex).

## Plug data flow

```
Provider @Plug/@PostPlug decorator
  → Reflect metadata ('custom:plug' / 'custom:internal_plug')
    → IntegrationManager.getAllPlugs() reads metadata
      → GET /integrations/plug/list → frontend renders available plugs
      → User configures plug → POST /integrations/:id/plugs
        → Stored in Plugs table (upsert by plugFunction + integrationId)
          → PostActivity reads plugs during workflow execution
            → Internal plugs: check ExisingPlugData → execute if new
            → Auto plugs: run on polling interval
```

> Verified against v3.7.0

# Provider versions catalog

> Verified against v4.0.0

This page lists every provider currently registered in the unified provider framework, grouped by
domain. All current providers are at version `v1`.

Use `GET /providers/catalog?domain=` to fetch this catalog live from the running backend.
Use `GET /admin/providers/health?domain=` (super-admin) for per-version health counters.

## AI (`ai`)

| Provider | ID | Status | Notes |
|---|---|---|---|
| OpenAI | `openai` | active | Direct + hub surfaces (LLM, image, TTS, embedding). |
| Anthropic | `anthropic` | active | Claude family. |
| Google Gemini | `google` | active | Developer API. Distinct from Google Vertex (`vertex`). |
| Google Vertex | `vertex` | active | Enterprise GCP path (service-account auth). |
| Groq | `groq` | active | Fast inference, TTS. |
| Mistral | `mistral` | active | Mistral/La Plateforme. |
| Cohere | `cohere` | active | Command models. |
| DeepSeek | `deepseek` | active | DeepSeek-V3 / R1. |
| Together AI | `togetherai` | active | Image + video + TTS hub. |
| Fireworks | `fireworks` | active | Image hub. |
| DeepInfra | `deepinfra` | active | Image/video/TTS hub. |
| SiliconFlow | `siliconflow` | active | Image + Wan2.x video + TTS hub. |
| OpenRouter | `openrouter` | active | Image hub. |
| MiniMax | `minimax` | active | Live-linked with media surface. |
| Qwen | `qwen` | active | Universal AI/media credential. |
| xAI / Grok | `xai` | active | Grok models. |
| Azure OpenAI | `azure` | active | AI-SDK delegated image. |
| Amazon Bedrock | `bedrock` | active | AI-SDK delegated image. |
| Gateway | `gateway` | active | AI-SDK delegated image; experimental video. |
| Meta Llama | `meta-llama` | active | OpenAI-compatible. |
| Perplexity | `perplexity` | active | OpenAI-compatible. |
| GMI Cloud | `gmihub` | active | OpenAI-compatible. |
| Bitdeer AI | `bitdeer` | active | OpenAI-compatible. |
| Lightning AI | `lightning` | active | OpenAI-compatible. |
| Vultr Inference | `vultr` | active | OpenAI-compatible. |

## Media (`media`)

| Provider | ID | Domains | Notes |
|---|---|---|---|
| HeyGen | `heygen` | avatar video | Bespoke studio. |
| Runway | `runway` | video | Studio-kit. |
| Luma | `luma` | video | Studio-kit. |
| MiniMax | `minimax` | video/audio | Studio-kit. |
| Kling | *(via `fal`)* | video | Studio-kit riding the `fal` adapter. |
| Pika | *(via `fal`)* | video | Studio-kit riding the `fal` adapter. |
| Replicate | `replicate` | image/video/audio/upscale | Bespoke studio. |
| Black Forest Labs | `black-forest-labs` | image | Studio-kit. |
| Stability AI | `stability-ai` | image | Studio-kit. |
| Ideogram | `ideogram` | image | Studio-kit. |
| Recraft | `recraft` | image | Studio-kit. |
| Leonardo.ai | `leonardo` | image | Studio-kit. |
| OpenAI | `openai` | image/TTS/video | Sora video + DALL·E; TTS tab. |
| Google AI Studio | `google-ai` | image/video | Gemini Developer API. |
| Google Vertex | `vertex` | image/video | GCP service-account auth. |
| Qwen | `qwen` | image/video | Universal AI credential. |
| Wan | `wan` | image/video | Alibaba Model Studio. |
| Higgsfield | `higgsfield` | image/video/audio→video | Studio-kit. |
| LTX Studio | `ltx` | video | Studio-kit. |
| Reel.Farm | `reelfarm` | video | Studio-kit. |
| Genviral | `genviral` | video | Studio-kit. |
| Suno | `suno` | audio (music) | Studio-kit. Async, 2 clips/gen via `extraArtifactUrls`. Beta. |
| Sora | *(via `openai`)* | video | Branded studio riding the `openai` adapter. |
| Deepgram | `deepgram` | STT | Bespoke transcription studio. |
| ElevenLabs | `elevenlabs` | TTS | Studio-kit audio tab. |
| D-ID | `did` | avatar video | Studio-kit. |
| Hedra | `hedra` | avatar video | Studio-kit. |
| Tavus | `tavus` | avatar video | Studio-kit. |
| fal | `fal` | video/image | Hub surface; hosts Pika/Kling branded studios. |

## Short-link (`shortlink`)

All 19 adapters: `bitly`, `tinyurl`, `tly`, `shortio`, `rebrandly`, `dub`, `cuttly`, `tinycc`,
`isgd`, `vgd`, `blink`, `t2m`, `linkly`, `replug`, `switchy`, `pixelme`, `sniply`, `owly`,
`cleanuri`.

## VPN (`vpn`)

`nordvpn`, `expressvpn`, `surfshark`, `protonvpn`, `mullvad`, `cyberghost`, `pia`, `ipvanish`,
`windscribe`, `tunnelbear`, `hotspotshield`, `purevpn`, `vyprvpn`, `hideme`, `mozillavpn`,
`custom-proxy`.

## Social / channel (`social`)

`x`, `linkedin`, `linkedin-page`, `reddit`, `instagram`, `instagram-standalone`, `facebook`,
`threads`, `youtube`, `gmb`, `tiktok`, `pinterest`, `dribbble`, `discord`, `slack`, `kick`,
`twitch`, `mastodon`, `bluesky`, `lemmy`, `farcaster`, `telegram`, `nostr`, `vk`, `medium`,
`devto`, `hashnode`, `wordpress`, `listmonk`, `moltbook`, `whop`, `skool`, `mewe`, `tumblr`,
`pixelfed`, `peertube`.

## Storage (`storage`)

`local`, `s3`, `cloudflare_r2`, `backblaze_b2`, `idrive_e2`, `wasabi`, `digitalocean_spaces`,
`hetzner`, `storj`, `scaleway`, `vultr`, `linode`, `s3_compatible` (provider ids preserve the
`StorageProviderType` underscores; package directories stay hyphenated, e.g. `cloudflare-r2`).

## Email (`email`)

`empty`, `resend`, `sendgrid`, `mailgun`, `postmark`, `ses`, `smtp` — all resolve through the kernel.
The former legacy email registry has been removed.

## Auth (`auth`)

Auth providers resolve through the kernel like every other domain; the legacy `AuthProviderManager`
decorator/`ModuleRef` fallback path has been removed.

## Content packs (`contentpack`)

`magnific`, `vecteezy`, `adobe-stock` (`adobestock`), `envato-elements` (`envato`).

## Lifecycle statuses

| Status | Meaning |
|---|---|
| `preview` | Available for opt-in; writes require `allowPreview`. |
| `active` | Default for new configs. |
| `deprecated` | Existing pinned rows keep working; new writes are rejected. |
| `retired` | Existing rows fail to resolve; returns `410 Gone`. |

import { Allow } from 'class-validator';

/**
 * Shared base for every per-provider post-settings DTO.
 * The post `settings` field is a class-transformer discriminated union keyed on
 * `__type` (kept via keepDiscriminatorProperty). Under the global
 * `forbidNonWhitelisted` ValidationPipe, `__type` must be an allowed property on
 * each subtype or validation 400s ("property __type should not exist").
 * `@Allow()` whitelists it without imposing validation here (EmptySettings keeps
 * its own @IsIn check).
 */
export class BaseSettings {
  @Allow()
  __type?: string;
}

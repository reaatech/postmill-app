import {
  IsOptional,
  IsString,
  IsDateString,
  IsNumber,
  Min,
  Max,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GetPostsDto {
  @ApiProperty({
    description: 'Inclusive start of the publish-date window (ISO 8601).',
    example: '2026-01-01T00:00:00.000Z',
  })
  @IsDateString()
  startDate: string;

  @ApiProperty({
    description: 'Inclusive end of the publish-date window (ISO 8601).',
    example: '2026-01-31T23:59:59.000Z',
  })
  @IsDateString()
  endDate: string;

  @ApiPropertyOptional({
    description: 'Filter to a single customer/group id.',
  })
  @IsOptional()
  @IsString()
  customer: string;

  // ── Public-API pagination (J2) ─────────────────────────────────────────────
  // The public `/posts` route otherwise returns every post in the window. These
  // bound the response: the controller caps at `limit` (default+hard-max) and
  // returns a `cursor` for the next page. Omitting them keeps the existing
  // response shape, just capped at the default. The internal calendar never
  // sends them, so its behaviour is unchanged.
  @ApiPropertyOptional({
    description:
      'Max posts to return (public API). Defaults to 100 and is hard-capped at 100.',
    minimum: 1,
    maximum: 100,
    default: 100,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  @Transform(({ value }) => parseInt(value, 10))
  limit?: number;

  @ApiPropertyOptional({
    description:
      'Opaque offset cursor returned by a previous page (public API). Start of the next slice.',
    minimum: 0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Transform(({ value }) => parseInt(value, 10))
  cursor?: number;

  // The calendar always sends `display` (week/month/day/list) on /posts — without a
  // decorator the global forbidNonWhitelisted pipe rejects it ("property display should
  // not exist") and the entire calendar data view 400s → no post cards render.
  // See apps/frontend/src/components/launches/calendar.context.tsx (loadData).
  @IsOptional()
  @IsString()
  display?: string;
}

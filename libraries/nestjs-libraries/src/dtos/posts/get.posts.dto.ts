import {
  IsOptional,
  IsString,
  IsDateString,
} from 'class-validator';

export class GetPostsDto {
  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsOptional()
  @IsString()
  customer: string;

  // The calendar always sends `display` (week/month/day/list) on /posts — without a
  // decorator the global forbidNonWhitelisted pipe rejects it ("property display should
  // not exist") and the entire calendar data view 400s → no post cards render.
  // See apps/frontend/src/components/launches/calendar.context.tsx (loadData).
  @IsOptional()
  @IsString()
  display?: string;
}

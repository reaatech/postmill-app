import { IsIn, IsOptional, IsString } from 'class-validator';

export class BillingSubscribeDto {
  @IsIn(['MONTHLY', 'YEARLY'])
  period: 'MONTHLY' | 'YEARLY';

  @IsIn(['STANDARD', 'PRO', 'TEAM', 'ULTIMATE'])
  billing: 'STANDARD' | 'PRO' | 'TEAM' | 'ULTIMATE';

  // Optional analytics/attribution fields the frontend always sends (utm string from
  // useUtmUrl, dub click id, datafast cookies). Declare them so the global
  // forbidNonWhitelisted pipe doesn't 400 the subscribe request.
  @IsOptional()
  @IsString()
  utm: string;

  @IsOptional()
  @IsString()
  dub: string;

  @IsOptional()
  @IsString()
  datafast_session_id: string;

  @IsOptional()
  @IsString()
  datafast_visitor_id: string;
}

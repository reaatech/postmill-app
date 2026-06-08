import { IsIn, IsOptional, IsString } from 'class-validator';

export class BillingSubscribeDto {
  @IsIn(['MONTHLY', 'YEARLY'])
  period: 'MONTHLY' | 'YEARLY';

  @IsIn(['STANDARD', 'PRO', 'TEAM', 'ULTIMATE'])
  billing: 'STANDARD' | 'PRO' | 'TEAM' | 'ULTIMATE';

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

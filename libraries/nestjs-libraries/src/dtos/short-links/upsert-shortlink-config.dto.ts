import { IsOptional, IsString, IsObject } from 'class-validator';

export class UpsertShortlinkConfigDto {
  @IsOptional()
  @IsObject()
  credentials?: Record<string, string>;

  @IsOptional()
  @IsString()
  customDomain?: string;

  @IsOptional()
  @IsObject()
  extraConfig?: Record<string, string>;
}

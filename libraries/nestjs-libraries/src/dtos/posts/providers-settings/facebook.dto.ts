import { BaseSettings } from './base.settings';
import { IsIn, IsOptional, ValidateIf, IsUrl } from 'class-validator';

export class FacebookDto extends BaseSettings {
  @IsOptional()
  @ValidateIf(p => p.url)
  @IsUrl()
  url?: string;

  @IsIn(['post', 'story'])
  @IsOptional()
  post_type?: 'post' | 'story';
}

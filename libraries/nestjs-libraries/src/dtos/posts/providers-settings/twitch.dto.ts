import { BaseSettings } from './base.settings';
import { IsIn, IsOptional, IsString } from 'class-validator';

export class TwitchDto extends BaseSettings {
  @IsIn(['message', 'announcement'])
  @IsOptional()
  messageType?: 'message' | 'announcement';

  @IsIn(['primary', 'blue', 'green', 'orange', 'purple'])
  @IsOptional()
  announcementColor?: 'primary' | 'blue' | 'green' | 'orange' | 'purple';
}

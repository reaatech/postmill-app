import { IsBoolean, IsEnum, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export type NotificationChannel = 'email' | 'push' | 'inApp';
export type NotificationCategory =
  | 'post_published'
  | 'post_failed'
  | 'channel_error'
  | 'comment'
  | 'budget'
  | 'watchlist'
  | 'system';

export const NOTIFICATION_CATEGORIES: NotificationCategory[] = [
  'post_published',
  'post_failed',
  'channel_error',
  'comment',
  'budget',
  'watchlist',
  'system',
];

export type DigestFrequency = 'instant' | 'daily' | 'weekly' | 'never';

export interface ChannelToggles {
  email: boolean;
  push: boolean;
  inApp: boolean;
}

export class ChannelTogglesDto implements ChannelToggles {
  @IsBoolean()
  email!: boolean;

  @IsBoolean()
  push!: boolean;

  @IsBoolean()
  inApp!: boolean;
}

export class NotificationPreferenceMastersDto {
  @ValidateNested()
  @Type(() => ChannelTogglesDto)
  email!: ChannelTogglesDto;

  @ValidateNested()
  @Type(() => ChannelTogglesDto)
  push!: ChannelTogglesDto;

  @ValidateNested()
  @Type(() => ChannelTogglesDto)
  inApp!: ChannelTogglesDto;
}

export class NotificationPreferenceCategoriesDto {
  @ValidateNested()
  @Type(() => ChannelTogglesDto)
  post_published!: ChannelTogglesDto;

  @ValidateNested()
  @Type(() => ChannelTogglesDto)
  post_failed!: ChannelTogglesDto;

  @ValidateNested()
  @Type(() => ChannelTogglesDto)
  channel_error!: ChannelTogglesDto;

  @ValidateNested()
  @Type(() => ChannelTogglesDto)
  comment!: ChannelTogglesDto;

  @ValidateNested()
  @Type(() => ChannelTogglesDto)
  budget!: ChannelTogglesDto;

  @ValidateNested()
  @Type(() => ChannelTogglesDto)
  watchlist!: ChannelTogglesDto;

  @ValidateNested()
  @Type(() => ChannelTogglesDto)
  system!: ChannelTogglesDto;
}

export class UpdateNotificationPreferenceDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationPreferenceMastersDto)
  masters?: NotificationPreferenceMastersDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationPreferenceCategoriesDto)
  categories?: NotificationPreferenceCategoriesDto;

  @IsOptional()
  @IsEnum(['instant', 'daily', 'weekly', 'never'])
  digestFrequency?: DigestFrequency;
}

export class RegisterPushTokenDto {
  @IsString()
  token!: string;

  @IsString()
  platform!: string;

  @IsOptional()
  @IsString()
  deviceName?: string;
}

export class BroadcastNotificationDto {
  @IsString()
  title!: string;

  @IsString()
  message!: string;

  @IsString()
  type!: string;

  @IsOptional()
  targetUserIds?: string[];

  @IsOptional()
  targetRoles?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => ChannelTogglesDto)
  channels?: ChannelTogglesDto;
}

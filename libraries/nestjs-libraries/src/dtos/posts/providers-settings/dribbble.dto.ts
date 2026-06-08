import { BaseSettings } from './base.settings';
import {
  IsDefined,
  IsOptional,
  IsString,
  IsUrl,
  MinLength,
} from 'class-validator';

export class DribbbleDto extends BaseSettings {
  @IsString()
  @IsDefined()
  @MinLength(1, {
    message: 'Title is required',
  })
  title: string;

  @IsString()
  @IsOptional()
  @IsUrl()
  team: string;
}

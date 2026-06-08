import { BaseSettings } from './base.settings';
import { IsDefined, IsString, MinLength } from 'class-validator';

export class MoltbookDto extends BaseSettings {
  @MinLength(1)
  @IsDefined()
  @IsString()
  submolt: string;
}

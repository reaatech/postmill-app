import { BaseSettings } from './base.settings';
import { IsDefined, IsOptional, IsString, MinLength } from 'class-validator';
import { JSONSchema } from 'class-validator-jsonschema';

export class WhopDto extends BaseSettings {
  @MinLength(1)
  @IsDefined()
  @IsString()
  @JSONSchema({
    description: 'Company ID',
  })
  company: string;

  @MinLength(1)
  @IsDefined()
  @IsString()
  @JSONSchema({
    description: 'Experience ID for the Whop forum',
  })
  experience: string;

  @IsOptional()
  @IsString()
  title?: string;
}

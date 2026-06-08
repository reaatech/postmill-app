import { BaseSettings } from './base.settings';
import { IsDefined, IsString, MinLength } from 'class-validator';
import { JSONSchema } from 'class-validator-jsonschema';

export class SlackDto extends BaseSettings {
  @MinLength(1)
  @IsDefined()
  @IsString()
  @JSONSchema({
    description: 'Channel must be an id',
  })
  channel: string;
}

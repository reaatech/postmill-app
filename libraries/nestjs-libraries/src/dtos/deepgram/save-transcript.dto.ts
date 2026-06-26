import { Type } from 'class-transformer';
import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class TranscriptSegmentDto {
  @IsNumber()
  start!: number;

  @IsNumber()
  end!: number;

  @IsString()
  text!: string;
}

export class SaveTranscriptDto {
  @IsString()
  text!: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TranscriptSegmentDto)
  segments?: TranscriptSegmentDto[];
}

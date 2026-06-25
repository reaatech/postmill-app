import { IsIn, IsObject, IsString } from 'class-validator';

export class RunSyncDto {
  @IsString()
  modelId!: string;

  @IsObject()
  input!: Record<string, unknown>;

  @IsIn(['image', 'stt'])
  operation!: 'image' | 'stt';
}

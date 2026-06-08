import { IsDefined, IsOptional, IsString } from 'class-validator';

export class AddCommentDto {
  @IsString()
  @IsDefined()
  content: string;

  @IsOptional()
  @IsString()
  date: string;
}

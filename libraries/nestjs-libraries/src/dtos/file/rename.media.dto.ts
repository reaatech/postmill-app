import { IsString } from 'class-validator';

export class RenameMediaDto {
  @IsString()
  name: string;
}

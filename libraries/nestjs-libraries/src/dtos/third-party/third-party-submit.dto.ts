import { IsOptional, IsString } from 'class-validator';

export class ThirdPartySubmitDto {
  @IsOptional()
  @IsString()
  id?: string;
}

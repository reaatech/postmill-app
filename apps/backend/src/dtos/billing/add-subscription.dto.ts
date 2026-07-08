import { IsString } from 'class-validator';

export class AddSubscriptionDto {
  @IsString()
  subscription!: string;
}

import { IsBoolean, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ReplyCommentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  message: string;
}

export class LikeCommentDto {
  @IsBoolean()
  like: boolean;
}

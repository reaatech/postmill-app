import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class ReplyCommentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  message: string;

  // Set by the agent HITL confirm card so AI-drafted outward replies still pass
  // the org's output guardrail on approve (default off = unchanged for humans).
  @IsOptional()
  @IsBoolean()
  guardrail?: boolean;
}

export class LikeCommentDto {
  @IsBoolean()
  like: boolean;
}

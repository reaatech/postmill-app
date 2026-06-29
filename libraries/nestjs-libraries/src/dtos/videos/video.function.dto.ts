import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VideoFunctionDto {
  @ApiProperty({ description: 'Video generator identifier.' })
  @IsString()
  identifier: string;

  @ApiProperty({ description: 'Generator function/method to invoke.' })
  @IsString()
  functionName: string;

  @ApiProperty({
    description: 'Arguments passed to the generator function.',
    required: false,
    type: Object,
  })
  params: any;
}

import {
  IsIn, Validate, ValidationArguments, ValidatorConstraint, ValidatorConstraintInterface
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { VideoAbstract } from '@gitroom/nestjs-libraries/videos/video.interface';

@ValidatorConstraint({ name: 'checkInRuntime', async: false })
export class ValidIn implements ValidatorConstraintInterface {
  private _load() {
    return (Reflect.getMetadata('video', VideoAbstract) || [])
      .filter((f: any) => f.available)
      .map((p: any) => p.identifier);
  }

  validate(text: string, args: ValidationArguments) {
    // Check if the text is in the list of valid video types
    const validTypes = this._load();
    return validTypes.includes(text);
  }

  defaultMessage(args: ValidationArguments) {
    // here you can provide default error message if validation failed
    return 'type must be any of: ' + this._load().join(', ');
  }
}

export class VideoDto {
  @ApiProperty({ description: 'Video generator identifier.' })
  @Validate(ValidIn)
  type: string;

  @ApiProperty({
    enum: ['vertical', 'horizontal'],
    description: 'Output orientation.',
  })
  @IsIn(['vertical', 'horizontal'])
  output: 'vertical' | 'horizontal';

  @ApiProperty({
    description: 'Generator-specific parameters.',
    required: false,
    type: Object,
  })
  customParams: any;
}

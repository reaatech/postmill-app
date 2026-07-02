import { IsBoolean, IsOptional, IsString, Allow } from 'class-validator';

export class LinkedinDto {
  // Discriminator property kept by keepDiscriminatorProperty:true on the post settings
  // union; the service reads settings.__type. Allow it so forbidNonWhitelisted does not 400.
  @Allow()
  __type?: string;

  @IsBoolean()
  @IsOptional()
  post_as_images_carousel: boolean;

  @IsString()
  @IsOptional()
  carousel_name?: string;
}
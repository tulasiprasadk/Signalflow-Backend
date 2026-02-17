import { IsNotEmpty, IsString, IsUrl } from 'class-validator';

export class CreateOrgDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsString()
  @IsNotEmpty()
  category: string;

  @IsString()
  @IsNotEmpty()
  location: string;

  @IsUrl()
  website: string;
}

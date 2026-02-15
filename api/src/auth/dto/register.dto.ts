import { IsEmail, IsString, MinLength, IsOptional } from 'class-validator';
import { Role } from '@prisma/client';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  name!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsOptional()
  role?: Role; 
}

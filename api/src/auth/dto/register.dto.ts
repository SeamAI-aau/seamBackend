import { IsEmail, IsString, MinLength, IsOptional } from 'class-validator';
import { Role } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({
    example: 'scrum.master@example.com',
    description: 'Email address for the new user (must be unique).',
  })
  @IsEmail()
  email!: string;

  @ApiProperty({
    example: 'Jane Doe',
    description: 'Full name of the user.',
  })
  @IsString()
  name!: string;

  @ApiProperty({
    example: 'StrongP@ssw0rd',
    description: 'Password with minimum length of 6 characters.',
    minLength: 6,
  })
  @IsString()
  @MinLength(6)
  password!: string;

  @ApiPropertyOptional({
    enum: Role,
    example: Role.SCRUM_MASTER,
    description: 'Optional role; defaults to DEVELOPER when omitted.',
  })
  @IsOptional()
  role?: Role;
}

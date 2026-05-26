import { IsEmail, IsString, MinLength, IsOptional, Matches, IsIn } from 'class-validator';
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_PATTERN,
  PASSWORD_PATTERN_MESSAGE,
} from '../constants/password.constants';
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
    example: 'StrongP@ss1',
    description: PASSWORD_PATTERN_MESSAGE,
    minLength: PASSWORD_MIN_LENGTH,
  })
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @Matches(PASSWORD_PATTERN, { message: PASSWORD_PATTERN_MESSAGE })
  password!: string;

  @ApiPropertyOptional({
    enum: ['scrum_master'],
    example: 'scrum_master',
    description:
      'Set to `scrum_master` only from the Scrum Master sign-up flow. All other registrations are developers.',
  })
  @IsOptional()
  @IsIn(['scrum_master'])
  registrationIntent?: 'scrum_master';
}

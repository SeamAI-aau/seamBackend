import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MinLength } from 'class-validator';
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_PATTERN,
  PASSWORD_PATTERN_MESSAGE,
} from '../constants/password.constants';

export class ResetPasswordDto {
  @ApiProperty({ description: 'Token from the password-reset email link.' })
  @IsString()
  @MinLength(32)
  token!: string;

  @ApiProperty({ example: 'NewSecureP@ss1', minLength: PASSWORD_MIN_LENGTH })
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @Matches(PASSWORD_PATTERN, { message: PASSWORD_PATTERN_MESSAGE })
  newPassword!: string;
}

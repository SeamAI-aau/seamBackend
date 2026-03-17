import { IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AcceptInviteDto {
  @ApiProperty({
    example: 'developer@example.com',
    description:
      'Email address that received the invitation. Must match the currently authenticated user.',
  })
  @IsEmail()
  email!: string;
}

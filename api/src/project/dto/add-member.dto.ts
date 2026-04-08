import { IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AddMemberDto {
  @ApiProperty({
    example: 'developer@example.com',
    description: 'Email address of the user to invite or add to the project.',
  })
  @IsEmail()
  email!: string;
}

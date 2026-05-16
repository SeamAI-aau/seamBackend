import { Role } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UserResponseDto {
  @ApiProperty({
    example: 'user-123',
    description: 'Unique identifier of the user.',
  })
  id!: string;

  @ApiProperty({
    example: 'scrum.master@example.com',
    description: 'Email address of the user.',
  })
  email!: string;

  @ApiProperty({
    example: 'Jane Doe',
    nullable: true,
    description: 'Full name of the user. Can be null if not set.',
  })
  name!: string | null;

  @ApiProperty({
    enum: Role,
    example: Role.SCRUM_MASTER,
    description: 'Role of the user in the system.',
  })
  role!: Role;

  @ApiPropertyOptional({
    example: 'jane-doe-dev',
    nullable: true,
    description: 'Optional GitHub username linked to the user.',
  })
  githubUsername?: string | null;

  @ApiPropertyOptional({
    example: 'https://res.cloudinary.com/example/image/upload/v1/avatars/user-123/photo.jpg',
    nullable: true,
    description: 'Profile avatar image URL when set.',
  })
  avatarUrl?: string | null;

  @ApiProperty({
    example: true,
    description:
      'Indicates whether the user has an uploaded voice sample. The actual URL is never exposed.',
  })
  hasVoiceSample!: boolean;

  @ApiProperty({
    example: true,
    description: 'True after the user verifies their email or signs in with Google.',
  })
  emailVerified!: boolean;

  @ApiPropertyOptional({
    description: 'Projects this user owns or is a member of.',
    isArray: true,
    example: [
      { id: 'project-1', name: 'Velocity Tracker' },
      { id: 'project-2', name: 'Daily Standup Assistant' },
    ],
  })
  projects?: { id: string; name: string }[];
}

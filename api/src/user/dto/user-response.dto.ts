import { Role } from '@prisma/client';

export class UserResponseDto {
  id!: string;
  email!: string;
  name!: string | null;
  role!: Role;
  githubUsername?: string | null;
  voiceSampleUrl?: string | null;
  projects?: { id: string; name: string }[];
}

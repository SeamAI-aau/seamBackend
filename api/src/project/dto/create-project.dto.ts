import { IsString, IsOptional, MaxLength } from 'class-validator';

export class CreateProjectDto {
  @IsString()
  @MaxLength(100)
  name!: string; // ✅ add !

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

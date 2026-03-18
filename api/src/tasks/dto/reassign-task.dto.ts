import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID, ValidateIf } from 'class-validator';

/**
 * Reassign or unassign a task.
 * - assigneeId: UUID of the new assignee, or null/omit to unassign (status set to EXTRACTED).
 * Allowed: Scrum Master or current assignee.
 */
export class ReassignTaskDto {
  @ApiPropertyOptional({
    example: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
    description: 'User ID of the new assignee. Omit or send null to unassign the task.',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, v) => v != null && v !== '')
  @IsUUID()
  assigneeId!: string | null;
}

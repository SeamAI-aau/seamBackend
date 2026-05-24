import type { IProjectRepository } from './types/project.repository';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';

/** Reject task assignment to users who have not accepted the project invite. */
export async function assertProjectTaskAssignee(
  projectRepo: IProjectRepository,
  projectId: string,
  assigneeId: string,
): Promise<void> {
  const allowed = await projectRepo.canAssignTasksToUser(projectId, assigneeId);
  if (!allowed) {
    throw new AppException(
      ErrorCode.FORBIDDEN,
      'Tasks can only be assigned to active project members who have accepted their invitation',
      403,
    );
  }
}

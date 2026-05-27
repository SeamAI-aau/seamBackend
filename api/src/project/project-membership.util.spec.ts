import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { assertProjectTaskAssignee } from './project-membership.util';
import type { IProjectRepository } from './types/project.repository';

describe('assertProjectTaskAssignee', () => {
  function makeProjectRepo(canAssign: boolean): IProjectRepository {
    return {
      canAssignTasksToUser: jest.fn().mockResolvedValue(canAssign),
    } as unknown as IProjectRepository;
  }

  it('resolves when assignee is allowed for project', async () => {
    const repo = makeProjectRepo(true);

    await expect(assertProjectTaskAssignee(repo, 'project-1', 'user-1')).resolves.toBeUndefined();
    expect(repo.canAssignTasksToUser).toHaveBeenCalledWith('project-1', 'user-1');
  });

  it('throws forbidden AppException when assignee is not allowed', async () => {
    const repo = makeProjectRepo(false);

    await expect(assertProjectTaskAssignee(repo, 'project-1', 'user-2')).rejects.toMatchObject({
      errorCode: ErrorCode.FORBIDDEN,
    } satisfies Partial<AppException>);
  });
});

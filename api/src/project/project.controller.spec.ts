import { ProjectController } from './project.controller';
import type { ProjectService } from './project.service';

describe('ProjectController selected flows', () => {
  let controller: ProjectController;
  let projectService: jest.Mocked<
    Pick<
      ProjectService,
      | 'createProject'
      | 'updateProject'
      | 'addMemberByEmail'
      | 'acceptInvite'
      | 'declineInvite'
    >
  >;

  beforeEach(() => {
    projectService = {
      createProject: jest.fn(),
      updateProject: jest.fn(),
      addMemberByEmail: jest.fn(),
      acceptInvite: jest.fn(),
      declineInvite: jest.fn(),
    };

    controller = new ProjectController(projectService as unknown as ProjectService);
  });

  it('createProject delegates to service with current user and payload', async () => {
    const user = { userId: 'owner-1' };
    const dto = { name: 'Project Alpha', description: 'Core delivery project' };
    const expected = { id: 'project-1', ...dto };
    projectService.createProject.mockResolvedValue(expected as any);

    const result = await controller.createProject(user as any, dto as any);

    expect(projectService.createProject).toHaveBeenCalledWith(user, dto);
    expect(result).toEqual(expected);
  });

  it('updateProject delegates id, userId, and update payload', async () => {
    const dto = { name: 'Updated Project Name' };
    const expected = { id: 'project-1', ...dto };
    projectService.updateProject.mockResolvedValue(expected as any);

    const result = await controller.updateProject('project-1', { userId: 'owner-1' } as any, dto);

    expect(projectService.updateProject).toHaveBeenCalledWith('project-1', 'owner-1', dto);
    expect(result).toEqual(expected);
  });

  it('addMemberByEmail delegates invite flow to service', async () => {
    const expected = { id: 'member-1', email: 'dev@example.com', status: 'PENDING' };
    projectService.addMemberByEmail.mockResolvedValue(expected as any);

    const result = await controller.addMemberByEmail(
      'project-1',
      { userId: 'owner-1' } as any,
      { email: 'dev@example.com' },
    );

    expect(projectService.addMemberByEmail).toHaveBeenCalledWith(
      'project-1',
      'owner-1',
      'dev@example.com',
    );
    expect(result).toEqual(expected);
  });

  it('acceptInvite delegates accept flow to service', async () => {
    const expected = { id: 'member-1', status: 'ACTIVE' };
    projectService.acceptInvite.mockResolvedValue(expected as any);

    const result = await controller.acceptInvite(
      'project-1',
      { userId: 'user-2' } as any,
      { email: 'dev@example.com' },
    );

    expect(projectService.acceptInvite).toHaveBeenCalledWith(
      'project-1',
      'user-2',
      'dev@example.com',
    );
    expect(result).toEqual(expected);
  });

  it('declineInvite delegates decline flow to service', async () => {
    const expected = { message: 'Invitation declined' };
    projectService.declineInvite.mockResolvedValue(expected as any);

    const result = await controller.declineInvite(
      'project-1',
      { userId: 'user-2' } as any,
      { email: 'dev@example.com' },
    );

    expect(projectService.declineInvite).toHaveBeenCalledWith(
      'project-1',
      'user-2',
      'dev@example.com',
    );
    expect(result).toEqual(expected);
  });
});

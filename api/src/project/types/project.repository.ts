import type { Project, ProjectMember } from '@prisma/client';
import { CreateProjectDto } from '../dto/create-project.dto';

export type CreateProjectInput = CreateProjectDto & { ownerId: string };

export type ProjectMemberWithUser = {
  id: string;
  projectId: string;
  email: string;
  status: 'PENDING' | 'ACTIVE';
  userId: string | null;
  createdAt: Date;
  user: {
    id: string;
    email: string;
    name: string | null;
    role: string;
    githubUsername: string | null;
  } | null;
};

export interface IProjectRepository {
  createProject(data: CreateProjectInput): Promise<Project>;

  findById(projectId: string): Promise<Project | null>;

  findUserProjects(userId: string, options?: { skip?: number; take?: number }): Promise<Project[]>;

  countUserProjects(userId: string): Promise<number>;

  updateProject(
    projectId: string,
    data: Partial<Pick<Project, 'name' | 'description' | 'githubRepoUrl' | 'jiraProjectKey'>>,
  ): Promise<Project>;

  deleteProject(projectId: string): Promise<Project>;

  /** Add active member (user exists) or create pending invite (user not found). */
  addMemberByEmail(
    projectId: string,
    email: string,
    userId?: string,
  ): Promise<{
    member: {
      id: string;
      projectId: string;
      email: string;
      status: 'PENDING' | 'ACTIVE';
      userId: string | null;
      createdAt: Date;
    };
    pending: boolean;
  }>;

  findMembersByProject(
    projectId: string,
    options?: { skip?: number; take?: number },
  ): Promise<ProjectMemberWithUser[]>;

  countMembersByProject(projectId: string): Promise<number>;

  findPendingInvite(projectId: string, email: string): Promise<ProjectMember | null>;

  findMemberById(memberId: string): Promise<ProjectMemberWithUser | null>;

  acceptInvite(projectId: string, email: string, userId: string): Promise<ProjectMember>;

  deleteMember(memberId: string): Promise<ProjectMember>;

  isOwner(projectId: string, userId: string): Promise<boolean>;

  isMember(projectId: string, userId: string): Promise<boolean>;

  findProjectIdsWithGithubRepo(): Promise<string[]>;
}

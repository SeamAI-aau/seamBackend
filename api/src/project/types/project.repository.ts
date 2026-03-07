import type { Project, ProjectMember } from '@prisma/client';
import { CreateProjectDto } from '../dto/create-project.dto';

export type CreateProjectInput = CreateProjectDto & { ownerId: string };

export interface IProjectRepository {
  createProject(data: CreateProjectInput): Promise<Project>;

  findById(projectId: string): Promise<Project | null>;

  findUserProjects(
    userId: string,
    options?: { skip?: number; take?: number },
  ): Promise<Project[]>;

  countUserProjects(userId: string): Promise<number>;

  updateProject(
    projectId: string,
    data: Partial<Pick<Project, 'name' | 'description' | 'githubRepoUrl' | 'jiraProjectKey'>>,
  ): Promise<Project>;

  deleteProject(projectId: string): Promise<Project>;

  addMember(projectId: string, userId: string): Promise<ProjectMember>;

  isOwner(projectId: string, userId: string): Promise<boolean>;

  isMember(projectId: string, userId: string): Promise<boolean>;

  findProjectIdsWithGithubRepo(): Promise<string[]>;
}

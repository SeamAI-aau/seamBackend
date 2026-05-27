import { Role } from '@prisma/client';
import { AppException } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-codes';
import type { CurrentUserType } from '../../auth/types/current-user.type';

export type ProjectActivityAccess = {
  ownerId: string;
  isOwner: boolean;
  isMember: boolean;
};

/** Scrum Masters (and project owners who are SM on the project) may view team performance activity. */
export function canViewTeamPerformanceActivity(
  user: CurrentUserType,
  access: ProjectActivityAccess,
): boolean {
  if (user.role !== Role.SCRUM_MASTER) {
    return false;
  }
  return access.isOwner || access.isMember;
}

/**
 * Resolves which user's activity rows may be read.
 * - Developers: always their own user id (performance data is private to self + SM).
 * - Scrum Masters: optional filter; omit to view the whole team.
 */
export function resolvePerformanceActivityUserId(
  user: CurrentUserType,
  access: ProjectActivityAccess,
  requestedUserId?: string,
): string | undefined {
  const canViewTeam = canViewTeamPerformanceActivity(user, access);

  if (!canViewTeam) {
    if (requestedUserId && requestedUserId !== user.userId) {
      throw new AppException(
        ErrorCode.FORBIDDEN,
        'Developers may only view their own activity in this project',
        403,
      );
    }
    return user.userId;
  }

  return requestedUserId;
}

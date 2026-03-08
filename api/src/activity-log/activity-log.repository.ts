export interface CreateActivityLogInput {
  projectId?: string;
  userId?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: object;
}

export interface ActivityLogFilters {
  projectId?: string;
  userId?: string;
  action?: string;
  fromDate?: Date;
  toDate?: Date;
}

export interface IActivityLogRepository {
  create(data: CreateActivityLogInput): Promise<{ id: string; createdAt: Date }>;

  findMany(
    filters: ActivityLogFilters,
    options?: { skip?: number; take?: number },
  ): Promise<ActivityLogWithRelations[]>;

  count(filters: ActivityLogFilters): Promise<number>;
}

export interface ActivityLogWithRelations {
  id: string;
  projectId: string | null;
  userId: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: object | null;
  createdAt: Date;
  project: { id: string; name: string } | null;
  user: { id: string; name: string | null; email: string } | null;
}

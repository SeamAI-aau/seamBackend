export interface UpsertDeveloperActivityInput {
  projectId: string;
  userId?: string | null;
  source: 'GITHUB' | 'JIRA';
  type: string;
  externalId: string | null;
  title: string | null;
  metadata?: object | null;
  occurredAt: Date;
}

export interface DeveloperActivityFilters {
  projectId: string;
  userId?: string;
  source?: 'GITHUB' | 'JIRA';
  type?: string;
  fromDate?: Date;
  toDate?: Date;
}

export interface DeveloperActivityWithUser {
  id: string;
  projectId: string;
  userId: string | null;
  source: string;
  type: string;
  externalId: string | null;
  title: string | null;
  metadata: object | null;
  occurredAt: Date;
  user: { id: string; name: string | null; email: string } | null;
}

export interface ChartBucket {
  date: string; // YYYY-MM-DD
  count: number;
  byType?: Record<string, number>;
}

export interface IDeveloperActivityRepository {
  upsert(data: UpsertDeveloperActivityInput): Promise<void>;
  findMany(
    filters: DeveloperActivityFilters,
    options?: { skip?: number; take?: number },
  ): Promise<DeveloperActivityWithUser[]>;
  count(filters: DeveloperActivityFilters): Promise<number>;
  getChartData(
    projectId: string,
    fromDate: Date,
    toDate: Date,
    groupBy: 'day' | 'week',
    userId?: string,
  ): Promise<ChartBucket[]>;
}

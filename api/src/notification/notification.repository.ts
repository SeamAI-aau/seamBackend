export interface CreateNotificationInput {
  userId: string;
  type: string;
  title: string;
  body?: string;
  metadata?: object;
}

export interface NotificationFilters {
  userId: string;
  unreadOnly?: boolean;
  type?: string;
  fromDate?: Date;
  toDate?: Date;
}

export interface NotificationWithUser {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string | null;
  metadata: object | null;
  readAt: Date | null;
  createdAt: Date;
}

export interface INotificationRepository {
  create(data: CreateNotificationInput): Promise<NotificationWithUser>;
  findMany(
    filters: NotificationFilters,
    options?: { skip?: number; take?: number },
  ): Promise<NotificationWithUser[]>;
  count(filters: NotificationFilters): Promise<number>;
  markAsRead(id: string, userId: string): Promise<boolean>;
  markAllAsRead(userId: string): Promise<number>;
}

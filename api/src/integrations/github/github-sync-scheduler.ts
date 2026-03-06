import { Injectable, OnModuleInit } from '@nestjs/common';
import { GithubSyncQueue } from './queue/github-sync.queue';

@Injectable()
export class GithubSyncScheduler implements OnModuleInit {
  constructor(private readonly githubSyncQueue: GithubSyncQueue) {}

  async onModuleInit(): Promise<void> {
    await this.githubSyncQueue.registerRepeatableSyncAll();
  }
}

import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import { decrypt } from '../../../common/utils/encryption.util';

const prisma = new PrismaClient();

const connection = new IORedis({
  host: 'localhost',
  port: 6379,
});

new Worker(
  'jira-sync',
  async job => {
    const { taskId } = job.data;

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        meeting: {
          include: {
            project: true,
          },
        },
      },
    });

    if (!task) return;

    // Idempotency check #2
    if (task.jiraIssueKey) return;

    if (task.status !== 'APPROVED') return;

    const ownerId = task.meeting.project.ownerId;

    const jiraAccount = await prisma.jiraAccount.findUnique({
      where: { userId: ownerId },
    });

    if (!jiraAccount) throw new Error('Jira not connected');

    const secret = process.env.TOKEN_ENCRYPTION_SECRET || 'this is a secret';

    const accessToken = decrypt(
      jiraAccount.accessToken,
      secret,
    );

    const cloudId = jiraAccount.cloudId;

    const projectKey = task.meeting.project.jiraProjectKey;

    const response = await axios.post(
      `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/issue`,
      {
        fields: {
          project: { key: projectKey },
          summary: task.title,
          description: task.description || '',
          issuetype: { name: 'Task' },
        },
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
      },
    );

    const issueKey = response.data.key;

    await prisma.task.update({
      where: { id: taskId },
      data: {
        jiraIssueKey: issueKey,
        status: 'SYNCED',
      },
    });
  },
  { connection },
);
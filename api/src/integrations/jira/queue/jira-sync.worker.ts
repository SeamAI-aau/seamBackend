import { Worker } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import { decrypt } from '../../../common/utils/encryption.util';

const prisma = new PrismaClient();

/** Plain options avoid duplicate `ioredis` typings between root and bullmq's nested copy. */
const connection = {
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT ?? 6379),
  ...(process.env.REDIS_PASSWORD ? { password: process.env.REDIS_PASSWORD } : {}),
  ...(process.env.REDIS_TLS === 'true' ? { tls: {} } : {}),
};

new Worker(
  'jira-sync',
  async (job) => {
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

    const accessToken = decrypt(jiraAccount.accessToken, secret);

    const cloudId = jiraAccount.cloudId;

    const projectKey = task.meeting.project.jiraProjectKey;

    const descriptionAdf = {
      type: 'doc',
      version: 1,
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: task.description || 'No description provided.',
            },
          ],
        },
      ],
    };

    const response = await axios.post(
      `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/issue`,
      {
        fields: {
          project: { key: projectKey },
          summary: task.title,
          description: descriptionAdf,
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

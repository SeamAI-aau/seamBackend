import { existsSync } from 'fs';
import { join } from 'path';
import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import * as Joi from 'joi';

/** Works when cwd is repo root or `api/` (Nx serve uses `cwd: api`). */
function resolveApiEnvFilePaths(): string[] {
  const cwd = process.cwd();
  return [
    join(cwd, 'api', 'src', '.env'),
    join(cwd, 'api', '.env'),
    join(cwd, 'src', '.env'),
    join(cwd, '.env'),
  ].filter((p) => existsSync(p));
}

@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      envFilePath: resolveApiEnvFilePaths(),
      validationSchema: Joi.object({
        PORT: Joi.number().default(3000),

        JWT_SECRET: Joi.string().min(10).required(),
        JWT_ACCESS_TOKEN_EXPIRES_IN: Joi.string().default('15m'),
        JWT_REFRESH_TOKEN_EXPIRES_IN: Joi.string().default('7d'),

        BCRYPT_SALT_ROUNDS: Joi.number().default(10),

        DATABASE_URL: Joi.string().required(),

        CLOUDINARY_CLOUD_NAME: Joi.string().required(),
        CLOUDINARY_API_KEY: Joi.string().required(),
        CLOUDINARY_API_SECRET: Joi.string().required(),

        REDIS_HOST: Joi.string().default('localhost'),
        REDIS_PORT: Joi.number().default(6379),
        REDIS_PASSWORD: Joi.string().optional().allow(''),

        /** Comma-separated CORS origins (include `chrome-extension://<id>` for the MV3 extension). Empty + non-production = allow all origins. */
        CORS_ORIGINS: Joi.string().optional().allow(''),

        /** Max meeting audio upload size in megabytes (multipart `file` on POST .../meetings). Default 500. */
        MEETING_UPLOAD_MAX_MB: Joi.number().integer().min(1).max(2048).optional(),

        /** BullMQ repeatable GitHub `sync-all` interval in milliseconds. Default 600000 (10 min). */
        GITHUB_SYNC_REPEAT_MS: Joi.number().integer().min(60_000).max(86_400_000).optional(),

        /** When `true`, BullMQ is not registered: meeting transcription jobs are skipped and Jira/GitHub sync queues are no-ops. */
        DISABLE_QUEUES: Joi.string().valid('true', 'false').optional(),

        /** Base URL of ai-engine-2 (e.g. `http://localhost:8000`). Required for meeting uploads. */
        AI_ENGINE_BASE_URL: Joi.string().trim().optional().allow(''),
        /** Max time (ms) for meeting dispatch: Cloudinary download + multipart POST to ai-engine until 202. Not full pipeline (that runs on the engine and completes via webhook). Default 10 minutes for large uploads. */
        AI_ENGINE_REQUEST_TIMEOUT_MS: Joi.number().integer().min(5000).max(3_600_000).optional(),

        WORKER_SECRET: Joi.string().min(1).optional(),
        /** Optional pair for ai-engine `JIRA_CONTEXT_URL` auth (`X-Internal-Key` / `X-Internal-Secret`). */
        INTERNAL_API_KEY: Joi.string().optional().allow(''),
        INTERNAL_SECRET: Joi.string().optional().allow(''),

        TOKEN_ENCRYPTION_SECRET: Joi.string().min(16).required(),

        JIRA_CLIENT_ID: Joi.string().optional(),
        JIRA_CLIENT_SECRET: Joi.string().optional(),
        JIRA_REDIRECT_URI: Joi.string().uri().optional(),
        JIRA_OAUTH_SUCCESS_REDIRECT_URL: Joi.string().uri().optional(),

        GITHUB_CLIENT_ID: Joi.string().optional(),
        GITHUB_CLIENT_SECRET: Joi.string().optional(),
        GITHUB_REDIRECT_URI: Joi.string().uri().optional(),
        GITHUB_OAUTH_SUCCESS_REDIRECT_URL: Joi.string().uri().optional(),
        /** Secret for `POST /integrations/github/webhook` (`X-Hub-Signature-256`). Must match GitHub webhook configuration. */
        GITHUB_WEBHOOK_SECRET: Joi.string().optional().allow(''),

        SMTP_HOST: Joi.string().optional(),
        SMTP_PORT: Joi.number().optional(),
        SMTP_SECURE: Joi.boolean().optional(),
        SMTP_USER: Joi.string().optional(),
        SMTP_PASS: Joi.string().optional(),
        MAIL_FROM: Joi.string().email().optional(),
        APP_NAME: Joi.string().default('Seam'),
        APP_URL: Joi.string().uri().optional(),
        FRONTEND_URL: Joi.string().uri().optional(),
        API_URL: Joi.string().uri().optional(),
      }),
    }),
  ],
})
export class ConfigModule {}

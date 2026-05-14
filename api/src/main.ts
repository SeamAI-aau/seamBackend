import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import type { ComponentsObject, SecuritySchemeObject } from 'openapi3-ts';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });
  // Allow all origins by echoing the request origin and allow credentials.
  // WARNING: This effectively allows requests from any origin and is
  // insecure for production. Use only for local development/testing.
  app.enableCors({ origin: true, credentials: true });

  app.use(cookieParser());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('SeamAi API')
    .setDescription(
      [
        'Seam.ai backend — authentication, projects, meetings, tasks, integrations (Jira/GitHub), and notifications.',
        '',
        '### Meetings and ai-engine-2',
        '',
        '- **Upload** (`POST /projects/{projectId}/meetings`): stores audio, then Nest dispatches to **ai-engine-2** `POST /api/v1/meetings/process-audio` (multipart). The engine returns **HTTP 202** with a **`job_id`**; Nest sets the meeting to **PROCESSING** and stores **`externalJobId`**. Transcription runs on the engine in the background, not on this long-lived HTTP call.',
        '- **Callback** (`POST /internal/meetings/{id}/result`): the engine posts transcript/tasks with header **`x-worker-secret`** (same value as env **`WORKER_SECRET`**). In Swagger, authorize the **worker-secret** scheme for that route.',
        '- **Tasks**: developers approve/decline via `PATCH /tasks/{id}`; Scrum Master assigns with **`PATCH /tasks/{id}/assign`**. Unassigned extracted tasks notify the project owner + Scrum Master members (`tasks_pending_assignment`).',
      ].join('\n'),
    )
    .setVersion(process.env.npm_package_version ?? '1.0.0')
    // .setContact('Seam.ai Dev Team', 'https://seam.ai', 'dev@seam.ai')
    // .setLicense('MIT', 'https://opensource.org/licenses/MIT')
    // .setTermsOfService('https://seam.ai/terms')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Paste your JWT access token here.',
      },
      'access-token',
    )
    .addApiKey(
      {
        type: 'apiKey',
        in: 'header',
        name: 'x-worker-secret',
        description:
          'Shared secret for **internal** meeting callbacks from ai-engine-2. Must match `WORKER_SECRET` on this API and the engine\'s `WORKER_SECRET` / `INTERNAL_SECRET`. Used on `POST /internal/meetings/:id/result`, not on JWT routes.',
      },
      'worker-secret',
    )
    .build();
  const document = SwaggerModule.createDocument(app, config);
  // Remove undesired controllers/endpoints from the OpenAPI document
  const pathsToRemove = ['/api', '/health'];
  if (document.paths) {
    for (const p of Object.keys(document.paths)) {
      if (pathsToRemove.includes(p) || pathsToRemove.some((t) => p.startsWith(t + '/'))) {
        delete document.paths[p];
      }
    }
  }
  // Ensure cookie security scheme is present in the generated OpenAPI document
  const components = (document.components ??
    (document.components = {} as ComponentsObject)) as ComponentsObject;
  components.securitySchemes = components.securitySchemes ?? {};
  // add cookie-based scheme for refresh/access tokens (used by the app)
  (components.securitySchemes as Record<string, SecuritySchemeObject>)['access-cookie'] = {
    type: 'apiKey',
    in: 'cookie',
    name: 'accessToken',
    description: 'HTTP-only cookie containing the access JWT',
  } as SecuritySchemeObject;
  // remove matching tags to keep Swagger UI tidy
  if (Array.isArray(document.tags)) {
    document.tags = document.tags.filter((t) => !['App', 'Health'].includes(t.name));
  }
  SwaggerModule.setup('api-docs', app, document, {
    jsonDocumentUrl: 'api-docs/json',
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
    },
  });

  await app.listen(process.env.PORT || 3000);
}

bootstrap();

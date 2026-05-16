import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import type { ComponentsObject, SecuritySchemeObject } from 'openapi3-ts';
import { buildHttpCorsOptions } from './common/config/cors.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    /** Required for `POST /integrations/github/webhook` HMAC (`X-Hub-Signature-256`) verification. */
    rawBody: true,
  });

  app.set('trust proxy', 1);

  app.enableCors({
    ...buildHttpCorsOptions(process.env.CORS_ORIGINS),
    exposedHeaders: ['Set-Cookie'],
  });

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
        '### Chrome extension (Phase 9)',
        '',
        '- Set **`CORS_ORIGINS`** to include your dashboard URL and `chrome-extension://<extension-id>`.',
        '- Send optional header **`X-Seam-Client: extension`** for request logging.',
        '- Meeting upload: **`POST /projects/{projectId}/meetings`** with Bearer JWT; see `api/docs/CHROME_EXTENSION_INTEGRATION.md`.',
      ].join('\n'),
    )
    .setVersion(process.env.npm_package_version ?? '1.0.0')
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
  const pathsToRemove = ['/api', '/health'];
  if (document.paths) {
    for (const p of Object.keys(document.paths)) {
      if (pathsToRemove.includes(p) || pathsToRemove.some((t) => p.startsWith(t + '/'))) {
        delete document.paths[p];
      }
    }
  }
  const components = (document.components ??
    (document.components = {} as ComponentsObject)) as ComponentsObject;
  components.securitySchemes = components.securitySchemes ?? {};
  (components.securitySchemes as Record<string, SecuritySchemeObject>)['access-cookie'] = {
    type: 'apiKey',
    in: 'cookie',
    name: 'accessToken',
    description: 'HTTP-only cookie containing the access JWT',
  } as SecuritySchemeObject;
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

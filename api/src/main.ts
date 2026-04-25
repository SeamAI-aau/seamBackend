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

  // enezi two lines only 
  // app.enableCors({ origin: true, credentials: true });

  // app.use(cookieParser());

  // just added now
  // === ADD THESE LINES ===
  app.set('trust proxy', 1);   // Important for Render / proxies

  const allowedOrigins = [
    'http://localhost:5173',                    // Vite development
    'http://localhost:3000',                    // Alternative dev port
    'http://localhost:8080',           // ← This is your current frontend URL
    'http://192.168.1.3:8080',  // ← CHANGE THIS to your actual frontend URL
    // Add more production/staging URLs here if needed
  ];

  app.enableCors({
    origin: (origin, callback) => {
      const allowed = [...allowedOrigins, undefined]; // allow Postman etc.
      if (allowed.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
    ],
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
    .setDescription('Seam.ai Backend API — Authentication and core services')
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

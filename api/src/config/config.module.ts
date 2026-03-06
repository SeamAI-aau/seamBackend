import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import * as Joi from 'joi';

@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      envFilePath: 'api/src/.env',
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

        WORKER_SECRET: Joi.string().min(1).optional(),
      }),
    }),
  ],
})
export class ConfigModule {}

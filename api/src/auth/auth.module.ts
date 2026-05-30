import { Global, Module, forwardRef } from '@nestjs/common';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './jwt.strategy';
import { PrismaAuthRepository } from '../prisma/repositories/prisma-auth.repository';
import { AUTH_REPOSITORY, JWT_SERVICE } from './auth.tokens';
import { JwtServiceAdapter } from './jwt.service';
import { MailModule } from '../infrastracture/mail/mail.module';
import { AuthMailService } from './auth-mail.service';
import { GoogleAuthService } from './google-auth.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ProjectModule } from '../project/project.module';

@Global()
@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    forwardRef(() => ProjectModule),
    MailModule,
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '15m' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthMailService,
    GoogleAuthService,
    PrismaService,
    JwtStrategy,
    JwtAuthGuard,
    { provide: AUTH_REPOSITORY, useClass: PrismaAuthRepository },
    { provide: JWT_SERVICE, useClass: JwtServiceAdapter },
  ],
  exports: [AuthService, AUTH_REPOSITORY, JWT_SERVICE, JwtAuthGuard],
})
export class AuthModule {}

import { Module, forwardRef } from '@nestjs/common';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { USER_REPOSITORY } from './user.token';
import { PrismaUserRepository } from '../prisma/repositories/prisma.user.repository';
import { CloudinaryModule } from '../infrastracture/cloudinary/cloudinary.module';
import { ProjectModule } from '../project/project.module';

@Module({
  imports: [CloudinaryModule, forwardRef(() => ProjectModule)],
  controllers: [UserController],
  providers: [
    UserService,
    {
      provide: USER_REPOSITORY,
      useClass: PrismaUserRepository,
    },
  ],
  exports: [USER_REPOSITORY, UserService],
})
export class UserModule {}

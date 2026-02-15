// app.controller.ts
import { Controller, Get } from '@nestjs/common';

@Controller('api')
export class AppController {
  @Get()
  getApi() {
    return { message: 'Hello API' };
  }
}

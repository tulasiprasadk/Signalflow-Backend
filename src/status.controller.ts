import { Controller, Get } from '@nestjs/common';

@Controller('status')
export class StatusController {
  @Get()
  getStatus() {
    return { status: 'Backend is running!' };
  }
}

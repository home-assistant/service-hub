import { ServiceError } from '@lib/common';
import { Body, Controller, Get } from '@nestjs/common';
import { ApnService } from './apn.service';

@Controller()
export class ApnController {
  constructor(private readonly apnService: ApnService) {}

  @Get('/v1/push')
  async handler(@Body() payload: Record<string, any>): Promise<void> {
    try {
      return this.apnService.sendNotification(payload, payload.recipients || payload.recipient);
    } catch (err) {
      throw new ServiceError(err?.message, { cause: err, data: { payload } });
    }
  }
}

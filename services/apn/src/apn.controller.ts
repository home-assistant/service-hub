import { ServiceError } from '@lib/common';
import { Body, Controller, Get } from '@nestjs/common';
import { RateLimit } from './apn.model';
import { ApnService } from './apn.service';

@Controller()
export class ApnController {
  constructor(private readonly apnService: ApnService) {}

  @Get('/rate_limit')
  async rateLimitHandler(@Body() payload: Record<string, any>): Promise<RateLimit> {
    return this.apnService.getRatelimit(payload.deviceId);
  }

  @Get('/push')
  async pushHandler(@Body() payload: Record<string, any>): Promise<void> {
    try {
      return this.apnService.sendNotification(payload, payload.deviceId);
    } catch (err) {
      throw new ServiceError(err?.message, { cause: err, data: { payload } });
    }
  }
}

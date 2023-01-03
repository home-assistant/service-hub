import { Body, Controller, Post, Headers, HttpException } from '@nestjs/common';
import { ClaSignService, ServiceRequestError } from './cla-sign.service';

@Controller('/cla-sign')
export class ClaSignController {
  constructor(private readonly claSignService: ClaSignService) {}

  @Post()
  async webhook(
    @Headers() headers: Record<string, any>,
    @Body() payload: Record<string, any>,
  ): Promise<void> {
    try {
      await this.claSignService.handleClaSignature(headers, payload);
    } catch (e) {
      if (e instanceof ServiceRequestError) {
        throw new HttpException(e.message, 400);
      }
      throw e;
    }
  }
}

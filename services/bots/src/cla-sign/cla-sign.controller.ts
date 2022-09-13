import { Body, Controller, Post, Headers } from '@nestjs/common';
import { ClaSignService } from './cla-sign.service';

@Controller('/cla-sign')
export class ClaSignController {
  constructor(private readonly claSignService: ClaSignService) {}

  @Post()
  async webhook(
    @Headers() headers: Record<string, any>,
    @Body() payload: Record<string, any>,
  ): Promise<void> {
    await this.claSignService.handleClaSignature(headers, payload);
  }
}

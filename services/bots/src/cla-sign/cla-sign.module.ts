import { Module } from '@nestjs/common';
import { ClaSignService } from './cla-sign.service';

import { ClaSignController } from './cla-sign.controller';

@Module({
  providers: [ClaSignService],
  imports: [],
  controllers: [ClaSignController],
})
export class ClaSignModule {}

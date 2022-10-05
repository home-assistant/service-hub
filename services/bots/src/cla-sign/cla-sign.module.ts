import { DynamicModule, Module } from '@nestjs/common';
import { ClaSignService } from './cla-sign.service';
import { ClaSignController } from './cla-sign.controller';
import Config from '../config';

const config = Config.getProperties();

@Module({})
export class ClaSignModule {
  static register(): DynamicModule {
    return {
      module: ClaSignModule,
      providers:
        config.dynamodb.cla.signersTable && config.dynamodb.cla.pendingSignersTable
          ? [ClaSignService]
          : undefined,
      controllers:
        config.dynamodb.cla.signersTable && config.dynamodb.cla.pendingSignersTable
          ? [ClaSignController]
          : undefined,
    };
  }
}

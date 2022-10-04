import 'source-map-support/register';

import { SentryInterceptor } from '@lib/sentry';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';

import { ApnModule } from './apn.module';

async function bootstrap() {
  const app = await NestFactory.create(ApnModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.useGlobalInterceptors(new SentryInterceptor());

  await app.listen(5000);
}
bootstrap();

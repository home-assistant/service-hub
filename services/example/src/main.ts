import 'source-map-support/register';

import { SentryInterceptor } from '@lib/sentry';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';

import { ExampleModule } from './example.module';

async function bootstrap() {
  const app = await NestFactory.create(ExampleModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.useGlobalInterceptors(new SentryInterceptor());

  await app.listen(5000);
}
bootstrap();

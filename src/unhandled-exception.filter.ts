import { type ArgumentsHost, Catch, HttpException } from "@nestjs/common";
import { BaseExceptionFilter } from "@nestjs/core";
import { log } from "./log.js";

/**
 * HttpExceptions are deliberate responses (webhook/CLA contracts) and pass
 * through untouched; anything else is a bug — mirror it to console + Sentry
 * before the default 500.
 */
@Catch()
export class UnhandledExceptionFilter extends BaseExceptionFilter {
  override catch(exception: unknown, host: ArgumentsHost): void {
    if (!(exception instanceof HttpException)) {
      log.exception(exception);
    }
    super.catch(exception, host);
  }
}

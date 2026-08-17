import * as Sentry from "@sentry/nestjs";

type Attributes = Record<string, unknown>;

/**
 * The console mirror keeps logs visible without Sentry (local dev, docker
 * logs); an object rather than free functions so tests can spyOn.
 */
export const log = {
  info(message: string, attributes?: Attributes): void {
    if (attributes) console.log(message, attributes);
    else console.log(message);
    Sentry.logger.info(message, attributes);
  },

  warn(message: string, attributes?: Attributes): void {
    if (attributes) console.warn(message, attributes);
    else console.warn(message);
    Sentry.logger.warn(message, attributes);
  },

  error(message: string, attributes?: Attributes): void {
    if (attributes) console.error(message, attributes);
    else console.error(message);
    Sentry.logger.error(message, attributes);
  },

  exception(err: unknown, attributes?: Attributes): void {
    if (attributes) console.error(err, attributes);
    else console.error(err);
    // handled: false — every caller is a last-resort catch (exception filter,
    // gateway .catch); these are unhandled failures, not expected captures.
    Sentry.captureException(err, {
      mechanism: { handled: false },
      ...(attributes ? { captureContext: { extra: attributes } } : {}),
    });
  },
};

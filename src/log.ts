import * as Sentry from "@sentry/node";

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
    Sentry.captureException(err, attributes ? { extra: attributes } : undefined);
  },
};

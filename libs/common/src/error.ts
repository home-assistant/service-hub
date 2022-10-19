export type ServiceErrorOptions = {
  data?: Record<string, any>;
  cause?: Error;
  service?: string;
};
/**
 * An error object we can attach more context to.
 */
export class ServiceError extends Error {
  public cause: Error | undefined;
  public data?: Record<string, any>;
  public service?: string;

  constructor(message: string, options: ServiceErrorOptions) {
    super(message);
    if (options.cause) {
      this.cause = options.cause;
      delete options.cause;
    }
    if (options.service) {
      this.service = options.service;
      delete options.service;
    }
    if (options.data) {
      this.data = options.data;
    }
  }
}

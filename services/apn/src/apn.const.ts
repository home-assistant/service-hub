import { RateLimit } from './apn.model';

export const defaultRatelimitValues = (): RateLimit => ({
  successful: 0,
  errors: 0,
  maximum: 5000,
  remaining: 5000,
});

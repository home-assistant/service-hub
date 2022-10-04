export interface RateLimit {
  successful: number;
  errors: number;
  maximum: number;
  remaining: number;
}

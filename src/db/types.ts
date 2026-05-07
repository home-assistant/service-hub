export interface Database {
  query<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T[]>;
  execute(sql: string, ...params: unknown[]): Promise<{ changes: number }>;
  queryOne<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T | null>;
}

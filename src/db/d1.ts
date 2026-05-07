import type { Database } from "./types.js";

export class D1Adapter implements Database {
  constructor(private d1: D1Database) {}

  async query<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T[]> {
    const result = await this.d1
      .prepare(sql)
      .bind(...params)
      .all<T>();
    return result.results;
  }

  async execute(sql: string, ...params: unknown[]): Promise<{ changes: number }> {
    const result = await this.d1
      .prepare(sql)
      .bind(...params)
      .run();
    return { changes: result.meta.changes };
  }

  async queryOne<T = Record<string, unknown>>(
    sql: string,
    ...params: unknown[]
  ): Promise<T | null> {
    return await this.d1
      .prepare(sql)
      .bind(...params)
      .first<T>();
  }
}

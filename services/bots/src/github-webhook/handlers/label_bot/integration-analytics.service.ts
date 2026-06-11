import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ParsedPath } from '../../utils/parse_path';

const ANALYTICS_URL = 'https://analytics.home-assistant.io/current_data.json';
const INTEGRATION_DETAILS_URL = 'https://www.home-assistant.io/integrations.json';
// Only these integration_type values are ranked, mirroring the public analytics
// integrations page (see sortIntegrations in analytics.home-assistant.io
// site/.eleventy.js). system/entity/hardware/virtual/brand types are excluded.
const RANKED_INTEGRATION_TYPES = new Set(['integration', 'hub', 'device', 'helper', 'service']);
const TOP_COUNTS = [50, 100, 200];
const FETCH_TIMEOUT_MS = 10000;

@Injectable()
export class IntegrationAnalyticsService implements OnModuleInit {
  private readonly logger = new Logger(IntegrationAnalyticsService.name);
  private rankedIntegrations: string[] = [];

  async onModuleInit() {
    await this.updateAnalytics();
  }

  @Cron(CronExpression.EVERY_12_HOURS)
  async updateAnalytics() {
    const [analytics, details] = await Promise.all([
      this.fetchJson<{ integrations: Record<string, number> }>(ANALYTICS_URL),
      this.fetchJson<Record<string, { integration_type?: string }>>(INTEGRATION_DETAILS_URL),
    ]);

    // Keep the previous ranking if either source is unavailable, rather than
    // ranking on incomplete data.
    if (!analytics || !details) {
      return;
    }

    const integrations = analytics.integrations;
    if (!integrations || typeof integrations !== 'object') {
      this.logger.error('Unexpected analytics response: missing integrations data');
      return;
    }

    const maxCount = Math.max(...TOP_COUNTS);

    // Mirror the public analytics integrations page: rank the documented
    // integrations of a ranked type by install count, so the Top N labels match
    // where an integration appears there. Ranking the raw analytics map instead
    // counts system/entity/hardware/... domains and pushes real integrations down.
    const ranked = Object.keys(details)
      .filter((domain) => RANKED_INTEGRATION_TYPES.has(details[domain]?.integration_type ?? ''))
      .map((domain) => ({ domain, installations: integrations[domain] || 0 }))
      .sort((a, b) => b.installations - a.installations)
      .slice(0, maxCount)
      .map((entry) => entry.domain);

    // Don't overwrite a good ranking with an empty result from an unexpected
    // (but successfully fetched) response shape.
    if (!ranked.length) {
      this.logger.error('Computed an empty integration ranking; keeping the previous one');
      return;
    }

    this.rankedIntegrations = ranked;
    this.logger.log(`Updated integration analytics (${this.rankedIntegrations.length} entries)`);
  }

  private async fetchJson<T>(url: string): Promise<T | null> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        this.logger.error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
        return null;
      }
      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        this.logger.error(`Failed to fetch ${url}: request timed out after ${FETCH_TIMEOUT_MS}ms`);
      } else {
        this.logger.error(
          `Failed to fetch ${url}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  getTopLabels(parsed: ParsedPath[]): string[] {
    let bestRank = Infinity;

    for (const file of parsed) {
      if (!file.component) continue;
      const rank = this.rankedIntegrations.indexOf(file.component);
      if (rank !== -1 && rank < bestRank) {
        bestRank = rank;
      }
    }

    return TOP_COUNTS.filter((count) => bestRank < count).map((count) => `Top ${count}`);
  }
}

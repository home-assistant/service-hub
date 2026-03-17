import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ParsedPath } from '../../utils/parse_path';

const ANALYTICS_URL = 'https://analytics.home-assistant.io/current_data.json';
const TOP_COUNTS = [200];

@Injectable()
export class IntegrationAnalyticsService implements OnModuleInit {
  private readonly logger = new Logger(IntegrationAnalyticsService.name);
  private rankedIntegrations: string[] = [];

  async onModuleInit() {
    await this.updateAnalytics();
  }

  @Cron(CronExpression.EVERY_12_HOURS)
  async updateAnalytics() {
    try {
      const response = await fetch(ANALYTICS_URL);
      if (!response.ok) {
        this.logger.error(
          `Failed to fetch integration analytics: ${response.status} ${response.statusText}`,
        );
        return;
      }
      const data = await response.json();
      const integrations: Record<string, number> = data.integrations;
      if (!integrations || typeof integrations !== 'object') {
        this.logger.error('Unexpected analytics response: missing integrations data');
        return;
      }
      const maxCount = Math.max(...TOP_COUNTS);

      this.rankedIntegrations = Object.entries(integrations)
        .sort(([, a], [, b]) => b - a)
        .slice(0, maxCount)
        .map(([name]) => name);

      this.logger.log(`Updated integration analytics (${this.rankedIntegrations.length} entries)`);
    } catch (error) {
      this.logger.error(
        'Failed to fetch integration analytics',
        error instanceof Error ? error.stack : String(error),
      );
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

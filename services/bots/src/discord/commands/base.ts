import { TransformPipe } from '@discord-nestjs/common';
import {
  DiscordTransformedCommand,
  TransformedCommandExecutionContext,
  UsePipes,
} from '@discord-nestjs/core';
import { ServiceError } from '@lib/common';
import { InteractionReplyOptions, MessagePayload } from 'discord.js';

@UsePipes(TransformPipe)
export class BaseDiscordCommand<DTOType> implements DiscordTransformedCommand<DTOType> {
  public async handler(
    dto: DTOType,
    executionContext: TransformedCommandExecutionContext,
  ): Promise<string | MessagePayload | InteractionReplyOptions | void> {
    try {
      return await this.handleCommand(dto, executionContext);
    } catch (err) {
      throw new ServiceError(err?.message, { cause: err, data: { dto, executionContext } });
    }
  }

  async handleCommand(
    dto: DTOType,
    executionContext: TransformedCommandExecutionContext,
  ): Promise<string | MessagePayload | InteractionReplyOptions | void> {}
}

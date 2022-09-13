import { TransformPipe } from '@discord-nestjs/common';
import {
  DiscordTransformedCommand,
  TransformedCommandExecutionContext,
  UsePipes,
} from '@discord-nestjs/core';
import { ServiceError } from '@lib/common';
import { InteractionReplyOptions, MessagePayload } from 'discord.js';

type HandlerOutputs = string | MessagePayload | InteractionReplyOptions | void;

@UsePipes(TransformPipe)
export class BaseDiscordCommand<DTOType> implements DiscordTransformedCommand<DTOType> {
  public handler(
    dto: DTOType,
    executionContext: TransformedCommandExecutionContext,
  ): Promise<HandlerOutputs> | HandlerOutputs {
    try {
      return this.handleCommand(dto, executionContext);
    } catch (err) {
      throw new ServiceError(err?.message, { cause: err, data: { dto, executionContext } });
    }
  }

  handleCommand(
    dto: DTOType,
    executionContext: TransformedCommandExecutionContext,
  ): Promise<HandlerOutputs> | HandlerOutputs {}
}

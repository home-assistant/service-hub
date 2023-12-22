import { ChatInputCommandOptions, COMMAND_DECORATOR } from '@discord-nestjs/core';
import { HANDLER_DECORATOR } from '@discord-nestjs/core/dist/decorators/command/handler/handler.constant';

import {
  ApplicationCommandType,
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  Events,
  InteractionType,
  Message,
  PermissionFlagsBits,
} from 'discord.js';
import { reportException } from '../../../../libs/sentry/src/reporting';

interface CommandHandlerDecoratorOptions {
  allowChannels?: string[];
}

const getInteraction = (params: any[]): ChatInputCommandInteraction | undefined => {
  // There are several ways the interaction object are attached, this loops over them all untill it's found
  for (const param of params) {
    if (param instanceof ChatInputCommandInteraction) {
      return param;
    }
    if (param instanceof Array) {
      const _check = getInteraction(param);
      if (_check) {
        return _check;
      }
    }
  }
};

export function DiscordCommandClass(options: ChatInputCommandOptions): ClassDecorator {
  return <TFunction extends Function>(target: TFunction): TFunction | void => {
    if (!options.type) {
      options.type = ApplicationCommandType.ChatInput;
    }
    if (options.type === ApplicationCommandType.ChatInput && !options.include) {
      options.include = [];
    }
    Reflect.defineMetadata(
      COMMAND_DECORATOR,
      {
        defaultMemberPermissions: [PermissionFlagsBits.UseApplicationCommands], // Sets default permissions on all commends
        ...options,
      },
      target.prototype,
    );

    return target;
  };
}

export const CommandHandler = (options?: CommandHandlerDecoratorOptions): MethodDecorator => {
  return (
    target: Record<string, any>,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ): PropertyDescriptor => {
    const originalMethod = descriptor.value;
    Reflect.defineMetadata(HANDLER_DECORATOR, {}, target, propertyKey);
    descriptor.value = async function (...params: any[]) {
      const interaction = getInteraction(params);
      if (!interaction) {
        // This should only happen on dev, so we log it out
        console.error('Missing interaction, check the method arguments on the command class');
        return;
      }

      if (
        options?.allowChannels?.length &&
        !options.allowChannels.includes(interaction.channel.id)
      ) {
        return;
      }

      try {
        await originalMethod.apply(this, params);
        if (!interaction.replied) {
          await interaction.reply({ content: 'Command completed', ephemeral: true });
        }
      } catch (err: any) {
        if (
          [
            10062, // Unknown interaction
            40060, // Interaction has already been acknowledged.
          ].includes(err.code)
        ) {
          // Ignore these codes as they are expected during upgrades
          return;
        }

        reportException(err, {
          cause: err,
          user: {
            id: interaction.user.id,
            username: interaction.user.tag,
          },
          tags: { command: interaction.commandName, bot: 'discord' },
          data: {
            options,
            interaction: interaction.toJSON(),
            channel: interaction.channel.toJSON(),
            command: interaction.command.toJSON(),
          },
        });
        if (!interaction.replied) {
          await interaction.reply({ content: err?.message || 'Unknown error', ephemeral: true });
        }
      }
    };
    return descriptor;
  };
};

export const OnDiscordEvent = (options: {
  event: Events;
  commandName?: string;
  interactionType?: InteractionType;
}): MethodDecorator => {
  return (
    target: Record<string, any>,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ): PropertyDescriptor => {
    const originalMethod = descriptor.value;
    Reflect.defineMetadata('__on_decorator__', { event: options.event }, target, propertyKey);

    descriptor.value = async function (...params: any[]) {
      const eventObject: Message | AutocompleteInteraction = params[0];
      if (
        (options.commandName &&
          options.commandName !== (eventObject as AutocompleteInteraction).commandName) ||
        (options.interactionType &&
          options.interactionType !== (eventObject as AutocompleteInteraction).type)
      ) {
        return;
      }
      try {
        await originalMethod.apply(this, params);
      } catch (err: any) {
        if (
          [
            10062, // Unknown interaction
            40060, // Interaction has already been acknowledged.
          ].includes(err.code)
        ) {
          // Ignore these codes as they are expected during upgrades
          return;
        }

        reportException(err, {
          cause: err,
          user: {
            id: ((eventObject as Message).author || (eventObject as AutocompleteInteraction).user)
              .id,
            username: (
              (eventObject as Message).author || (eventObject as AutocompleteInteraction).user
            ).tag,
          },
          tags: { bot: 'discord' },
          data: {
            options,
            eventObject: eventObject.toJSON(),
            channel: eventObject.channel.toJSON(),
          },
        });
      }
    };
    return descriptor;
  };
};

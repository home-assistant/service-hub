import {
  CommandOptions,
  COMMAND_DECORATOR,
  TransformedCommandExecutionContext,
} from '@discord-nestjs/core';

import { reportException } from '@lib/sentry/reporting';
import {
  AutocompleteInteraction,
  Events,
  InteractionType,
  Message,
  PermissionFlagsBits,
} from 'discord.js';

interface CommandHandlerDecoratorOptions {
  allowChannels?: string[];
}

export function DiscordCommandClass(options: CommandOptions): ClassDecorator {
  return <TFunction extends Function>(target: TFunction): TFunction | void => {
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
    descriptor.value = async function (...params: any[]) {
      const { interaction }: TransformedCommandExecutionContext = params[params.length - 1];

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

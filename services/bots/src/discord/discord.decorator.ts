import { CommandOptions, COMMAND_DECORATOR } from '@discord-nestjs/core';
import { reportException } from '@lib/sentry/reporting';
import { PermissionFlagsBits, ChatInputCommandInteraction } from 'discord.js';

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
      const interaction: ChatInputCommandInteraction = params[params.length - 1];

      if (options?.allowChannels && !options.allowChannels.includes(interaction.channel.id)) {
        return;
      }

      try {
        await originalMethod.apply(this, params);
        if (!interaction.replied) {
          await interaction.reply({ content: 'Command completed' });
        }
      } catch (err) {
        reportException(err, {
          cause: err,
          data: {
            options,
            interaction: interaction.toJSON(),
            user: interaction.user.toJSON(),
            channel: interaction.channel.toJSON(),
            command: interaction.command.toJSON(),
          },
        });
        if (!interaction.replied) {
          await interaction.reply({ content: err?.message || 'Unknown error, check Sentry' });
        }
      }
    };
    return descriptor;
  };
};

import { CommandOptions, COMMAND_DECORATOR } from '@discord-nestjs/core';
import { reportException } from '@lib/sentry/reporting';
import { PermissionFlagsBits, ChatInputCommandInteraction } from 'discord.js';

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

export const CommandHandler = (): MethodDecorator => {
  return (
    target: Record<string, any>,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ): PropertyDescriptor => {
    const originalMethod = descriptor.value;
    descriptor.value = async function (...params: any[]) {
      const interaction: ChatInputCommandInteraction | undefined = params[0];
      try {
        return await originalMethod.apply(this, params);
      } catch (err) {
        reportException(err, {
          cause: err,
          data: interaction
            ? {
                interaction: interaction.toJSON(),
                user: interaction.user.toJSON(),
                channel: interaction.channel.toJSON(),
                command: interaction.command.toJSON(),
              }
            : undefined,
        });
      }
    };
    return descriptor;
  };
};

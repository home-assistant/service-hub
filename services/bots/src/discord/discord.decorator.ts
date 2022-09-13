import { CommandOptions, COMMAND_DECORATOR } from '@discord-nestjs/core';
import { PermissionFlagsBits } from 'discord.js';

export function DiscordCommand(options: CommandOptions): ClassDecorator {
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

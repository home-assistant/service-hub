import { TransformPipe } from '@discord-nestjs/common';
import {
  DiscordTransformedCommand,
  Payload,
  TransformedCommandExecutionContext,
  UsePipes,
} from '@discord-nestjs/core';
import { getVersionInfo } from '@lib/common';
import { OptionalUserMentionDto } from '../../discord.const';
import { CommandHandler, DiscordCommandClass } from '../../discord.decorator';

const version = getVersionInfo(__dirname);

@DiscordCommandClass({
  name: 'info',
  description: 'Returns bot information',
})
@UsePipes(TransformPipe)
export class CommandCommonInfo implements DiscordTransformedCommand<any> {
  @CommandHandler()
  async handler(
    @Payload() handlerDto: OptionalUserMentionDto,
    { interaction }: TransformedCommandExecutionContext,
  ): Promise<void> {
    await interaction.reply({
      embeds: [
        {
          fields: [
            { name: 'Version', value: version.version, inline: true },
            {
              name: 'Source',
              value: '[Source Repository](https://github.com/home-assistant/service-hub)',
              inline: true,
            },
            {
              name: 'Messages',
              value:
                '[Data for the /message command](https://github.com/home-assistant/service-hub/tree/main/data/discord/messages)',
              inline: true,
            },
          ],
        },
      ],
    });
  }
}

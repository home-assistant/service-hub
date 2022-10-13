import { TransformPipe } from '@discord-nestjs/common';
import {
  DiscordTransformedCommand,
  Payload,
  TransformedCommandExecutionContext,
  Param,
  UsePipes,
  On,
} from '@discord-nestjs/core';
import { CommandHandler, DiscordCommandClass } from '../../discord.decorator';
import { AutocompleteInteraction, EmbedBuilder } from 'discord.js';
import { reportException } from '@lib/sentry/reporting';
import { ServiceEsphomeComponentData } from '../../services/esphome/component-data';

class ComponentsDto {
  @Param({
    name: 'component',
    description: 'What is the name of the component?',
    required: true,
    autocomplete: true,
  })
  component: string;
}

@DiscordCommandClass({
  name: 'component',
  description: 'Returns information about an component',
})
@UsePipes(TransformPipe)
export class CommandEsphomeComponent implements DiscordTransformedCommand<ComponentsDto> {
  constructor(private serviceEsphomeComponentData: ServiceEsphomeComponentData) {}

  @CommandHandler()
  async handler(
    @Payload() handlerDto: ComponentsDto,
    context: TransformedCommandExecutionContext,
  ): Promise<void> {
    const { component } = handlerDto;
    const { interaction } = context;
    const channel = interaction.channel.id;

    if (component === 'reload') {
      await this.serviceEsphomeComponentData.ensureData(channel, true);

      await interaction.reply({
        content: 'Component list reloaded',
        ephemeral: true,
      });
      return;
    }

    const componentData = await this.serviceEsphomeComponentData.getComponent(channel, component);

    if (!componentData) {
      await interaction.reply({
        content: 'Could not find information',
        ephemeral: true,
      });
      return;
    }
    await interaction.reply({
      embeds: [
        new EmbedBuilder({
          title: componentData.title,
          fields: [
            {
              name: 'Documentation',
              value: `[View the documentation](${componentData.url})`,
              inline: true,
            },
            {
              name: 'Source',
              value: `[View the source on GitHub](https://github.com/esphome/esphome/tree/dev/esphome/${component})`,
              inline: true,
            },
          ],
        }),
      ],
    });
  }

  // This is the autocomplete handler for the /component command
  @On('interactionCreate')
  async onInteractionCreate(interaction: AutocompleteInteraction): Promise<void> {
    if (!interaction.isAutocomplete() || interaction.commandName !== 'component') {
      return;
    }
    const channel = interaction.channel.id;

    try {
      await this.serviceEsphomeComponentData.ensureData(channel);
      const focusedValue = interaction.options.getFocused()?.toLowerCase();

      if (interaction.responded) {
        // this happens up upgrades when 2 bots run at the same time
        return;
      }

      await interaction.respond(
        focusedValue.length !== 0
          ? Object.entries(this.serviceEsphomeComponentData.data[channel])
              .map(([component, data]) => ({
                name: data.title,
                value: component,
              }))
              .filter(
                (choice) =>
                  choice.value.toLowerCase().includes(focusedValue) ||
                  choice.name.toLowerCase().includes(focusedValue),
              )
              // The API only allow max 25 sugestions
              .slice(0, 25)
          : [],
      );
    } catch (err) {
      reportException(err, {
        cause: err,
        data: {
          interaction: interaction.toJSON(),
          user: interaction.user.toJSON(),
          channel: interaction.channel.toJSON(),
          command: interaction.command.toJSON(),
        },
      });
      await interaction.respond([]);
    }
  }
}

import fetch from 'node-fetch';

import { TransformPipe } from '@discord-nestjs/common';
import {
  DiscordTransformedCommand,
  Payload,
  TransformedCommandExecutionContext,
  Param,
  UsePipes,
  On,
} from '@discord-nestjs/core';
import { CommandHandler, DiscordCommandClass } from '../discord.decorator';
import { AutocompleteInteraction, EmbedBuilder } from 'discord.js';
import { reportException } from '@lib/sentry/reporting';

interface Redirect {
  redirect: string;
  deprecated?: boolean;
  custom?: boolean;
  name: string;
  badge?: string;
  description: string;
  introduced?: string;
  component?: string;
  params?: any;
}

class MyDto {
  @Param({
    name: 'redirect',
    description: 'What is the name of the redirect?',
    required: true,
    autocomplete: true,
  })
  redirect: string;
}

@DiscordCommandClass({
  name: 'my',
  description: 'Returns a my link',
})
@UsePipes(TransformPipe)
export class MyCommand implements DiscordTransformedCommand<MyDto> {
  private redirects: Redirect[];

  async ensureRedirects(force?: boolean): Promise<void> {
    if (force || !this.redirects?.length) {
      this.redirects = await (
        await fetch(
          'https://raw.githubusercontent.com/home-assistant/my.home-assistant.io/main/redirect.json',
        )
      ).json();
    }
  }
  @CommandHandler()
  async handler(
    @Payload() handlerDto: MyDto,
    context: TransformedCommandExecutionContext,
  ): Promise<void> {
    const { redirect } = handlerDto;
    const { interaction } = context;
    if (redirect === 'reload') {
      await this.ensureRedirects(true);

      await interaction.reply({
        content: 'My redirect list reloaded',
        ephemeral: true,
      });
      return;
    }

    await this.ensureRedirects();

    const redirectData = this.redirects.find((entry) => entry.redirect === redirect);

    if (!redirectData) {
      await interaction.reply({
        content: 'Could not find information',
        ephemeral: true,
      });
      return;
    }

    await interaction.reply({
      embeds: [
        new EmbedBuilder({
          title: redirectData.name,
          description: redirectData.description,
          url: redirectData.params
            ? `https://my.home-assistant.io/create-link/?redirect=${redirectData.redirect}`
            : `https://my.home-assistant.io/redirect/${redirectData.redirect}/`,
          footer: redirectData.params
            ? { text: 'This My link needs adjustments before usage' }
            : undefined,
        }),
      ],
    });
  }

  // This is the autocomplete handler for the /my command
  @On('interactionCreate')
  async onInteractionCreate(interaction: AutocompleteInteraction): Promise<void> {
    if (!interaction.isAutocomplete() || interaction.commandName !== 'my') {
      return;
    }
    try {
      await this.ensureRedirects();
      const focusedValue = interaction.options.getFocused()?.toLowerCase();

      await interaction.respond(
        focusedValue.length !== 0
          ? this.redirects
              .filter((redirect) => !redirect.deprecated)
              .map((redirect) => ({
                name: redirect.name,
                value: redirect.redirect,
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

import { Param } from '@discord-nestjs/core';

export class BlankDto {}

export class OptionalUserMentionDto {
  @Param({
    name: 'user',
    description: 'Tag the user you want the message to be posted for',
    required: false,
  })
  userMention: string;
}

export enum Emoji {
  FIRST_PLACE = ':first_place:',
  SECOND_PLACE = ':second_place:',
  HOUSE = ':house:',
  TROPHY = ':trophy:',
}

export enum DiscordGuild {
  HOME_ASSISTANT = '330944238910963714',
  TEST_SERVER = '566594464689160192',
}

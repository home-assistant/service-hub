import { Transform } from 'class-transformer';
import { Param, ParamType } from '@discord-nestjs/core';

export class BlankDto {}

export class OptionalUserMentionDto {
  @Transform(({ value }) => (value ? `<@${value}>` : undefined))
  @Param({
    name: 'user',
    description: 'Tag the user you want the message to be posted for',
    required: false,
    type: ParamType.MENTIONABLE,
  })
  userMention: string | undefined;
}

export enum Emoji {
  FIRST_PLACE = ':first_place:',
  SECOND_PLACE = ':second_place:',
  HOUSE = ':house:',
  TROPHY = ':trophy:',
}

export enum DiscordGuild {
  HOME_ASSISTANT = '330944238910963714',
  ESPHOME = '429907082951524364',
}

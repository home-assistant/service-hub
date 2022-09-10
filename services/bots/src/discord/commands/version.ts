import { TransformPipe } from '@discord-nestjs/common';
import { Command, DiscordTransformedCommand, UsePipes } from '@discord-nestjs/core';

import { getVersionInfo } from '@lib/common';

const version = getVersionInfo(__dirname);

@Command({
  name: 'version',
  description: 'Returns version information',
})
@UsePipes(TransformPipe)
export class VersionCommand implements DiscordTransformedCommand<any> {
  handler(): string {
    return version.version;
  }
}

import { Module } from "@nestjs/common";
import { AppConfigModule } from "../config.module.js";
import { DiscordGatewayService } from "./gateway.service.js";

@Module({
  imports: [AppConfigModule],
  providers: [DiscordGatewayService],
})
export class DiscordModule {}

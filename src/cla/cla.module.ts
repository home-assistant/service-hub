import { Module } from "@nestjs/common";
import { AppConfigModule } from "../config.module.js";
import { GithubModule } from "../github/github.module.js";
import { ClaController } from "./cla.controller.js";
import { ClaService } from "./cla.service.js";
import { claStoreProvider } from "./store.provider.js";

@Module({
  imports: [AppConfigModule, GithubModule],
  controllers: [ClaController],
  providers: [claStoreProvider, ClaService],
})
export class ClaModule {}

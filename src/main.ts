import "./instrument.js";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module.js";
import { loadEnv } from "./env.js";
import { log } from "./log.js";

const env = loadEnv();

// rawBody: the webhook guard verifies the HMAC against the raw bytes.
// Default parsers are replaced: body-parser's 100 kB default can reject a
// GitHub delivery (a 65k-char markdown body is ~256 kB in UTF-8) before the
// signature check ever runs.
const app = await NestFactory.create<NestExpressApplication>(AppModule, {
  rawBody: true,
  bodyParser: false,
});
app.useBodyParser("json", { limit: "1mb" });
app.useBodyParser("urlencoded", { extended: true, limit: "1mb" });
app.enableShutdownHooks();
await app.listen(env.PORT);

log.info(`bot finished setup`);

import { Body, Controller, HttpCode, Post, Req } from "@nestjs/common";
import type { Request } from "express";
// biome-ignore lint/style/useImportType: DI paramtype — `import type` gets erased
import { ClaService } from "./cla.service.js";

@Controller("cla-sign")
export class ClaController {
  constructor(private readonly claService: ClaService) {}

  @Post()
  @HttpCode(200)
  sign(@Body() body: unknown, @Req() request: Request): Promise<{ message: string }> {
    const forwardedFor = request.headers["x-forwarded-for"];
    return this.claService.sign(
      body,
      Array.isArray(forwardedFor) ? forwardedFor.join(", ") : (forwardedFor ?? ""),
      request.headers["user-agent"] ?? "",
    );
  }

  @Post("authorize")
  @HttpCode(200)
  authorize(@Body() body: unknown): Promise<Record<string, unknown>> {
    return this.claService.authorize(body);
  }
}

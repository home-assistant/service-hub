import { log } from "../../../../log.js";
import type { EventType } from "../../../engine/event.js";
import {
  type CodeOwnersEntry,
  matchCodeOwners,
  parseCodeOwners,
} from "../../../engine/model/codeowners.js";
import { getEntityPlatforms } from "../../../engine/model/component-registry.js";
import type { ListPullRequestFiles } from "../../../engine/model/pull-request.js";
import type { RuleContext } from "../../../engine/model/rule-context.js";

/** An integration is "core" iff the core team is one of its code owners. */
const CORE_CODEOWNER = "@home-assistant/core";

const FILE_TYPES = [
  "core",
  "auth",
  "auth_providers",
  "generated",
  "scripts",
  "helpers",
  "util",
  "test",
  "services",
  "component",
  "platform",
  "brand",
] as const;

export type FileType = (typeof FILE_TYPES)[number] | null;

const FILE_TYPE_SET: Set<string> = new Set(FILE_TYPES);

function asFileType(value: string): FileType {
  return FILE_TYPE_SET.has(value) ? (value as FileType) : null;
}

export class ParsedPath {
  readonly file: ListPullRequestFiles[0];
  type: FileType = null;
  component: string | null = null;
  platform: string | null = null;
  core = false;

  constructor(
    file: ListPullRequestFiles[0],
    entityPlatforms: Set<string>,
    codeownersEntries: CodeOwnersEntry[],
  ) {
    this.file = file;
    const parts = file.filename.split("/");
    const rootFolder = parts.length > 1 ? parts.shift() : undefined;

    if (!rootFolder || !["tests", "homeassistant"].includes(rootFolder)) {
      return;
    }

    const subfolder = parts.shift();
    if (!subfolder) return;

    if (!["components", "fixtures", "generated"].includes(subfolder)) {
      this.core = true;
      if (subfolder.endsWith(".py")) {
        this.type = "core";
      } else {
        const validated = asFileType(subfolder);
        if (validated === null) {
          log.warn("parse-path: unrecognized top-level subfolder; FileType set to null", {
            subfolder,
            file: file.filename,
          });
        }
        this.type = validated;
      }
      return;
    }

    if (parts.length < 2) return;

    this.component = parts.shift() ?? null;
    if (!this.component) return;
    let filename = parts[0].replace(".py", "");

    if (rootFolder === "tests") {
      this.type = "test";
      filename = filename.replace("test_", "");
      if (entityPlatforms.has(filename)) {
        this.platform = filename;
      }
    } else if (filename === "brand") {
      this.type = "brand";
    } else if (filename === "services.yaml") {
      this.type = "services";
    } else if (entityPlatforms.has(filename)) {
      this.type = "platform";
      this.platform = filename;
    } else {
      this.type = "component";
    }

    // An integration is core iff @home-assistant/core owns it in CODEOWNERS.
    this.core =
      matchCodeOwners(this.file.filename, codeownersEntries)?.owners.includes(CORE_CODEOWNER) ??
      false;
  }

  get additions() {
    return this.file.additions;
  }

  get status() {
    return this.file.status;
  }

  get path() {
    return this.file.filename;
  }

  get filename() {
    return this.path.split("/").pop() ?? this.path;
  }
}

/**
 * Parse a PR's changed files into ParsedPath[], resolving the entity-platform
 * set (fetched from core, cached) and the repo's CODEOWNERS from the rule
 * context. `.core` is derived per file from CODEOWNERS; no CODEOWNERS (null)
 * means integrations classify as non-core.
 */
export async function parseFiles(
  ctx: RuleContext<EventType>,
  files: ListPullRequestFiles,
): Promise<ParsedPath[]> {
  const [entityPlatforms, codeownersContent] = await Promise.all([
    getEntityPlatforms(),
    ctx.codeownersContent(),
  ]);
  const codeownersEntries = parseCodeOwners(codeownersContent ?? "");
  return files.map((file) => new ParsedPath(file, entityPlatforms, codeownersEntries));
}

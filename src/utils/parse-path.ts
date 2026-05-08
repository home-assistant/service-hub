import type { ListPullRequestFiles } from "../github/types.js";
import { coreComponents, entityPlatforms } from "../github/types.js";

export type FileType =
  | "core"
  | "auth"
  | "auth_providers"
  | "generated"
  | "scripts"
  | "helpers"
  | "util"
  | "test"
  | "services"
  | "component"
  | "platform"
  | "brand"
  | null;

export class ParsedPath {
  readonly file: ListPullRequestFiles[0];
  type: FileType = null;
  component: string | null = null;
  platform: string | null = null;
  core = false;

  constructor(file: ListPullRequestFiles[0]) {
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
      this.type = subfolder.endsWith(".py") ? "core" : (subfolder as FileType);
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

    this.core = coreComponents.has(this.component);
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

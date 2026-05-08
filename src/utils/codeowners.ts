interface CodeOwnersEntry {
  pattern: string;
  owners: string[];
  line: number;
}

export function parseCodeOwners(content: string): CodeOwnersEntry[] {
  const entries: CodeOwnersEntry[] = [];

  content.split("\n").forEach((entry, idx) => {
    const [code] = entry.split("#");
    const trimmed = code.trim();
    if (trimmed === "") return;
    const [pattern, ...owners] = trimmed.split(/\s+/);
    entries.push({ pattern, owners, line: idx + 1 });
  });

  return entries.reverse();
}

export function matchCodeOwners(
  path: string,
  entries: CodeOwnersEntry[],
): CodeOwnersEntry | undefined {
  for (const entry of entries) {
    // Simple glob matching — covers the patterns used in HA CODEOWNERS
    const regex = globToRegex(entry.pattern);
    if (regex.test(path)) {
      return entry;
    }
  }
}

function globToRegex(pattern: string): RegExp {
  let regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "{{GLOBSTAR}}")
    .replace(/\*/g, "[^/]*")
    .replace(/{{GLOBSTAR}}/g, ".*")
    .replace(/\?/g, "[^/]");

  if (!regexStr.startsWith("/")) {
    regexStr = `(^|.*/?)${regexStr}`;
  } else {
    regexStr = `^${regexStr.slice(1)}`;
  }

  return new RegExp(`${regexStr}$`);
}

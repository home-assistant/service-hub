export const uniqueEntries = (entries: string[] | Set<string>): string[] => [...new Set(entries)];

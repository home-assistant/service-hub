import type { AutocompleteChoice } from "./types.js";

/** Discord caps autocomplete responses at 25 choices. */
const MAX_CHOICES = 25;

/**
 * Case-insensitive substring match on name or value; empty input returns
 * nothing (mirrors the legacy bot — no suggestions until the user types).
 */
export function filterChoices(
  choices: AutocompleteChoice[],
  focused: string,
): AutocompleteChoice[] {
  const value = focused.toLowerCase();
  if (value.length === 0) return [];
  return choices
    .filter(
      (choice) =>
        choice.name.toLowerCase().includes(value) || choice.value.toLowerCase().includes(value),
    )
    .slice(0, MAX_CHOICES);
}

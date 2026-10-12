/**
 * Chat emotes. Everyone gets a free basic set; each creator can add up to
 * five channel emotes, which (by default) only their subscribers can use.
 * Emotes are typed as :code: and turned into their glyph by the server when
 * the message is saved, so who may use what is enforced there, not in the UI.
 */

export interface EmoteDef {
  code: string; // always stored as ":name:"
  glyph: string;
}

export const BASIC_EMOTES: EmoteDef[] = [
  { code: ":lol:", glyph: "😂" },
  { code: ":wow:", glyph: "😮" },
  { code: ":fire:", glyph: "🔥" },
  { code: ":cry:", glyph: "😢" },
  { code: ":clap:", glyph: "👏" },
  { code: ":heart:", glyph: "❤️" },
  { code: ":popcorn:", glyph: "🍿" },
  { code: ":film:", glyph: "🎬" },
];

export const MAX_CREATOR_EMOTES = 5;

/** "hype", ":hype:" and " :Hype: " all become ":hype:"-style codes (case kept). */
export function normalizeEmoteCode(input: string): string | null {
  const name = input.trim().replace(/^:+|:+$/g, "");
  return /^[A-Za-z0-9_]{2,24}$/.test(name) ? `:${name}:` : null;
}

/** Replaces every allowed :code: in a message with its glyph (case-insensitive). */
export function renderEmotes(text: string, allowed: EmoteDef[]): string {
  if (!allowed.length || !text.includes(":")) return text;
  const byCode = new Map(allowed.map((e) => [e.code.toLowerCase(), e.glyph]));
  return text.replace(/:[A-Za-z0-9_]{2,24}:/g, (match) => byCode.get(match.toLowerCase()) ?? match);
}

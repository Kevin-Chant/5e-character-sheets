// Per-unit weights in POUNDS for the gear the builder hands out, from the SRD
// equipment tables. Carrying capacity is Strength × 15 lb, so lb is the
// storage unit; `weightInUnit` converts for display.
//
// Deliberately partial: flavour items with no meaningful weight are absent
// rather than zeroed. A player can still type a weight on any item by hand.

// Keys are normalized by `normalizeItemName`: lowercased, curly apostrophes
// folded to straight ones, whitespace collapsed.
const WEIGHTS_LB: Record<string, number> = {
  // ---- Simple melee weapons ----
  club: 2,
  dagger: 1,
  greatclub: 10,
  handaxe: 2,
  javelin: 2,
  "light hammer": 2,
  mace: 4,
  quarterstaff: 4,
  sickle: 2,
  spear: 3,

  // ---- Simple ranged weapons ----
  "light crossbow": 5,
  dart: 0.25,
  shortbow: 2,
  sling: 0,

  // ---- Martial melee weapons ----
  battleaxe: 4,
  flail: 2,
  glaive: 6,
  greataxe: 7,
  greatsword: 6,
  halberd: 6,
  lance: 6,
  longsword: 3,
  maul: 10,
  morningstar: 4,
  pike: 18,
  rapier: 2,
  scimitar: 3,
  shortsword: 2,
  trident: 4,
  "war pick": 2,
  warhammer: 2,
  whip: 3,

  // ---- Martial ranged weapons ----
  blowgun: 1,
  "hand crossbow": 3,
  "heavy crossbow": 18,
  longbow: 2,
  net: 3,

  // ---- Ammunition (per piece; a quiver of 20 arrows comes to 1 lb) ----
  arrow: 0.05,
  bolt: 0.075,
  "crossbow bolt": 0.075,
  "sling bullet": 0.075,
  "blowgun needle": 0.02,

  // ---- Armor and shields ----
  "padded armor": 8,
  "leather armor": 10,
  "studded leather armor": 13,
  "hide armor": 12,
  "chain shirt": 20,
  "scale mail": 45,
  breastplate: 20,
  "half plate": 40,
  "ring mail": 40,
  "chain mail": 55,
  "splint armor": 60,
  "plate armor": 65,
  shield: 6,
  "wooden shield": 6,

  // ---- Equipment packs ----
  "burglar's pack": 44.5,
  "diplomat's pack": 39,
  "dungeoneer's pack": 61.5,
  "entertainer's pack": 38,
  "explorer's pack": 59,
  "priest's pack": 24,
  "scholar's pack": 10,

  // ---- Focuses and class kit ----
  spellbook: 3,
  "component pouch": 2,
  "arcane focus": 2,
  "druidic focus": 1,
  "holy symbol": 1,
  quiver: 1,
  "thieves' tools": 1,

  // ---- Common adventuring gear from backgrounds ----
  crowbar: 5,
  shovel: 5,
  "iron pot": 10,
  "hunting trap": 25,
  "disguise kit": 3,
  "herbalism kit": 3,
  "a set of artisan's tools": 5,
  "common clothes": 3,
  "dark common clothes with a hood": 3,
  "fine clothes": 6,
  "traveler's clothes": 4,
  costume: 4,
  vestments: 4,
  "winter blanket": 3,
  "50 feet of silk rope": 5,
  "small knife": 1,
  staff: 4,
  "belaying pin (club)": 2,
  "scroll case of notes from your studies or prayers": 1,
  "prayer book or prayer wheel": 5,
  "a musical instrument": 2,
};

// SRD prose uses curly apostrophes ("burglar’s pack") while hand-authored
// lists use straight ones; labels also arrive in mixed case.
export function normalizeItemName(name: string): string {
  return name.toLowerCase().replace(/[‘’ʼ]/g, "'").replace(/\s+/g, " ").trim();
}

// Splits a trailing count on an equipment line, e.g. "Arrow (20)".
export function splitItemCount(label: string): {
  name: string;
  count: number;
} {
  const match = label.match(/^(.*?)\s*\((\d+)\)\s*$/);
  return match
    ? { name: match[1].trim(), count: Number(match[2]) }
    : { name: label.trim(), count: 1 };
}

// Handles a trailing "(N)" count and a leading article ("a lute" → "lute").
export function weightForItem(label: string): number | undefined {
  const { name } = splitItemCount(label);
  const key = normalizeItemName(name);
  if (key in WEIGHTS_LB) return WEIGHTS_LB[key];
  const withoutArticle = key.replace(/^(?:a|an|the)\s+/, "");
  return WEIGHTS_LB[withoutArticle];
}

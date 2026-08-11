import { normalizeTitle } from "src/lib/mechanics/catalog";
import { ConditionName } from "src/lib/play/conditions";
import { Spell } from "src/lib/types";

// Which condition a spell puts on its targets — an overlay keyed by title,
// looked up at cast time, not a field on `Spell.mechanics` (which is either
// embedded on the character or generator-owned SRD JSON, neither of which this
// hand-authored file can safely extend).
//
// `name` keys the bundled `CONDITION_MECHANICS` catalog (wired riders,
// summary) when an entry exists there; otherwise it's a plain advisory chip
// on the target's row. `rounds` is the duration in rounds, where combat-shaped
// and defined — the encounter ticks it down.

export interface SpellConditionGrant {
  name: ConditionName;
  rounds?: number;
  note?: string;
}

// Kept in sync with CONDITION_MECHANICS by a structural test.
export const SPELL_CONDITIONS: Record<string, SpellConditionGrant> = {
  bless: { name: "Bless", rounds: 10, note: "Concentration, up to 1 minute" },
  guidance: {
    name: "Guidance",
    note: "Concentration; ends after the check it boosts",
  },
  // The SRD's title (no "Tasha's" — that name isn't open content).
  "hideous laughter": {
    name: "Hideous Laughter",
    rounds: 10,
    note: "On a failed save; repeats the save when damaged",
  },

  "absorb elements": {
    name: "Absorb Elements",
    rounds: 1,
    note: "Reaction, triggered by taking acid/cold/fire/lightning/thunder damage; lasts until the start of the bearer's next turn.",
  },
  aid: {
    name: "Aid",
    note: "Duration 8 hours, no concentration; affects up to three targets.",
  },
  "air bubble": {
    name: "Air Bubble",
    note: "Duration 24 hours, no concentration.",
  },
  "alter self": {
    name: "Alter Self",
    note: "Concentration, up to 1 hour; caster picks one option (aquatic adaptation, change appearance, or natural weapons) and can swap it with an action.",
  },
  "animal friendship": {
    name: "Charmed",
    note: "On a failed Wisdom save (beast of Intelligence 3 or lower only); ends early if the caster or a companion harms it. Lasts 24 hours.",
  },
  "animal shapes": {
    name: "Animal Shapes",
    note: "Willing targets only; lasts up to 24 hours or until the target drops to 0 HP, whichever comes first; requires concentration.",
  },
  "antilife shell": {
    name: "Antilife Shell",
    note: "Concentration, up to 1 hour.",
  },
  "antipathy/sympathy": {
    name: "Antipathy/Sympathy",
    note: "Lasts up to 10 days (no concentration); on a failed Wisdom save when a creature of the designated kind sees the target or comes within 60 feet; repeats the save every 24 hours, and a successful save grants 1 minute of immunity.",
  },
  "armor of agathys": {
    name: "Armor of Agathys",
    note: "Lasts 1 hour or until the temporary hit points are gone; not concentration.",
  },
  "arms of hadar": {
    name: "Arms of Hadar",
    rounds: 1,
    note: "On a failed Strength save; lasts until the start of its next turn.",
  },
  "ashardalon's stride": {
    name: "Ashardalon's Stride",
    rounds: 10,
    note: "Concentration, up to 1 minute; no save (self only).",
  },
  "aura of life": {
    name: "Aura of Life",
    rounds: 100,
    note: "While within the caster's moving 30-foot aura; Concentration, up to 10 minutes.",
  },
  "aura of purity": {
    name: "Aura of Purity",
    rounds: 100,
    note: "While within the caster's moving 30-foot aura; Concentration, up to 10 minutes.",
  },
  awaken: {
    name: "Charmed",
    note: "For 30 days, or until the caster/allies do anything harmful to it.",
  },
  bane: {
    name: "Bane",
    rounds: 10,
    note: "On a failed Charisma save; Concentration, up to 1 minute.",
  },
  "banishing smite": {
    name: "Banishing Smite",
    rounds: 10,
    note: "Triggered automatically if the smite's melee hit drops the target to 50 HP or fewer; lasts until the spell ends (Concentration, up to 1 minute).",
  },
  banishment: {
    name: "Incapacitated",
    rounds: 10,
    note: "On a failed Charisma save; Concentration, up to 1 minute; the target is instead sent home if native to another plane.",
  },
  barkskin: { name: "Barkskin", note: "Concentration, up to 1 hour." },
  "beacon of hope": {
    name: "Beacon of Hope",
    rounds: 10,
    note: "Concentration, up to 1 minute; no save (targets are willing).",
  },
  "beast bond": {
    name: "Beast Bond",
    rounds: 100,
    note: "Concentration, up to 10 minutes.",
  },
  "beast sense": {
    name: "Beast Sense",
    note: "Concentration, up to 1 hour (or cast as a ritual without a spell slot); requires touching the beast.",
  },
  "bestow curse": {
    name: "Bestow Curse",
    rounds: 10,
    note: "On a failed Wisdom save; caster picks one of four curse effects at casting.",
  },
  "black tentacles": {
    name: "Restrained",
    rounds: 10,
    note: "On a failed Dexterity save (or automatically re-damaged if already restrained); Concentration, up to 1 minute; can escape with a Strength or Dexterity check.",
  },
  "blade ward": {
    name: "Blade Ward",
    rounds: 1,
    note: "Self only; ends at the end of the caster's next turn",
  },
  "blinding smite": {
    name: "Blinded",
    rounds: 10,
    note: "On the caster's next melee weapon hit before the spell ends, unless the target succeeds on a Constitution save; the target repeats the save at the end of each of its turns.",
  },
  "blindness/deafness": {
    name: "Blindness/Deafness",
    rounds: 10,
    note: "On a failed Constitution save, caster's choice of blinded or deafened; target can retry the save at the end of each of its turns.",
  },
  blink: {
    name: "Blink",
    rounds: 10,
    note: "No save (self only); a d20 roll of 11+ at the end of each turn sends the caster to the Ethereal Plane until the start of its next turn.",
  },
  blur: { name: "Blurred", rounds: 10, note: "Concentration, up to 1 minute." },
  "booming blade": {
    name: "Booming Blade",
    rounds: 1,
    note: "On a hit; ends at the start of the caster's next turn, or early if the target willingly moves",
  },
  "borrowed knowledge": {
    name: "Borrowed Knowledge",
    note: "Duration 1 hour, no concentration; recasting replaces the earlier proficiency.",
  },
  "branding smite": {
    name: "Branded",
    rounds: 10,
    note: "Applies on the caster's next weapon hit before the spell ends (concentration, up to 1 minute); that hit deals an extra 2d6 radiant damage.",
  },
  "calm emotions": {
    name: "Calmed",
    rounds: 10,
    note: "On a failed Charisma save (can choose to fail); concentration, up to 1 minute.",
  },
  catnap: {
    name: "Unconscious",
    rounds: 100,
    note: "No save (up to three willing targets); wakes early if it takes damage or is physically roused. Staying under the full 10 minutes grants the benefit of a short rest.",
  },
  "cause fear": {
    name: "Frightened",
    rounds: 10,
    note: "On a failed Wisdom save; repeats at the end of its turns. Constructs and undead are immune. Concentration, up to 1 minute.",
  },
  ceremony: {
    name: "Ceremony",
    note: "Casting itself is instantaneous; the chosen rite's boon lasts 24 hours.",
  },
  "charm monster": {
    name: "Charmed",
    note: "On a failed Wisdom save (advantage if you or allies are fighting it); duration 1 hour; charm ends early if harmed.",
  },
  "charm person": {
    name: "Charmed",
    note: "On a failed Wisdom save (with advantage if fighting the caster or an ally); ends early if the caster or a companion harms it. Lasts 1 hour.",
  },
  "chill touch": {
    name: "Chill Touch",
    rounds: 1,
    note: "On a hit; ends at the start of the caster's next turn",
  },
  "circle of power": {
    name: "Circle of Power",
    rounds: 100,
    note: "While within the caster's moving 30-foot aura; Concentration, up to 10 minutes.",
  },
  "color spray": {
    name: "Blinded",
    rounds: 1,
    note: "Affects creatures within the rolled 6d10 hit-point pool, lowest current HP first, for 1 round.",
  },
  "compelled duel": {
    name: "Compelled Duel",
    rounds: 10,
    note: "On a failed Wisdom save; Concentration, up to 1 minute.",
  },
  compulsion: {
    name: "Compulsion",
    rounds: 10,
    note: "On a failed Wisdom save; Concentration, up to 1 minute; may retry the save after each forced move.",
  },
  confusion: {
    name: "Confusion",
    rounds: 10,
    note: "On a failed Wisdom save; Concentration, up to 1 minute; may retry the save at the end of each of its turns.",
  },
  "contact other plane": {
    name: "Contact Other Plane",
    note: "On a failed DC 15 Intelligence save made by the caster; lasts until the caster finishes a long rest (removable early by greater restoration).",
  },
  contagion: {
    name: "Contagion",
    note: "Inflicted on a melee spell attack hit; lasts until 3 failed or 3 successful Constitution saves (7 days if it fully takes hold).",
  },
  "crown of madness": {
    name: "Charmed",
    rounds: 10,
    note: "On a failed Wisdom save; concentration, up to 1 minute; the caster spends its action each of the target's turns to force a melee attack (against a target of the caster's choice, or itself if none is reachable); the target retries the save at the end of each of its turns.",
  },
  "crusader's mantle": {
    name: "Crusader's Mantle",
    rounds: 10,
    note: "Concentration, up to 1 minute; no save (affects all friendly creatures, including the caster, inside the 30-foot aura).",
  },
  "dark star": {
    name: "Deafened",
    note: "While fully inside the sphere; the sphere also blocks darkvision, mundane light, and sound; concentration, up to 1 minute.",
  },
  darkvision: {
    name: "Darkvision",
    note: "Duration 8 hours, no concentration.",
  },
  "death ward": {
    name: "Death Ward",
    note: "Lasts up to 8 hours; consumed the first time it would drop to 0 HP or suffer instant death.",
  },
  "disguise self": {
    name: "Disguise Self",
    note: "Lasts 1 hour, or until dismissed as an action; physical inspection or a failed Investigation check against the caster's spell save DC sees through it.",
  },
  "dispel evil and good": {
    name: "Dispel Evil and Good",
    rounds: 10,
    note: "Concentration, up to 1 minute; can be spent early to break an enchantment or attempt to banish a fiend/undead/etc.",
  },
  "divine favor": {
    name: "Divine Favor",
    rounds: 10,
    note: "Concentration, up to 1 minute.",
  },
  "divine word": {
    name: "Divine Word",
    note: "On a failed Charisma save; severity scales with the target's current hit points — deafened 1 minute (50 HP or fewer), also blinded 10 minutes (40 HP or fewer), or also stunned 1 hour (30 HP or fewer); 20 HP or fewer kills it instead",
  },
  "dominate beast": {
    name: "Charmed",
    rounds: 10,
    note: "On a failed Wisdom save (advantage if you or allies are fighting it); Concentration, up to 1 minute; a new save is allowed each time it takes damage.",
  },
  "dominate monster": {
    name: "Charmed",
    note: "On a failed Wisdom save; concentration, up to 1 hour; repeats the save whenever the target takes damage.",
  },
  "dominate person": {
    name: "Charmed",
    rounds: 10,
    note: "On a failed Wisdom save (advantage if you or allies are fighting it); Concentration, up to 1 minute; a new save is allowed each time it takes damage.",
  },
  "draconic transformation": {
    name: "Draconic Transformation",
    rounds: 10,
    note: "Concentration, up to 1 minute",
  },
  "dragon's breath": {
    name: "Dragon's Breath",
    rounds: 10,
    note: "Concentration, up to 1 minute; touched willing creature chooses the breath's damage type (acid, cold, fire, lightning, or poison) on cast.",
  },
  "earth tremor": {
    name: "Prone",
    note: "On a failed Dexterity save when the tremor erupts (single application, no lasting duration).",
  },
  "elemental bane": {
    name: "Elemental Bane",
    rounds: 10,
    note: "On a failed Constitution save; Concentration, up to 1 minute.",
  },
  "elemental weapon": {
    name: "Elemental Weapon",
    note: "Concentration, up to 1 hour; no save (touched weapon becomes magical for the duration).",
  },
  "enemies abound": {
    name: "Enemies Abound",
    rounds: 10,
    note: "On a failed Intelligence save; retries the save when it takes damage.",
  },
  enervation: {
    name: "Enervation",
    rounds: 10,
    note: "On a failed Dexterity save; Concentration, up to 1 minute; ends early if it gains total cover or leaves the caster's range/sight.",
  },
  "enhance ability": {
    name: "Enhance Ability",
    note: "Concentration, up to 1 hour; caster picks one of six ability enhancements at cast time.",
  },
  "enlarge/reduce": {
    name: "Enlarge/Reduce",
    rounds: 10,
    note: "Concentration, up to 1 minute; unwilling targets get a Constitution save to negate; caster picks grow or shrink.",
  },
  "ensnaring strike": {
    name: "Restrained",
    rounds: 10,
    note: "On a failed Strength save after the triggering weapon hit (Large or bigger creatures save with advantage); takes the same damage again at the start of each of its turns. Concentration, up to 1 minute.",
  },
  entangle: {
    name: "Restrained",
    rounds: 10,
    note: "On a failed Strength save when the plants sprout; can retry with a Strength check vs. the caster's spell save DC.",
  },
  enthrall: {
    name: "Enthralled",
    rounds: 10,
    note: "On a failed Wisdom save; ends early if the target can no longer hear the caster.",
  },
  etherealness: {
    name: "Etherealness",
    note: "No save; no concentration; up to 8 hours or until dismissed",
  },
  "expeditious retreat": {
    name: "Expeditious Retreat",
    rounds: 100,
    note: "Concentration, up to 10 minutes.",
  },
  eyebite: {
    name: "Eyebite",
    rounds: 10,
    note: "On a failed Wisdom save; the caster picks Asleep, Panicked, or Sickened per target; Sickened repeats the save at the end of its turns",
  },
  "faerie fire": {
    name: "Faerie Fire",
    rounds: 10,
    note: "On a failed Dexterity save when cast; Concentration, up to 1 minute.",
  },
  "false life": {
    name: "False Life",
    note: "Lasts 1 hour or until the temporary hit points are gone.",
  },
  "far step": {
    name: "Far Step",
    rounds: 10,
    note: "Concentration, up to 1 minute.",
  },
  "fast friends": {
    name: "Charmed",
    note: "Concentration, up to 1 hour; on a failed Wisdom save; carries out the caster's assigned tasks one at a time, retrying the save (with advantage in combat) if a task would harm it or go against its nature.",
  },
  fear: {
    name: "Frightened",
    rounds: 10,
    note: "On a failed Wisdom save; forced to Dash away from the caster each turn, and may re-save to end the effect once it loses line of sight to the caster.",
  },
  feeblemind: {
    name: "Feeblemind",
    note: "On a failed Intelligence save; the target can retry the save every 30 days, or the effect can be ended by greater restoration, heal, or wish.",
  },
  "feign death": {
    name: "Feign Death",
    note: "No save (willing target); appears dead to all inspection, including divination; the caster can end it early with a touch and an action.",
  },
  "fire shield": {
    name: "Fire Shield",
    rounds: 100,
    note: "Lasts 10 minutes (not concentration).",
  },
  "flame arrows": {
    name: "Flame Arrows",
    note: "Concentration, up to 1 hour; no save (up to twelve pieces of ammunition touched); each piece loses the enchantment once it hits or misses.",
  },
  "flame blade": {
    name: "Flame Blade",
    rounds: 100,
    note: "Concentration, up to 10 minutes; the blade disappears if let go but can be re-evoked as a bonus action.",
  },
  "flesh to stone": {
    name: "Flesh to Stone",
    note: "On a failed Constitution save; repeats the save at the end of each of its turns — three successes ends the spell, three failures turns it to stone (Petrified) for the duration",
  },
  fly: {
    name: "Fly",
    rounds: 100,
    note: "Concentration, up to 10 minutes; falls if still aloft when the spell ends, unless it can otherwise stop the fall.",
  },
  forcecage: {
    name: "Forcecage",
    note: "No save to be caged initially; a Charisma save lets teleportation or interplanar magic break out, otherwise it can't leave by nonmagical means for 1 hour",
  },
  foresight: {
    name: "Foresight",
    note: "Lasts 8 hours; recasting it before it expires ends the earlier casting immediately.",
  },
  "fortune's favor": {
    name: "Fortune's Favor",
    note: "Duration 1 hour, no concentration.",
  },
  "freedom of movement": {
    name: "Freedom of Movement",
    note: "Lasts 1 hour (not concentration).",
  },
  friends: {
    name: "Friends",
    rounds: 10,
    note: "Concentration, up to 1 minute; the target turns hostile toward the caster when it ends",
  },
  frostbite: {
    name: "Frostbite",
    rounds: 1,
    note: "On a failed save; ends at the end of its next turn",
  },
  "gaseous form": {
    name: "Gaseous Form",
    note: "Concentration, up to 1 hour; ends early if reduced to 0 hit points; can't attack, cast spells, or manipulate objects while gaseous.",
  },
  geas: {
    name: "Charmed",
    note: "On a failed Wisdom save; lasts 30 days (dismissible early, or ended by remove curse/greater restoration/wish).",
  },
  "gift of alacrity": { name: "Gift of Alacrity", note: "Lasts 8 hours." },
  glibness: { name: "Glibness", note: "Lasts 1 hour." },
  grease: {
    name: "Prone",
    rounds: 10,
    note: "On a failed Dexterity save on entering the area, ending a turn there, or when the grease appears (over a 1-minute duration).",
  },
  "greater invisibility": {
    name: "Invisible",
    rounds: 10,
    note: "Concentration, up to 1 minute.",
  },
  "guardian of nature": {
    name: "Guardian of Nature",
    rounds: 10,
    note: "Concentration, up to 1 minute; caster chooses one guise at cast time.",
  },
  "guiding bolt": {
    name: "Guiding Bolt",
    rounds: 1,
    note: "On a hit; lasts until the end of the caster's next turn.",
  },
  haste: {
    name: "Haste",
    rounds: 10,
    note: "Concentration, up to 1 minute; when it ends, the target can't move or act until after its next turn.",
  },
  "heat metal": {
    name: "Heat Metal",
    rounds: 1,
    note: "On a failed Constitution save when the item heats (repeatable via bonus action); lasts until the start of the caster's next turn.",
  },
  "heroes' feast": {
    name: "Heroes' Feast",
    note: "No save; benefits begin only after the hour-long feast, then last 24 hours",
  },
  heroism: {
    name: "Heroism",
    rounds: 10,
    note: "Concentration, up to 1 minute; loses any remaining temporary hit points when the spell ends.",
  },
  hex: {
    name: "Hex",
    note: "Concentration, up to 1 hour; can be moved to a new target if it drops to 0 hit points.",
  },
  "hold monster": {
    name: "Paralyzed",
    rounds: 10,
    note: "On a failed Wisdom save (no effect on undead); Concentration, up to 1 minute; a new save is allowed at the end of each round.",
  },
  "hold person": {
    name: "Paralyzed",
    rounds: 10,
    note: "On a failed Wisdom save; concentration, up to 1 minute; repeats the save at the end of each of its turns.",
  },
  "holy aura": {
    name: "Holy Aura",
    rounds: 10,
    note: "Concentration, up to 1 minute; the caster chooses which creatures in the 30-foot radius are affected when cast.",
  },
  "holy weapon": {
    name: "Holy Weapon",
    note: "Concentration, up to 1 hour; can instead be spent for a 30-foot radiant burst (Constitution save) that can blind failed-save targets.",
  },
  "hunter's mark": {
    name: "Hunter's Mark",
    note: "Concentration, up to 1 hour; can be moved to a new target if the marked creature drops to 0 hit points.",
  },
  "hypnotic pattern": {
    name: "Hypnotic Pattern",
    rounds: 10,
    note: "On a failed Wisdom save (only creatures that see the pattern); ends early if the creature takes damage or another creature spends an action to shake it free.",
  },
  "illusory dragon": {
    name: "Frightened",
    rounds: 10,
    note: "On a failed Wisdom save upon seeing the phantasmal dragon; concentration, up to 1 minute.",
  },
  immolation: {
    name: "Immolation",
    rounds: 10,
    note: "On a failed Dexterity save; repeats the save at the end of each of its turns to stop burning; Concentration, up to 1 minute.",
  },
  imprisonment: {
    name: "Imprisonment",
    note: "On a failed Wisdom save (immune to further castings of this spell after succeeding once); the specific restraint (burial, chaining, hedged prison, minimus containment, or slumber) is chosen at casting and lasts until dispelled or a caster-specified release condition is met.",
  },
  "incite greed": {
    name: "Charmed",
    rounds: 10,
    note: "On a failed Wisdom save; single-mindedly approaches the caster by the safest path, then stands transfixed by the displayed gem; retries the save at the end of each of its turns.",
  },
  "intellect fortress": {
    name: "Intellect Fortress",
    note: "Concentration, up to 1 hour; no save (willing target).",
  },
  "investiture of flame": {
    name: "Investiture of Flame",
    rounds: 100,
    note: "Concentration, up to 10 minutes",
  },
  "investiture of ice": {
    name: "Investiture of Ice",
    rounds: 100,
    note: "Concentration, up to 10 minutes",
  },
  "investiture of stone": {
    name: "Investiture of Stone",
    rounds: 100,
    note: "Concentration, up to 10 minutes",
  },
  "investiture of wind": {
    name: "Investiture of Wind",
    rounds: 100,
    note: "Concentration, up to 10 minutes",
  },
  invisibility: {
    name: "Invisible",
    note: "Concentration, up to 1 hour; ends early if the target attacks or casts a spell.",
  },
  "irresistible dance": {
    name: "Irresistible Dance",
    rounds: 10,
    note: "On a failed Wisdom save (charm-immune creatures are immune); can retry the save as its action to end it",
  },
  "jim's glowing coin": {
    name: "Jim's Glowing Coin",
    rounds: 10,
    note: "On a failed Wisdom save; duration 1 minute, no concentration.",
  },
  jump: { name: "Jump", rounds: 10, note: "Lasts 1 minute." },
  "kinetic jaunt": {
    name: "Kinetic Jaunt",
    rounds: 10,
    note: "Concentration, up to 1 minute; self only.",
  },
  levitate: {
    name: "Levitating",
    rounds: 100,
    note: "Concentration, up to 10 minutes; an unwilling target gets a Constitution save to negate.",
  },
  "lightning arrow": {
    name: "Lightning Arrow",
    rounds: 10,
    note: "Concentration, up to 1 minute; no save (self only); consumed on the caster's next ranged weapon attack.",
  },
  longstrider: { name: "Longstrider", note: "Lasts 1 hour." },
  "mage armor": {
    name: "Mage Armor",
    note: "Only while unarmored; ends if the target dons armor or the caster dismisses it. Not concentration; lasts 8 hours.",
  },
  "magic stone": {
    name: "Magic Stone",
    rounds: 10,
    note: "Ends early if a stone is used to attack, or if the caster recasts the spell",
  },
  "magic weapon": {
    name: "Magic Weapon",
    note: "Concentration, up to 1 hour; touched weapon must be nonmagical.",
  },
  "magnify gravity": {
    name: "Magnify Gravity",
    rounds: 1,
    note: "On a failed Constitution save when the sphere is triggered; lasts until the end of its next turn.",
  },
  "mass polymorph": {
    name: "Mass Polymorph",
    note: "On a failed Wisdom save (shapechangers succeed automatically); concentration, up to 1 hour; reverts early if reduced to 0 temporary hit points or the spell ends.",
  },
  "mass suggestion": {
    name: "Mass Suggestion",
    note: "On a failed Wisdom save (charm-immune creatures are immune); ends early if it completes the suggested course of action or if the caster or an ally damages it",
  },
  "maximillian's earthen grasp": {
    name: "Restrained",
    rounds: 10,
    note: "On a failed Strength save (also takes 2d6 bludgeoning damage); concentration, up to 1 minute; can be crushed again as an action for another save, or the target can attempt a Strength check against the caster's spell save DC to break free.",
  },
  maze: {
    name: "Maze",
    rounds: 100,
    note: "Concentration, up to 10 minutes; ends early if the target escapes with a DC 20 Intelligence check (a minotaur or goristro auto-succeeds).",
  },
  "mental prison": {
    name: "Restrained",
    rounds: 10,
    note: "On a failed Intelligence save (charm-immune creatures auto-succeed); it takes psychic damage each turn regardless, doubled and ending the spell if it forces through or attacks through the barrier",
  },
  "mind blank": {
    name: "Mind Blank",
    note: "Lasts 24 hours; a willing touched creature only.",
  },
  "mind sliver": {
    name: "Mind Sliver",
    rounds: 1,
    note: "On a failed save; ends at the end of the caster's next turn",
  },
  "mirror image": {
    name: "Mirror Image",
    rounds: 10,
    note: "Duration 1 minute, no concentration; caster can dismiss the duplicates as an action.",
  },
  mislead: {
    name: "Invisible",
    note: "Concentration, up to 1 hour; ends early if the caster attacks or casts a spell.",
  },
  "modify memory": {
    name: "Modify Memory",
    rounds: 10,
    note: "On a failed Wisdom save (advantage if fighting it); Concentration, up to 1 minute; ends if it takes damage or is targeted by another spell.",
  },
  "motivational speech": {
    name: "Motivational Speech",
    note: "No save (up to five willing listeners); ends early for a creature once its temporary hit points from this spell are gone.",
  },
  "nathair's mischief": {
    name: "Nathair's Mischief",
    rounds: 10,
    note: "Concentration, up to 1 minute; each round the caster picks a new hazard in the cube (charm on a failed Wisdom save, blind on a failed Dexterity save, or incapacitate with giggling on a failed Wisdom save).",
  },
  "pass without trace": {
    name: "Pass without Trace",
    note: "Concentration, up to 1 hour; affects each chosen creature within 30 feet of the caster.",
  },
  "phantasmal force": {
    name: "Phantasmal Force",
    rounds: 10,
    note: "On a failed Intelligence save; concentration, up to 1 minute; ends if the target uses an action to inspect the phantasm and succeeds on an Intelligence check.",
  },
  "phantasmal killer": {
    name: "Frightened",
    rounds: 10,
    note: "On a failed Wisdom save; Concentration, up to 1 minute; repeats the save each of its turns (failure deals 4d10 psychic damage; success ends the spell).",
  },
  "planar binding": {
    name: "Planar Binding",
    note: "On a failed Charisma save (celestial/elemental/fey/fiend only); lasts 24 hours.",
  },
  polymorph: {
    name: "Polymorph",
    note: "Unwilling target saves Wisdom (shapechangers auto-succeed); Concentration, up to 1 hour, or until it drops to 0 HP in the new form.",
  },
  "power word stun": {
    name: "Stunned",
    note: "Only affects a target with 150 hp or fewer; repeats a Constitution save at the end of each of its turns to end the stun.",
  },
  "power word: pain": {
    name: "Power Word: Pain",
    note: "Automatic on a creature with 100 HP or fewer that isn't charm-immune; it repeats a Constitution save at the end of each of its turns to end it",
  },
  "primordial ward": {
    name: "Primordial Ward",
    rounds: 10,
    note: "Concentration, up to 1 minute",
  },
  "prismatic spray": {
    name: "Prismatic Spray",
    note: "On a failed Dexterity save, roll a d8 for color; Indigo restrains it (then a Constitution save each turn, three successes ends it, three failures permanently petrifies it); Violet blinds it (a Wisdom save at the caster's next turn ends the blindness or else banishes it)",
  },
  "prismatic wall": {
    name: "Blinded",
    rounds: 10,
    note: "On a failed Constitution save when another creature moves within 20 feet of the wall or starts its turn there; blinded for 1 minute.",
  },
  "protection from energy": {
    name: "Protection From Energy",
    note: "Concentration, up to 1 hour; no save (willing target); resistance to one damage type chosen at casting (acid, cold, fire, lightning, or thunder).",
  },
  "protection from evil and good": {
    name: "Protection from Evil and Good",
    rounds: 100,
    note: "Concentration, up to 10 minutes.",
  },
  "protection from poison": {
    name: "Protected from Poison",
    note: "Duration 1 hour, no concentration; also cures one poison affecting the target on cast.",
  },
  "psychic scream": {
    name: "Stunned",
    note: "On a failed Intelligence save; repeats the save at the end of each of its turns to end the stun.",
  },
  pyrotechnics: {
    name: "Blinded",
    note: "Fireworks option only; on a failed Constitution save (this entry's description does not state how long the blindness lasts).",
  },
  "raise dead": {
    name: "Raise Dead",
    note: "Applied automatically on revival; the penalty is reduced by 1 after each long rest until it disappears.",
  },
  "ravenous void": {
    name: "Restrained",
    note: "While inside the sphere; a Strength check against the caster's spell save DC, made by it or another creature within reach, frees it.",
  },
  "ray of enfeeblement": {
    name: "Enfeebled",
    rounds: 10,
    note: "On a hit with the spell's ranged spell attack; concentration, up to 1 minute; target retries a Constitution save at the end of each of its turns.",
  },
  "ray of frost": {
    name: "Ray of Frost",
    rounds: 1,
    note: "On a hit; ends at the start of the caster's next turn",
  },
  "ray of sickness": {
    name: "Poisoned",
    rounds: 1,
    note: "On a hit, if it fails a Constitution save; lasts until the end of the caster's next turn.",
  },
  "reality break": {
    name: "Reality Break",
    rounds: 10,
    note: "Concentration, up to 1 minute; on a failed Wisdom save; the target may re-save at the end of each of its turns to end the effect early.",
  },
  regenerate: {
    name: "Regenerate",
    note: "No save; no concentration; lasts 1 hour",
  },
  "resilient sphere": {
    name: "Resilient Sphere",
    rounds: 10,
    note: "On a failed Dexterity save (if unwilling); Concentration, up to 1 minute.",
  },
  resistance: {
    name: "Resistance",
    note: "Concentration; ends after the save it boosts",
  },
  resurrection: {
    name: "Resurrection",
    note: "Always applied on revival; the penalty fades by 1 each time the creature finishes a long rest, until it disappears",
  },
  "rime's binding ice": {
    name: "Encased in Ice",
    rounds: 10,
    note: "On a failed Constitution save (also takes 3d8 cold damage, half on success); an action can break the ice early.",
  },
  sanctuary: {
    name: "Sanctuary",
    rounds: 10,
    note: "Ends early if the warded creature attacks or casts a harmful spell. Lasts 1 minute.",
  },
  "sapping sting": { name: "Prone", note: "On a failed save" },
  "searing smite": {
    name: "Searing Smite",
    rounds: 10,
    note: "On the triggering weapon hit; Concentration, up to 1 minute.",
  },
  "see invisibility": {
    name: "See Invisibility",
    note: "Duration 1 hour, no concentration.",
  },
  sequester: {
    name: "Sequester",
    note: "No save (willing target); ends when the caster's chosen trigger condition occurs, or immediately if the target takes any damage",
  },
  "shadow blade": {
    name: "Shadow Blade",
    rounds: 10,
    note: "Concentration, up to 1 minute; the blade vanishes if released but can be re-formed with a bonus action.",
  },
  shapechange: {
    name: "Shapechange",
    note: "Concentration, up to 1 hour; the caster can assume a new form as an action at any point during the duration.",
  },
  shield: {
    name: "Shield",
    rounds: 1,
    note: "Reaction; lasts until the start of the bearer's next turn.",
  },
  "shield of faith": {
    name: "Shield of Faith",
    rounds: 100,
    note: "Concentration, up to 10 minutes.",
  },
  shillelagh: {
    name: "Shillelagh",
    rounds: 10,
    note: "Ends if recast or if the caster lets go of the weapon; up to 1 minute",
  },
  "shocking grasp": {
    name: "Shocking Grasp",
    rounds: 1,
    note: "On a hit; ends at the start of its next turn",
  },
  "sickening radiance": {
    name: "Sickening Radiance",
    rounds: 100,
    note: "On a failed Constitution save, repeating for each creature that starts a turn or first enters the area; ends when the spell ends.",
  },
  "silvery barbs": {
    name: "Silvery Barbs",
    rounds: 10,
    note: "Reaction; the bonus applies within 1 minute of casting, then ends.",
  },
  "skill empowerment": {
    name: "Skill Empowerment",
    note: "Concentration, up to 1 hour; only affects a skill it's already proficient in and not already doubled.",
  },
  sleep: {
    name: "Unconscious",
    rounds: 10,
    note: "Affects creatures within the rolled 5d8 hit-point pool, lowest current HP first (ignoring undead/charm-immune creatures); ends if the sleeper takes damage or is woken. Lasts 1 minute.",
  },
  slow: {
    name: "Slow",
    rounds: 10,
    note: "On a failed Wisdom save; retries the save at the end of each of its turns to end the effect early.",
  },
  snare: {
    name: "Restrained",
    note: "On a failed Dexterity save when a creature first enters the trapped area; can retry each turn, or be freed by another's Intelligence (Arcana) check vs. the caster's spell save DC.",
  },
  "spider climb": {
    name: "Spider Climb",
    note: "Concentration, up to 1 hour.",
  },
  "spirit guardians": {
    name: "Spirit Guardians",
    rounds: 100,
    note: "Concentration, up to 10 minutes; aura moves with the caster, who can exclude chosen creatures; no save to have speed halved while inside, but a Wisdom save is required on entering the area or starting its turn there (else 3d8 radiant/necrotic damage, half on success).",
  },
  "spirit shroud": {
    name: "Spirit Shroud",
    rounds: 10,
    note: "Concentration, up to 1 minute; no save (self only).",
  },
  "spray of cards": {
    name: "Blinded",
    rounds: 1,
    note: "On a failed Dexterity save (also takes 2d10 force damage; success halves the damage and avoids the blindness).",
  },
  "staggering smite": {
    name: "Staggering Smite",
    rounds: 1,
    note: "On a failed Wisdom save, triggered after the smite's melee hit lands; lasts until the end of its next turn.",
  },
  stoneskin: {
    name: "Stoneskin",
    note: "Concentration, up to 1 hour; target must be willing.",
  },
  "storm of vengeance": {
    name: "Deafened",
    note: "On a failed Constitution save when the storm cloud first forms; deafened for 5 minutes.",
  },
  suggestion: {
    name: "Suggestion",
    note: "On a failed Wisdom save; concentration, up to 8 hours; ends early if the caster or an ally damages the target or once the suggested course of action is completed.",
  },
  sunbeam: {
    name: "Blinded",
    rounds: 1,
    note: "On a failed Constitution save (undead and oozes have disadvantage on it); blinded until the start of the caster's next turn",
  },
  sunburst: {
    name: "Blinded",
    rounds: 10,
    note: "On a failed Constitution save (undead and oozes have disadvantage on this save); blinded for 1 minute, repeating the save at the end of each of its turns to end it early.",
  },
  "swift quiver": {
    name: "Swift Quiver",
    rounds: 10,
    note: "Concentration, up to 1 minute.",
  },
  symbol: {
    name: "Symbol",
    note: "Triggered creature saves against the ward's one chosen effect: Discord/Hopelessness/Pain/Insanity/Stunning (Constitution/Charisma/Wisdom as applicable, 1 minute), Fear (Wisdom, frightened 1 minute), or Sleep (Wisdom, unconscious 10 minutes); Death deals damage only, with no condition",
  },
  "synaptic static": {
    name: "Synaptic Static",
    rounds: 10,
    note: "On a failed Intelligence save; lasts up to 1 minute or until it shakes off the effect.",
  },
  "tasha's caustic brew": {
    name: "Tasha's Caustic Brew",
    rounds: 10,
    note: "On a failed Dexterity save; Concentration, up to 1 minute.",
  },
  "tasha's mind whip": {
    name: "Tasha's Mind Whip",
    rounds: 1,
    note: "On a failed Intelligence save (also takes 3d6 psychic damage; success halves the damage and skips the other penalties).",
  },
  "tasha's otherworldly guise": {
    name: "Tasha's Otherworldly Guise",
    rounds: 10,
    note: "Concentration, up to 1 minute",
  },
  "temporal shunt": {
    name: "Temporal Shunt",
    rounds: 1,
    note: "On a failed Wisdom save, triggered by the caster's reaction.",
  },
  "tenser's transformation": {
    name: "Tenser's Transformation",
    rounds: 100,
    note: "Concentration, up to 10 minutes; ending requires a DC 15 Constitution save or a level of exhaustion, and spells can't be cast while transformed",
  },
  "tether essence": {
    name: "Tether Essence",
    note: "Concentration, up to 1 hour; on a failed Constitution save (at disadvantage if the two targets are within 30 feet of each other, or either may fail outright); ends for both if either drops to 0 hit points",
  },
  "thunderous smite": {
    name: "Prone",
    note: "On a hit, if it fails a Strength save; also shoved 10 feet back.",
  },
  "time ravage": {
    name: "Time Ravage",
    note: "On a failed Constitution save; lasts for the rest of the target's (now 30-day) life, removable only by wish or greater restoration cast with a 9th-level slot.",
  },
  "transmute rock": {
    name: "Transmute Rock",
    note: "On a failed Strength save (mired in mud) or Dexterity save (trapped in hardened rock); lasts until dispelled or freed.",
  },
  "tree stride": {
    name: "Tree Stride",
    rounds: 10,
    note: "Concentration, up to 1 minute; must end each turn outside a tree.",
  },
  "true polymorph": {
    name: "True Polymorph",
    note: "Concentration, up to 1 hour; becomes permanent if concentration is maintained the full duration; ends early if the target drops to 0 HP. An unwilling creature (other than a shapechanger, which is unaffected) gets a Wisdom save.",
  },
  "true seeing": {
    name: "True Seeing",
    note: "No save; no concentration; lasts 1 hour",
  },
  "true strike": {
    name: "True Strike",
    rounds: 1,
    note: "Concentration; ends after the caster's next attack roll against the target",
  },
  tsunami: {
    name: "Restrained",
    rounds: 6,
    note: "While caught inside the advancing wall of water; a Strength (Athletics) check against the caster's spell save DC frees it; concentration, up to 6 rounds.",
  },
  "vicious mockery": {
    name: "Vicious Mockery",
    rounds: 1,
    note: "On a failed save; ends at the end of its next turn",
  },
  "wall of light": {
    name: "Blinded",
    rounds: 1,
    note: "On a failed Constitution save when the wall appears, repeating at the end of its turn if it remains in the light; Concentration, up to 10 minutes.",
  },
  "warding bond": {
    name: "Warding Bond",
    note: "Duration 1 hour, no concentration; ends if caster and target are separated by more than 60 feet or the caster drops to 0 HP.",
  },
  "warp sense": {
    name: "Warp Sense",
    rounds: 10,
    note: "Concentration, up to 1 minute; ends early if the caster spends an action to study a sensed portal.",
  },
  "watery sphere": {
    name: "Restrained",
    rounds: 10,
    note: "On a failed Strength save; Concentration, up to 1 minute; ends if freed or the sphere ends.",
  },
  web: {
    name: "Restrained",
    note: "On a failed Dexterity save while in the webs; concentration, up to 1 hour; can retry with a Strength check against the caster's spell save DC to break free.",
  },
  weird: {
    name: "Frightened",
    rounds: 10,
    note: "On a failed Wisdom save; repeats the save at the start of each of its turns, taking 4d10 psychic damage on a failure or ending the effect on a success.",
  },
  whirlwind: {
    name: "Restrained",
    rounds: 10,
    note: "On a failed Dexterity save then a failed Strength check; a restrained creature can try to break free with a Strength or Dexterity check and is flung 3d6 x 10 feet on success",
  },
  "wind walk": {
    name: "Wind Walk",
    note: "No save; no concentration; up to 8 hours; can only Dash or revert (a 1-minute transformation) while in cloud form",
  },
  "wrath of nature": {
    name: "Restrained",
    rounds: 10,
    note: "On a failed Strength save against the grasping roots; Concentration, up to 1 minute.",
  },
  "wrathful smite": {
    name: "Frightened",
    rounds: 10,
    note: "On a hit, if it fails a Wisdom save; can retry the save as an action vs. the caster's spell save DC. Concentration, up to 1 minute.",
  },
  "zephyr strike": {
    name: "Zephyr Strike",
    rounds: 10,
    note: "Concentration, up to 1 minute.",
  },
  "zone of truth": {
    name: "Zone of Truth",
    rounds: 100,
    note: "On a failed Charisma save when entering the area or starting its turn there (duration 10 minutes, no concentration); the caster knows whether each creature passed or failed.",
  },
};

export function spellConditionFor(
  spell: Spell | undefined,
): SpellConditionGrant | undefined {
  if (!spell) return undefined;
  return SPELL_CONDITIONS[normalizeTitle(spell.info.title)];
}

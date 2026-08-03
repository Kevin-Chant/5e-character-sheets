import {
  DamageType,
  DieOperation,
  PB,
  StandardDie,
} from "src/lib/data/data-definitions";
import { ActiveRider } from "src/lib/mechanics/types";
import { FeatureRider, RollKind } from "src/lib/types";
import { ConditionName } from "src/lib/play/conditions";

// What a condition *does* to its bearer's rolls — the wired half of the
// condition system, as `CONDITION_ROLL_EFFECTS` (conditions.ts) is the
// advisory half.
//
// This is the catalog that makes "send fully wired conditions across the
// wire" viable without sending mechanics across the wire: a `ConditionOffer`
// carries only the condition's **name**, and every client resolves that name
// against this bundled table — the same trust and versioning model as the
// spell catalog. Rider definitions never travel, so a rogue client can lie
// about *which* buff it cast but cannot inject arbitrary mechanics into a
// peer's rolls.
//
// The standard 5e conditions stay advisory-only (their clauses hinge on
// facts the sheet can't see); entries here are the buff/debuff conditions
// spells mint — Bless, Guidance — whose effects are unconditional enough to
// wire. Checks and saves are distinct `RollKind`s, so a rider aimed at one
// never leaks onto the other; `optional` remains for eligibility the kinds
// still can't express (Guidance boosts *one* check, then ends).

// A rider applied to rolls made *against* a bearer of the condition — the
// attacker's side of the mirror. `casterOnly` limits it to whoever placed
// the condition (`ActiveCondition.from`): Hex's d6 is the hexer's, while
// Faerie Fire's advantage belongs to anyone who can see the glow.
export interface TargetedRider extends FeatureRider {
  casterOnly?: boolean;
}

export interface ConditionMechanics {
  // What the condition does to the *bearer's* own rolls (Bless's d4).
  riders?: FeatureRider[];
  // What it does to rolls aimed *at* the bearer (Hex's d6, Faerie Fire's
  // advantage). Consumed by the dialog when the roll's chosen target bears
  // the condition — which is why marks only work at a table: the condition
  // lives on an encounter row, and solo there is no row to bear it.
  against?: TargetedRider[];
  // One line for banners and the DM board: what accepting this means.
  summary?: string;
}

export const CONDITION_MECHANICS: Record<string, ConditionMechanics> = {
  Bless: {
    summary: "+1d4 to attack rolls and saving throws",
    riders: [
      {
        // Saves and attacks are exactly what Bless touches and exactly what
        // the kinds can now say — so the d4 folds in on its own, no tick.
        appliesTo: ["attack", "save"],
        rider: {
          rider: "bonusDice",
          count: 1,
          die: StandardDie.d4,
        },
      },
    ],
  },
  Guidance: {
    summary: "+1d4 to one ability check, then it ends",
    riders: [
      {
        appliesTo: ["check"],
        rider: {
          rider: "bonusDice",
          count: 1,
          die: StandardDie.d4,
          optional: true,
          note: "one ability check — remove the condition after using it",
        },
      },
    ],
  },
  "Hideous Laughter": {
    summary:
      "Falls prone, incapacitated with laughter; repeats the save when damaged",
  },

  // --- 2026-08-03 catalog fan-out (see spell-conditions.ts). `riders` only
  // where the bearer-side effect is expressible; caster-/attacker-side
  // effects (Hex's d6, Blur's disadvantage, Sanctuary's save) live in
  // `against` instead — applied to rolls aimed at the bearer, `casterOnly`
  // where the benefit belongs to whoever placed the mark. When neither a die
  // nor a modifier is wireable, an `advantage` rider (advisory by design)
  // still puts the reminder on exactly the rolls it concerns — Fire Shield's
  // burn, Mirror Image's duplicates.
  "Absorb Elements": {
    summary:
      "Resistance to the triggering damage type, and the bearer's first successful melee attack that turn deals an extra 1d6 of that type.",
    riders: [
      {
        appliesTo: ["damage"],
        rider: {
          rider: "extraDamage",
          amount: [1, StandardDie.d6, DieOperation.roll],
          declareAt: "on-hit",
          optional: true,
          note: "one melee hit before your next turn; same damage type as the absorbed element",
        },
      },
    ],
  },
  Aid: {
    summary:
      "Hit point maximum and current hit points increase by 5 for the duration.",
  },
  "Air Bubble": {
    summary:
      "Can breathe normally, even underwater or in a vacuum, for the duration.",
  },
  "Alter Self": {
    summary:
      "Grants an aquatic adaptation, a changed appearance, or magical natural weapons (1d6 damage, +1 to attack and damage) depending on the option chosen.",
    riders: [
      {
        appliesTo: ["attack"],
        rider: {
          rider: "bonus",
          value: 1,
          optional: true,
          note: "only while the Natural Weapons option is active",
        },
      },
      {
        appliesTo: ["damage"],
        rider: {
          rider: "bonus",
          value: 1,
          optional: true,
          note: "only while the Natural Weapons option is active",
        },
      },
    ],
  },
  "Animal Shapes": {
    summary:
      "Transformed into a chosen Large-or-smaller beast (CR 4 or lower), replacing game statistics while keeping alignment, Int, Wis, and Cha.",
  },
  "Antilife Shell": {
    summary:
      "Shielded by a moving barrier that blocks creatures other than undead and constructs from passing or reaching through.",
  },
  "Antipathy/Sympathy": {
    summary:
      "Frightened away from the target (antipathy) or compelled to approach and stay near it (sympathy), whichever aura the caster chose.",
  },
  "Armor of Agathys": {
    summary:
      "Gains 5 temporary hit points; while any remain, a creature that hits the bearer with a melee attack takes cold damage equal to the hit points still remaining.",
    against: [
      {
        appliesTo: ["attack"],
        rider: {
          rider: "advantage",
          note: "a melee hit deals cold damage to you equal to the bearer's remaining temporary hit points",
        },
      },
    ],
  },
  "Arms of Hadar": {
    summary: "Can't take reactions.",
  },
  "Ashardalon's Stride": {
    summary:
      "Speed increases by 20 feet, movement no longer provokes opportunity attacks, and a trailing flame damages creatures that come within 5 feet.",
  },
  "Aura of Life": {
    summary:
      "Resistance to necrotic damage, immune to hit point maximum reduction, and regains 1 HP at the start of its turn if dropped to 0 while in the aura.",
  },
  "Aura of Purity": {
    summary:
      "Immune to disease, resistance to poison damage, and advantage on saves against being blinded, charmed, deafened, frightened, paralyzed, poisoned, or stunned.",
    riders: [
      {
        appliesTo: ["save"],
        rider: {
          rider: "advantage",
          note: "advantage on saves against being blinded, charmed, deafened, frightened, paralyzed, poisoned, or stunned",
        },
      },
    ],
  },
  Bane: {
    summary:
      "Subtracts a rolled d4 from the bearer's attack rolls and saving throws.",
    // A *negative* bonus die has no rider shape (bonusDice only adds), so the
    // d4 stays the roller's to subtract — but the reminder lands on exactly
    // the rolls it taxes.
    riders: [
      {
        appliesTo: ["attack", "save"],
        rider: {
          rider: "advantage",
          note: "subtract a rolled d4 from the total",
        },
      },
    ],
  },
  "Banishing Smite": {
    summary:
      "Banished to a harmless demiplane and incapacitated until the spell ends, then reappears where it left.",
  },
  // Granted by the bard's Inspire action, not a spell. The die scales with the
  // *bard's* level (d6→d12), which the bearer's sheet can't know — so it stays
  // an advisory note rather than a `bonusDice` rider that would roll the wrong
  // size.
  "Bardic Inspiration": {
    summary:
      "Add an inspiration die (d6–d12 by the bard's level) to one attack roll, ability check, or saving throw within 10 minutes; then it's spent.",
    riders: [
      {
        appliesTo: ["attack", "check", "save"],
        rider: {
          rider: "advantage",
          note: "you may add your inspiration die (d6–d12 by the bard's level) to this roll — remove the condition after using it",
        },
      },
    ],
  },
  Barkskin: {
    summary:
      "AC can't be less than 16 regardless of the armor worn, for the duration.",
  },
  "Beacon of Hope": {
    summary:
      "Advantage on Wisdom saving throws and death saving throws, and heals to the maximum possible from any healing received.",
    riders: [
      {
        appliesTo: ["save"],
        rider: {
          rider: "advantage",
          note: "advantage on Wisdom saving throws and death saving throws",
        },
      },
    ],
  },
  "Beast Bond": {
    summary:
      "Advantage on attacks against a creature within 5 feet of the caster, while within the caster's line of sight.",
    riders: [
      {
        appliesTo: ["attack"],
        rider: {
          rider: "advantage",
          note: "advantage on attacks against a creature within 5 feet of the caster, while the beast is within the caster's line of sight",
        },
      },
    ],
  },
  "Beast Sense": {
    summary:
      "Perceives through a touched beast's senses (including its darkvision or blindsight) instead of its own, for the duration.",
  },
  "Bestow Curse": {
    summary:
      "Cursed with a caster-chosen effect: disadvantage on one ability's checks/saves, disadvantage attacking the caster, a Wisdom save each turn just to act, or extra necrotic damage from the caster's attacks and spells.",
    against: [
      {
        appliesTo: ["damage"],
        casterOnly: true,
        rider: {
          rider: "extraDamage",
          amount: [1, StandardDie.d8, DieOperation.roll],
          damageType: DamageType.Necrotic,
          declareAt: "on-hit",
          // One of four curse options, so it waits for a tick where Hex's d6
          // folds in on its own.
          optional: true,
          note: "only if the extra-damage curse was the option chosen",
        },
      },
    ],
  },
  "Blade Ward": {
    summary:
      "Halves damage taken from weapon attacks dealing bludgeoning, piercing, or slashing damage.",
  },
  "Blindness/Deafness": {
    summary:
      "Blinded (attack rolls against it have advantage, its own attacks have disadvantage) or Deafened, whichever the caster chose.",
    against: [
      {
        appliesTo: ["attack"],
        rider: {
          rider: "advantage",
          note: "advantage on your attack if the Blinded option was chosen",
        },
      },
    ],
  },
  Blink: {
    summary:
      "May randomly vanish to the Ethereal Plane between turns, becoming unreachable to creatures on the material plane until it returns.",
  },
  Blurred: {
    summary:
      "Attackers have disadvantage on attack rolls against the bearer, unless they don't rely on sight.",
    against: [
      {
        appliesTo: ["attack"],
        rider: {
          rider: "advantage",
          note: "your attack has disadvantage unless you don't rely on sight",
        },
      },
    ],
  },
  "Booming Blade": {
    summary:
      "Hums with a booming charge, dealing extra thunder damage if the target willingly moves before the caster's next turn.",
  },
  "Borrowed Knowledge": {
    summary: "Proficient in one chosen skill for the duration.",
  },
  Branded: {
    summary:
      "Becomes visible if invisible, sheds dim light in a 5-foot radius, and can't turn invisible until the spell ends.",
  },
  Calmed: {
    summary:
      "Charmed or frightened effects on the target are suppressed, or it becomes indifferent toward creatures the caster names.",
  },
  Ceremony: {
    summary:
      "One of several chosen rites takes hold: +1d4 to ability checks (Coming of Age), +1d4 to saving throws (Dedication), or +2 to a chosen d20 roll for the wedded pair (Wedding), for 24 hours.",
  },
  // Granted by the Crown paladin's Channel Divinity action, not a spell.
  "Champion Challenge": {
    summary:
      "Can't willingly move more than 30 ft. from the paladin who challenged it, until they are incapacitated or die or it ends up beyond 30 ft.",
  },
  "Chill Touch": {
    summary:
      "Can't regain hit points while the ghostly hand grips it; against an undead target it also has disadvantage on attacks against the caster.",
  },
  "Circle of Power": {
    summary:
      "Advantage on saves against spells/magical effects, and a successful half-damage save instead takes no damage.",
    riders: [
      {
        appliesTo: ["save"],
        rider: {
          rider: "advantage",
          note: "advantage on saving throws against spells and other magical effects",
        },
      },
    ],
  },
  "Compelled Duel": {
    summary:
      "Disadvantage on attack rolls against anyone but the caster, and must succeed on a Wisdom save to willingly move more than 30 feet from them.",
    riders: [
      {
        appliesTo: ["attack"],
        rider: {
          rider: "advantage",
          note: "disadvantage on attacks against anyone but the caster who compelled you",
        },
      },
    ],
  },
  Compulsion: {
    summary:
      "Forced to use its movement to move in the caster's designated direction on its next turn.",
  },
  Confusion: {
    summary:
      "Can't take reactions and rolls randomly each turn for erratic behavior (wander, freeze, attack a random creature, or act normally).",
  },
  "Contact Other Plane": {
    summary:
      "Insane: can't take actions, can't understand others, can't read, and speaks only gibberish.",
  },
  Contagion: {
    summary:
      "Afflicted with one of six diseases (caster's choice), each giving disadvantage on a matched ability score's checks/saves (or attacks) plus a unique complication such as blindness, vulnerability to all damage, or being stunned when damaged.",
  },
  "Crusader's Mantle": {
    summary:
      "Weapon attacks that hit deal an extra 1d4 radiant damage while inside the caster's aura.",
  },
  Darkvision: {
    summary: "Gains darkvision out to 60 feet for the duration.",
  },
  "Death Ward": {
    summary:
      "The next time it would drop to 0 hit points, it drops to 1 instead (or one instant-death effect is negated), and the spell ends.",
  },
  "Disguise Self": {
    summary:
      "Appears as a different humanoid of the same basic limb arrangement until inspected or the spell ends.",
  },
  "Dispel Evil and Good": {
    summary:
      "Celestials, elementals, fey, fiends, and undead have disadvantage on attack rolls against the caster.",
    against: [
      {
        appliesTo: ["attack"],
        rider: {
          rider: "advantage",
          note: "celestials, elementals, fey, fiends, and undead attack the bearer with disadvantage",
        },
      },
    ],
  },
  "Divine Favor": {
    summary: "+1d4 radiant damage on the bearer's weapon attacks.",
    riders: [
      {
        appliesTo: ["damage"],
        rider: {
          rider: "extraDamage",
          amount: [1, StandardDie.d4, DieOperation.roll],
          damageType: DamageType.Radiant,
          declareAt: "on-hit",
        },
      },
    ],
  },
  "Divine Word": {
    summary:
      "Struck deaf, blind, and/or stunned in an escalating combination based on how wounded it already is.",
  },
  "Draconic Transformation": {
    summary:
      "Grants incorporeal dragon wings (60-foot fly speed) and 30-foot blindsight, plus a cone of force breath usable as a bonus action.",
  },
  "Dragon's Breath": {
    summary:
      "Gains the ability to exhale a 15-foot cone of the chosen energy as an action, dealing 3d6 damage (Dexterity save for half) to creatures inside.",
  },
  "Elemental Bane": {
    summary:
      "Loses resistance to the caster's chosen damage type and takes an extra 2d6 the first time each turn it's hit by that type.",
  },
  "Elemental Weapon": {
    summary:
      "A touched nonmagical weapon gains +1 to attack rolls and an extra 1d4 damage of a chosen type on a hit.",
    riders: [
      {
        appliesTo: ["attack"],
        rider: { rider: "bonus", value: 1 },
      },
    ],
  },
  "Encased in Ice": {
    summary: "Speed reduced to 0 while encased in ice, for up to a minute.",
  },
  "Enemies Abound": {
    summary:
      "Can no longer distinguish friend from foe and is drawn to attack or approach the nearest creature within its own reach or range, including forced opportunity attacks.",
  },
  Enervation: {
    summary:
      "Marked by draining shadowy energy, taking necrotic damage the caster can renew each turn while it stays in range and in sight.",
  },
  Enfeebled: {
    summary:
      "Deals only half damage with weapon attacks that use Strength, until the spell ends.",
  },
  "Enhance Ability": {
    summary:
      "Advantage on checks of one chosen ability score (Bear's Endurance also grants 2d6 temporary hit points; Cat's Grace also negates short fall damage).",
  },
  "Enlarge/Reduce": {
    summary:
      "Grows one size larger (advantage on Strength checks/saves, weapon damage +1d4) or shrinks one size smaller (disadvantage on Strength checks/saves, weapon damage -1d4).",
  },
  Enthralled: {
    summary:
      "Disadvantage on Wisdom (Perception) checks to notice anyone but the caster.",
  },
  Etherealness: {
    summary:
      "Shifted into the Border Ethereal, able to move through objects and only affect or be affected by other creatures also on that plane.",
  },
  "Expeditious Retreat": {
    summary: "May take the Dash action as a bonus action each turn.",
  },
  Eyebite: {
    summary:
      "Falls unconscious, becomes frightened of the caster, or suffers disadvantage on attack rolls and ability checks, per the caster's choice.",
  },
  "Faerie Fire": {
    summary:
      "Outlined in light: attackers who can see the bearer have advantage against it, and it can't benefit from invisibility.",
    against: [
      {
        appliesTo: ["attack"],
        rider: {
          rider: "advantage",
          note: "attacks against the outlined target have advantage if you can see it",
        },
      },
    ],
  },
  "False Life": {
    summary: "Gains 1d4 + 4 temporary hit points.",
  },
  "Far Step": {
    summary:
      "May teleport up to 60 feet as a bonus action on this and later turns.",
  },
  // Granted by the ranger's Mark a foe action (Tasha's Favored Foe), not a
  // spell. The die scales with the *ranger's* level (d4→d8), which a static
  // rider can't say — so the payout stays an advisory note; the ranger's own
  // dialog rolls the real die via the Favored Foe damage rider.
  "Favored Foe": {
    summary:
      "Marked as the ranger's favored foe (concentration, 1 minute): their first hit each turn deals their Favored Foe die extra.",
    against: [
      {
        appliesTo: ["attack"],
        casterOnly: true,
        rider: {
          rider: "advantage",
          note: "your first hit against your favored foe each turn deals your Favored Foe die extra — tick it on the damage roll",
        },
      },
    ],
  },
  Feeblemind: {
    summary:
      "Intelligence and Charisma drop to 1; can't cast spells, activate magic items, understand language, or communicate intelligibly.",
  },
  "Feign Death": {
    summary:
      "Blinded, incapacitated, speed 0, and resistant to all damage but psychic, with any poisons or diseases suspended.",
  },
  "Fire Shield": {
    summary:
      "Resistance to one damage type (fire or cold) and deals 2d8 of the other type to any melee attacker that hits it within 5 feet.",
    against: [
      {
        appliesTo: ["attack"],
        rider: {
          rider: "advantage",
          note: "a melee hit from within 5 feet burns you for 2d8 fire or cold damage",
        },
      },
    ],
  },
  "Flame Arrows": {
    summary: "Touched ammunition deals an extra 1d6 fire damage on a hit.",
  },
  "Flame Blade": {
    summary:
      "Wields a fiery scimitar-shaped blade for melee spell attacks (3d6 fire on a hit) that sheds bright light 10 ft and dim light 10 ft further, for the duration.",
  },
  "Flesh to Stone": {
    summary:
      "Restrained as its flesh hardens, then permanently petrified if it fails three saves before it succeeds three.",
  },
  Fly: {
    summary: "Gains a flying speed of 60 feet.",
  },
  Forcecage: {
    summary:
      "Trapped inside an invisible cage or box of magical force it can't leave by ordinary means.",
  },
  Foresight: {
    summary:
      "Can't be surprised, has advantage on attack rolls, ability checks, and saving throws, and attackers have disadvantage against it.",
    riders: [
      {
        appliesTo: ["attack", "check", "save"],
        rider: {
          rider: "advantage",
          note: "can't be surprised; advantage on attack rolls, ability checks, and saving throws",
        },
      },
    ],
    against: [
      {
        appliesTo: ["attack"],
        rider: {
          rider: "advantage",
          note: "your attack against this creature has disadvantage",
        },
      },
    ],
  },
  "Fortune's Favor": {
    summary:
      "Can dismiss the charm to reroll an attack roll, ability check, or saving throw it (or one made against it) just made, taking the better result, once before the spell ends.",
  },
  "Freedom of Movement": {
    summary:
      "Immune to magical speed reduction and to being paralyzed or restrained by spells/effects; can escape nonmagical restraints/grapples with 5 feet of movement, and ignores underwater movement/attack penalties.",
  },
  Friends: {
    summary:
      "The caster has advantage on Charisma checks directed at the target creature.",
    against: [
      {
        appliesTo: ["check"],
        casterOnly: true,
        rider: {
          rider: "advantage",
          note: "your Charisma checks directed at it (it knows afterwards)",
        },
      },
    ],
  },
  Frostbite: {
    summary:
      "Its next weapon attack, made before the end of its next turn, suffers disadvantage.",
  },
  "Gaseous Form": {
    summary:
      "Becomes a misty cloud: flying speed 10 ft, resistance to nonmagical damage, and advantage on Strength, Dexterity, and Constitution saves.",
    riders: [
      {
        appliesTo: ["save"],
        rider: {
          rider: "advantage",
          note: "advantage on Strength, Dexterity, and Constitution saving throws",
        },
      },
    ],
  },
  "Gift of Alacrity": {
    summary: "May add 1d8 to an initiative roll.",
    riders: [
      {
        appliesTo: ["check"],
        rider: {
          rider: "bonusDice",
          count: 1,
          die: StandardDie.d8,
          optional: true,
          note: "initiative rolls only, not other checks",
        },
      },
    ],
  },
  Glibness: {
    summary:
      "Charisma checks can be replaced with a flat 15, and magic that detects truthfulness reads the caster as truthful.",
    riders: [
      {
        appliesTo: ["check"],
        rider: { rider: "minimumDie", value: 15 },
      },
    ],
  },
  "Guardian of Nature": {
    summary:
      "Primal Beast guise: +10 speed, 120-ft darkvision, advantage on Strength attacks, +1d6 force on melee hits; or Great Tree guise: 10 temp HP, advantage on Con saves and Dex/Wis attacks, difficult terrain nearby.",
    riders: [
      {
        appliesTo: ["attack", "save"],
        rider: {
          rider: "advantage",
          note: "guise-dependent: Strength attacks (Primal Beast) or Constitution saves and Dexterity/Wisdom attacks (Great Tree)",
        },
      },
    ],
  },
  "Guiding Bolt": {
    summary:
      "The next attack roll against the bearer before the end of the caster's next turn has advantage.",
    against: [
      {
        appliesTo: ["attack"],
        rider: {
          rider: "advantage",
          note: "the next attack against it has advantage — remove the condition once someone uses it",
        },
      },
    ],
  },
  Haste: {
    summary:
      "Speed doubled, +2 AC, advantage on Dexterity saves, and an extra action limited to Attack (one weapon attack), Dash, Disengage, Hide, or Use an Object.",
    riders: [
      {
        appliesTo: ["save"],
        rider: {
          rider: "advantage",
          note: "advantage on Dexterity saving throws",
        },
      },
    ],
  },
  "Heat Metal": {
    summary:
      "Disadvantage on attack rolls and ability checks, if it didn't drop the now red-hot item.",
  },
  "Heroes' Feast": {
    summary:
      "Cured of disease and poison, immune to poison and frightened, advantage on Wisdom saving throws, and increased hit point maximum.",
    riders: [
      {
        appliesTo: ["save"],
        rider: {
          rider: "advantage",
          note: "advantage on Wisdom saving throws",
        },
      },
    ],
  },
  Heroism: {
    summary:
      "Immune to being frightened, and gains temporary hit points equal to the caster's spellcasting modifier at the start of each of its turns.",
  },
  Hex: {
    summary:
      "Cursed: the hexer's hits against it deal +1d6 necrotic, and it has disadvantage on checks with one named ability score.",
    against: [
      {
        appliesTo: ["damage"],
        casterOnly: true,
        rider: {
          rider: "extraDamage",
          amount: [1, StandardDie.d6, DieOperation.roll],
          damageType: DamageType.Necrotic,
          declareAt: "on-hit",
          note: "every hit against the hexed target, spell attacks included",
        },
      },
    ],
  },
  // Granted by the hexblade's Curse action, not a spell. The +PB damage and
  // the widened crit range belong to the curser alone — both riders ride
  // `casterOnly` off the mark's provenance, the same way Hex's d6 does.
  "Hexblade's Curse": {
    summary:
      "Cursed: the curser's damage rolls against it gain the curser's proficiency bonus, the curser crits against it on 19–20, and the curser regains HP if it dies.",
    against: [
      {
        appliesTo: ["damage"],
        casterOnly: true,
        rider: {
          rider: "extraDamage",
          amount: PB,
          declareAt: "on-hit",
          note: "your proficiency bonus, on any damage roll against your cursed target",
        },
      },
      {
        appliesTo: ["attack"],
        casterOnly: true,
        rider: { rider: "critRange", value: 19 },
      },
    ],
  },
  "Holy Aura": {
    summary:
      "Sheds dim light, has advantage on all saving throws, and attackers have disadvantage against it; a fiend or undead that melee-hits it must save or be blinded.",
    riders: [
      {
        appliesTo: ["save"],
        rider: { rider: "advantage", note: "advantage on all saving throws" },
      },
    ],
    against: [
      {
        appliesTo: ["attack"],
        rider: {
          rider: "advantage",
          note: "your attack has disadvantage; a fiend or undead that melee-hits must save or be blinded",
        },
      },
    ],
  },
  "Holy Weapon": {
    summary:
      "Wielded weapon sheds light and its hits deal +2d8 radiant damage (becomes magical if it wasn't).",
  },
  "Hunter's Mark": {
    summary:
      "Marked: the marker's weapon hits against it deal +1d6, and the marker has advantage on Perception/Survival checks to find it.",
    against: [
      {
        appliesTo: ["damage"],
        casterOnly: true,
        rider: {
          rider: "extraDamage",
          amount: [1, StandardDie.d6, DieOperation.roll],
          declareAt: "on-hit",
          note: "weapon attacks against the marked target",
        },
      },
    ],
  },
  "Hypnotic Pattern": {
    summary: "Charmed and incapacitated, with its speed reduced to 0.",
  },
  Immolation: {
    summary:
      "Continues burning, shedding light and taking 4d6 fire damage at the end of each of its turns.",
  },
  Imprisonment: {
    summary:
      "Bound and removed from play by one of five imprisonment forms; doesn't need to breathe, eat, drink, or age, and can't be found by divination.",
  },
  "Intellect Fortress": {
    summary:
      "Resistance to psychic damage and advantage on Intelligence, Wisdom, and Charisma saving throws.",
    riders: [
      {
        appliesTo: ["save"],
        rider: {
          rider: "advantage",
          note: "advantage on Intelligence, Wisdom, and Charisma saving throws",
        },
      },
    ],
  },
  "Investiture of Flame": {
    summary:
      "Immune to fire damage, resistant to cold, singes anyone who ends a turn adjacent, and can lash a 15-foot line of fire once per turn.",
  },
  "Investiture of Ice": {
    summary:
      "Immune to cold damage, resistant to fire, moves freely over ice and snow, and can blast a 15-foot cone of freezing wind once per turn.",
  },
  "Investiture of Stone": {
    summary:
      "Resistant to nonmagical bludgeoning, piercing, and slashing damage; can tunnel through earth and stone, and shake the ground to knock nearby creatures prone once per turn.",
  },
  "Investiture of Wind": {
    summary:
      "Grants a 60-foot fly speed and disadvantage to ranged attacks made against the bearer; can also whip up a damaging gust once per action.",
    against: [
      {
        appliesTo: ["attack"],
        rider: {
          rider: "advantage",
          note: "ranged attacks against the bearer have disadvantage",
        },
      },
    ],
  },
  "Irresistible Dance": {
    summary:
      "Forced to dance in place with disadvantage on Dexterity saves and attack rolls, while other creatures gain advantage attacking it.",
  },
  "Jim's Glowing Coin": {
    summary:
      "Disadvantage on Wisdom (Perception) checks and initiative rolls, distracted by the glowing coin's light.",
  },
  Jump: {
    summary: "Jump distance is tripled.",
  },
  "Kinetic Jaunt": {
    summary:
      "Speed +10 feet, doesn't provoke opportunity attacks, and can move through other creatures' spaces (treated as difficult terrain).",
  },
  Levitating: {
    summary:
      "Rises and hovers up to 20 feet up, moving only by pushing/pulling off fixed surfaces (or moved by the caster) for the duration.",
  },
  "Lightning Arrow": {
    summary:
      "The caster's next ranged weapon attack deals extra lightning damage and splashes lesser damage to creatures nearby the target.",
  },
  Longstrider: {
    summary: "Walking speed increases by 10 feet.",
  },
  "Mage Armor": {
    summary: "Base AC becomes 13 + Dexterity modifier while unarmored.",
  },
  "Magic Stone": {
    summary:
      "Its enchanted pebbles can be thrown or slung as a spell attack dealing bludgeoning damage plus the caster's spellcasting modifier.",
  },
  "Magic Weapon": {
    summary:
      "The touched weapon gains a +1 bonus to attack and damage rolls for the duration.",
    riders: [
      {
        appliesTo: ["attack"],
        rider: { rider: "bonus", value: 1 },
      },
      {
        appliesTo: ["damage"],
        rider: { rider: "bonus", value: 1 },
      },
    ],
  },
  "Magnify Gravity": {
    summary: "Speed is halved.",
  },
  "Mass Polymorph": {
    summary:
      "Reshaped into a beast form of CR no higher than its own level, gaining temporary hit points equal to that form's HP maximum but losing speech, spellcasting, and hand use.",
  },
  "Mass Suggestion": {
    summary:
      "Compelled to carry out the caster's suggested course of action for up to 24 hours.",
  },
  Maze: {
    summary:
      "Banished into a labyrinthine demiplane, removed from the fight until it escapes or the spell ends.",
  },
  "Mind Blank": {
    summary:
      "Immune to psychic damage, thought-reading, divination, and the charmed condition, even against wish-level effects.",
  },
  "Mind Sliver": {
    summary:
      "Knocks 1d4 off the next saving throw it attempts before the caster's next turn ends.",
  },
  "Mirror Image": {
    summary:
      "Three illusory duplicates redirect incoming attacks (rolled per attack) until they run out or are destroyed.",
    against: [
      {
        appliesTo: ["attack"],
        rider: {
          rider: "advantage",
          note: "your attack may strike an illusory duplicate instead — roll a d20 to see (6+ with three duplicates, 8+ with two, 11+ with one)",
        },
      },
    ],
  },
  "Modify Memory": {
    summary:
      "Charmed, incapacitated, and unaware of its surroundings (though it can still hear the caster).",
  },
  "Motivational Speech": {
    summary:
      "Gains 5 temporary hit points and advantage on Wisdom saving throws.",
    riders: [
      {
        appliesTo: ["save"],
        rider: {
          rider: "advantage",
          note: "advantage on Wisdom saving throws",
        },
      },
    ],
  },
  "Nathair's Mischief": {
    summary:
      "Charmed, blinded, or incapacitated with laughter, depending on which hazard the caster chose that round.",
  },
  "Pass without Trace": {
    summary:
      "+10 bonus to Dexterity (Stealth) checks and can't be tracked except by magical means.",
  },
  // Granted by the Grave cleric's Channel Divinity action, not a spell. The
  // vulnerability is anyone's to cash — the first attack, ally or cleric.
  "Path to the Grave": {
    summary:
      "Cursed until the end of the cleric's next turn: the first attack to hit it makes it vulnerable to all of that attack's damage, then the curse ends.",
    against: [
      {
        appliesTo: ["attack"],
        rider: {
          rider: "advantage",
          note: "the first hit makes the target vulnerable to all of the attack's damage (double it) — the curse then ends",
        },
      },
    ],
  },
  "Phantasmal Force": {
    summary:
      "Perceives a harmless-seeming illusion as real, taking 1d6 psychic damage each round it interacts with it.",
  },
  "Planar Binding": {
    summary: "Bound to obey the caster's instructions for the duration.",
  },
  Polymorph: {
    summary:
      "Transformed into a chosen beast form, using the beast's game statistics; can't speak, cast spells, or use gear until it reverts.",
  },
  "Power Word: Pain": {
    summary:
      "Speed capped at 10 feet, disadvantage on attack rolls, ability checks, and non-Constitution saves, and its own spells fail unless they beat a Constitution save.",
  },
  "Primordial Ward": {
    summary:
      "Resistant to acid, cold, fire, lightning, and thunder; can trade all five for immunity to one of those types as a reaction, which ends the spell.",
  },
  "Prismatic Spray": {
    summary:
      "Struck by a random colored ray — the two non-damage results restrain it toward permanent petrification, or blind it toward banishment.",
  },
  "Protected from Poison": {
    summary:
      "Advantage on saving throws against being poisoned and resistance to poison damage for the duration.",
  },
  "Protection From Energy": {
    summary: "Resistance to one chosen damage type.",
  },
  "Protection from Evil and Good": {
    summary:
      "Aberrations, celestials, elementals, fey, fiends, and undead have disadvantage on attacks against the bearer, and can't charm, frighten, or possess it.",
    against: [
      {
        appliesTo: ["attack"],
        rider: {
          rider: "advantage",
          note: "aberrations, celestials, elementals, fey, fiends, and undead attack the bearer with disadvantage",
        },
      },
    ],
  },
  "Raise Dead": {
    summary:
      "A -4 penalty to attack rolls, saving throws, and ability checks from the ordeal of returning to life.",
    riders: [
      {
        appliesTo: ["attack", "save", "check"],
        rider: { rider: "bonus", value: -4 },
      },
    ],
  },
  "Ray of Frost": {
    summary:
      "Speed reduced by 10 feet until the start of the caster's next turn.",
  },
  "Reality Break": {
    summary:
      "Loses the ability to take reactions and suffers one random effect each of its turns (a brief stun, a forced Dexterity save, a knockdown, or a blind, each with its own damage).",
  },
  Regenerate: {
    summary:
      "Regains 1 hit point at the start of each of its turns, and severed body parts knit back after 2 minutes.",
  },
  "Resilient Sphere": {
    summary:
      "Enclosed in an indestructible force sphere, immune to all damage/interaction from outside; can roll the sphere at half speed.",
  },
  Resistance: {
    summary: "+1d4 to one saving throw, then it ends.",
    riders: [
      {
        appliesTo: ["save"],
        rider: {
          rider: "bonusDice",
          count: 1,
          die: StandardDie.d4,
          optional: true,
          note: "one saving throw — remove the condition after using it",
        },
      },
    ],
  },
  Resurrection: {
    summary:
      "-4 penalty to all attack rolls, saving throws, and ability checks from the ordeal of returning to life.",
    riders: [
      {
        appliesTo: ["attack", "save", "check"],
        rider: {
          rider: "bonus",
          value: -4,
          note: "fades by 1 each long rest; the fade itself isn't tracked by this rider — remove the condition manually as it decays",
        },
      },
    ],
  },
  Sanctuary: {
    summary:
      "Anyone targeting the bearer with an attack or harmful spell must first succeed on a Wisdom save or redirect elsewhere.",
    against: [
      {
        appliesTo: ["attack"],
        rider: {
          rider: "advantage",
          note: "make a Wisdom save before attacking — on a failure you must choose a new target or lose the attack",
        },
      },
    ],
  },
  "Searing Smite": {
    summary:
      "Takes ongoing fire damage at the start of each of its turns unless it succeeds on a Constitution save to snuff the flame out.",
  },
  "See Invisibility": {
    summary:
      "Sees invisible creatures and objects, and can see into the Ethereal Plane, for the duration.",
  },
  Sequester: {
    summary:
      "Hidden in suspended animation, invisible and undetectable by divination, not aging until the spell ends.",
  },
  "Shadow Blade": {
    summary:
      "Wields a finesse/light/thrown shadow blade dealing psychic damage, with advantage on attacks against a target in dim light or darkness, for the duration.",
  },
  Shapechange: {
    summary:
      "Transformed into a chosen creature of CR no higher than the caster's level (not a construct or undead), replacing game statistics while keeping alignment, Intelligence, Wisdom, and Charisma.",
  },
  Shield: {
    summary:
      "+5 AC (including against the triggering attack) and immune to magic missile.",
  },
  "Shield of Faith": {
    summary: "+2 AC.",
  },
  Shillelagh: {
    summary:
      "The held club or quarterstaff's damage die becomes a d8, uses the caster's spellcasting ability, and counts as magical.",
  },
  "Shocking Grasp": {
    summary: "Can't take reactions until the start of its next turn.",
  },
  "Sickening Radiance": {
    summary:
      "Gains a level of exhaustion and glows faintly, unable to benefit from being invisible.",
  },
  "Silvery Barbs": {
    summary:
      "Advantage on the next attack roll, ability check, or saving throw made within 1 minute.",
    riders: [
      {
        appliesTo: ["attack", "check", "save"],
        rider: {
          rider: "advantage",
          note: "one attack roll, ability check, or saving throw made within 1 minute, then it ends",
        },
      },
    ],
  },
  "Skill Empowerment": {
    summary: "Doubled proficiency bonus on one chosen skill.",
  },
  Slow: {
    summary:
      "Speed halved, -2 to AC and Dexterity saves, no reactions, and limited to an action or a bonus action (not both) each turn.",
  },
  "Spider Climb": {
    summary:
      "Gains a climbing speed equal to its walking speed and can climb any surface, including upside down, without using its hands.",
  },
  "Spirit Guardians": {
    summary:
      "Speed halved while in the caster's 15-foot radius, and takes radiant or necrotic damage (half on a successful Wisdom save) on entering or starting its turn there.",
  },
  "Spirit Shroud": {
    summary:
      "Attacks that hit a creature within 10 feet deal extra necrotic, radiant, or cold damage (caster's choice) and stop that creature from regaining hit points until the caster's next turn; the caster can also slow nearby creatures by 10 feet.",
  },
  "Staggering Smite": {
    summary:
      "Fights with disadvantage on attacks and ability checks and loses its reactions.",
  },
  Stoneskin: {
    summary:
      "Resistance to nonmagical bludgeoning, piercing, and slashing damage.",
  },
  Suggestion: {
    summary:
      "Compelled to pursue the caster's suggested course of action for the duration.",
  },
  "Swift Quiver": {
    summary: "May fire two extra shots as a bonus action on each of its turns.",
  },
  Symbol: {
    summary:
      "Struck by the glyph's chosen affliction — bickering, despair, incapacitating pain, insanity, stunning, fear, or sleep, per the ward's design.",
  },
  "Synaptic Static": {
    summary:
      "Thoughts scrambled, subtracting a rolled penalty from attack rolls, ability checks, and concentration saves.",
  },
  // Granted by the Open Hand monk's Quivering Palm action, not a spell.
  "Quivering Palm": {
    summary:
      "Carries lethal vibrations for a number of days equal to the monk's level; the monk may end them as a bonus action, forcing a CON save — 0 HP on a failure, 10d10 necrotic on a success.",
  },
  "Tasha's Caustic Brew": {
    summary:
      "Coated in acid, taking the initial damage again at the start of each of its turns until it scrapes the acid off or the spell ends.",
  },
  "Tasha's Mind Whip": {
    summary:
      "Loses its reaction until the end of its next turn, and on that turn can take only one of a move, an action, or a bonus action.",
  },
  "Tasha's Otherworldly Guise": {
    summary:
      "Grants a 40-foot fly speed, +2 AC, planar damage immunity/resistance, magical weapon attacks, and an extra attack (if the caster lacks Extra Attack).",
  },
  "Temporal Shunt": {
    summary:
      "Vanishes from the timestream until the start of its next turn, missing that turn and remembering nothing of the interruption.",
  },
  "Tenser's Transformation": {
    summary:
      "50 temporary hit points, full weapon/armor/shield proficiency, advantage on weapon attack rolls, an extra weapon attack, and bonus force damage on weapon hits.",
    riders: [
      {
        appliesTo: ["attack"],
        rider: {
          rider: "advantage",
          note: "advantage on the bearer's weapon attack rolls",
        },
      },
    ],
  },
  "Tether Essence": {
    summary:
      "Bound to another creature so that any damage or healing one takes, the other takes or receives too, at any distance.",
  },
  "Time Ravage": {
    summary:
      "Aged decades in an instant, leaving disadvantage on attack rolls, ability checks, and saving throws plus halved speed.",
  },
  "Transmute Rock": {
    summary:
      "Mired and slowed in thick mud, or encased and trapped in solid rock until a Strength check or enough force frees it.",
  },
  "Tree Stride": {
    summary:
      "May move from inside one tree to inside another of the same kind within 500 feet, once per round.",
  },
  "True Polymorph": {
    summary:
      "Transformed into a different creature or a nonmagical object (or vice versa), replacing its game statistics while keeping alignment and personality.",
  },
  "True Seeing": {
    summary:
      "Gains truesight, notices magically hidden doors, and can see into the Ethereal Plane, all out to 120 feet.",
  },
  "True Strike": {
    summary:
      "The caster has advantage on their first attack roll against the target on their next turn, then the spell ends.",
    against: [
      {
        appliesTo: ["attack"],
        casterOnly: true,
        rider: {
          rider: "advantage",
          note: "your first attack against it on your next turn, then the spell ends",
        },
      },
    ],
  },
  // Granted by turn features (Turn Undead, Arcane Abjuration, the paladin
  // turns) — one shared name, since "turned" means the same thing wherever
  // it comes from.
  Turned: {
    summary:
      "Turned: must spend its turns trying to move as far from the turner as it can, can't willingly move within 30 ft. of them, and can't take reactions; ends if it takes damage.",
  },
  // Granted by the Eloquence bard's Unsettling Words action, not a spell.
  "Unsettling Words": {
    summary:
      "Subtract the bard's inspiration die from the next saving throw it makes before the start of the bard's next turn.",
    riders: [
      {
        appliesTo: ["save"],
        rider: {
          rider: "advantage",
          note: "subtract the bard's inspiration die from this save",
        },
      },
    ],
  },
  "Vicious Mockery": {
    summary:
      "Disadvantage on the next attack roll it makes before the end of its next turn.",
  },
  // Granted by the Vengeance paladin's Channel Divinity action, not a spell.
  "Vow of Enmity": {
    summary:
      "Sworn enemy of the paladin who vowed: they have advantage on attack rolls against it for 1 minute, or until it drops to 0 HP or falls unconscious.",
    against: [
      {
        appliesTo: ["attack"],
        casterOnly: true,
        rider: {
          rider: "advantage",
          note: "you have advantage on attacks against your sworn enemy",
        },
      },
    ],
  },
  // Granted by the Watchers paladin's Channel Divinity action, not a spell.
  "Watcher's Will": {
    summary:
      "Advantage on Intelligence, Wisdom, and Charisma saving throws for 1 minute.",
    riders: [
      {
        appliesTo: ["save"],
        rider: {
          rider: "advantage",
          note: "advantage on INT, WIS, and CHA saving throws",
        },
      },
    ],
  },
  "Warding Bond": {
    summary:
      "+1 to AC and saving throws and resistance to all damage, while the caster takes any damage the bearer takes.",
    riders: [
      {
        appliesTo: ["save"],
        rider: { rider: "bonus", value: 1 },
      },
    ],
  },
  "Warp Sense": {
    summary:
      "Aware of any planar portal within 30 feet, reaching through most non-metal, non-lead barriers.",
  },
  "Wind Walk": {
    summary:
      "Turned to gaseous cloud form with a 300-foot fly speed and resistance to nonmagical weapon damage.",
  },
  "Zephyr Strike": {
    summary:
      "Movement doesn't provoke opportunity attacks; once before the spell ends, one weapon attack gains advantage and extra force damage on a hit.",
    riders: [
      {
        appliesTo: ["attack"],
        rider: {
          rider: "advantage",
          note: "one weapon attack before the spell ends",
        },
      },
      {
        appliesTo: ["damage"],
        rider: {
          rider: "extraDamage",
          amount: [1, StandardDie.d8, DieOperation.roll],
          damageType: DamageType.Force,
          declareAt: "on-hit",
          optional: true,
          note: "the same one weapon attack the advantage applies to",
        },
      },
    ],
  },
  "Zone of Truth": {
    summary:
      "Can't speak a deliberate lie while it remains within the zone's radius.",
  },
};

// The riders a bearer's active conditions contribute to a roll of this kind.
// Merged beside `ridersFor`'s feature riders at the dialog's collection
// points — conditions live on the encounter, features on the character, and
// neither layer should import the other's store.
export function conditionRiders(
  conditions: ConditionName[],
  kind: RollKind,
): ActiveRider[] {
  return conditions.flatMap((name) => {
    const entry = CONDITION_MECHANICS[name];
    return (entry?.riders ?? [])
      .filter((r) => r.appliesTo.includes(kind))
      .map((r) => ({ source: name, rider: r.rider }));
  });
}

// The riders the chosen *target's* conditions contribute to a roll against
// it. Takes the full ActiveConditions (not just names) because provenance
// gates the caster-only ones: a Hex someone else placed pays you nothing.
export function ridersAgainst(
  targetConditions: { name: ConditionName; from?: string }[],
  selfParticipantId: string | undefined,
  kind: RollKind,
): ActiveRider[] {
  return targetConditions.flatMap((c) => {
    const entry = CONDITION_MECHANICS[c.name];
    return (entry?.against ?? [])
      .filter((r) => r.appliesTo.includes(kind))
      .filter(
        (r) =>
          !r.casterOnly ||
          (!!c.from && !!selfParticipantId && c.from === selfParticipantId),
      )
      .map((r) => ({ source: c.name, rider: r.rider }));
  });
}

// The one-line meaning of a condition, for banners and the seat's queue.
export function conditionSummary(name: ConditionName): string | undefined {
  return CONDITION_MECHANICS[name]?.summary;
}

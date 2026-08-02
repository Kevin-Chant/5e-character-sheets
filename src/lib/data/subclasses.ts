import {
  DamageType,
  REAL_SKILLS,
  SkillName,
  StatKey,
} from "src/lib/data/data-definitions";
import { CatalogSubclass } from "src/lib/builder/types";
import { SUBCLASS_FEATURES } from "src/lib/data/subclass-features";

// The full catalog of official subclasses across every class. Names are the
// value stored on the character (matching the existing free-text field and the
// edit-class-levels datalist), so no migration is needed.
//
// A subclass confers content through two shapes, and which one to use is just
// a question of *when* it lands:
//
// - `grants` fires once, at the level the subclass is *chosen* — the level-1
//   builder for the classes that pick at 1 (cleric, sorcerer, warlock), the
//   level-up wizard for everyone else at their choice level (druid/wizard at 2,
//   the rest at 3). It's the only shape that can grant proficiencies and
//   always-prepared `spellIndices`.
// - `levelFeatures` fires at *each* level the subclass gives something, and is
//   attached below from `data/subclass-features/` (one file per class, because
//   the tables dwarf the entries). Prose only, but it's what makes a 6th/10th/
//   14th-level subclass feature visible at all.
//
// Prefer `levelFeatures` for anything that is feature prose, including at the
// choice level: it keeps a subclass's whole progression in one table. Reserve
// `grants` for proficiencies, spells, and the choice-level-only cases.
//
// Refreshing *pools* a subclass carries (superiority dice, Healing Light) is
// not done here — those live in `builder/class-pools.ts` `SUBCLASS_POOLS`,
// keyed by subclass name, so their sizes re-derive on every level-up. As
// elsewhere, we store only mechanical facts and write original short summaries,
// never published prose. `spellIndices` reference the full bundled catalog
// (SRD + non-SRD); an index that doesn't resolve is silently skipped, so a
// spell still missing from the catalog just isn't handed out.

// Helper to keep entries terse. index is derived from class + name.
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

type Entry = Omit<CatalogSubclass, "index" | "classIndex">;

// Per-level features are attached here rather than written inline: the tables
// are far larger than the entries themselves, and keeping them in one file per
// class (`data/subclass-features/`) is what keeps this catalog readable. An
// entry may still declare `levelFeatures` inline, which wins.
const forClass = (classIndex: string, entries: Entry[]): CatalogSubclass[] =>
  entries.map((e) => ({
    index: `${classIndex}-${slug(e.name)}`,
    classIndex,
    levelFeatures: SUBCLASS_FEATURES[classIndex]?.[e.name],
    ...e,
  }));

export const SUBCLASSES: CatalogSubclass[] = [
  // -------------------------------------------------------------- Barbarian
  ...forClass("barbarian", [
    {
      name: "Ancestral Guardian",
      summary:
        "Call on ancestral spirits to shield and hinder foes who threaten your allies.",
    },
    {
      name: "Battlerager",
      summary:
        "A dwarven berserker who fights in spiked armor and thrives on reckless collisions.",
    },
    {
      name: "Beast",
      summary:
        "Manifest natural weapons — bite, claws, or tail — fueled by a primal beast within.",
    },
    {
      name: "Berserker",
      summary:
        "Give in to a bloody frenzy for extra attacks at the cost of exhaustion.",
      grants: {
        features: [
          {
            title: "Frenzy",
            detail:
              "While raging you can frenzy: make one melee weapon attack as a bonus action each turn, but suffer one level of exhaustion when the rage ends.",
          },
        ],
      },
    },
    {
      name: "Giant",
      summary:
        "Channel the might of giants, growing in size and hurling foes and objects.",
    },
    {
      name: "Storm Herald",
      summary:
        "Your rage radiates an elemental aura of desert, sea, or tundra.",
    },
    {
      name: "Totem Warrior",
      summary:
        "Adopt a spirit animal totem (bear, eagle, wolf, …) for its enduring blessings.",
    },
    {
      name: "Wild Magic",
      summary:
        "Rage taps a font of chaotic magic, triggering random surges each time.",
    },
    {
      name: "Zealot",
      summary:
        "A divine warrior whose fury smites with extra radiant or necrotic damage.",
    },
  ]),
  // -------------------------------------------------------------------- Bard
  ...forClass("bard", [
    {
      name: "Creation",
      summary:
        "Weave the Song of Creation to conjure objects and dancing items.",
    },
    {
      name: "Eloquence",
      summary:
        "A silver-tongued orator whose Bardic Inspiration never wholly fails.",
    },
    {
      name: "Glamour",
      summary: "Wield the beguiling magic of the Feywild to charm and command.",
    },
    {
      name: "Lore",
      summary:
        "A keeper of secrets with extra skills and Cutting Words to foil enemies.",
      grants: {
        skillChoices: { choose: 3, from: REAL_SKILLS },
        features: [
          {
            title: "Bonus Proficiencies",
            detail: "Gain proficiency in three skills of your choice.",
          },
          // Cutting Words is granted as a cross-pool action host (it spends
          // Bardic Inspiration), see SUBCLASS_POOLS["Lore"] — not a prose row.
        ],
      },
    },
    {
      name: "Spirits",
      summary:
        "Tell tales guided by spirits, dealing randomized thematic effects.",
      // Guiding Whispers: the Guidance cantrip, usable at a 60-foot range.
      grants: { spellIndices: ["guidance"] },
    },
    {
      name: "Swords",
      summary:
        "A blade-dancing performer who fights with flourishes and martial skill.",
      // The fighting style (Dueling or Two-Weapon Fighting) is offered by
      // `fightingStyleDueAt`, not granted here.
      grants: {
        proficiencies: { armor: ["Medium Armor"], weapons: ["Scimitar"] },
      },
    },
    {
      name: "Valor",
      summary:
        "An inspiring skald who bolsters allies and holds their own in melee.",
      grants: {
        proficiencies: {
          armor: ["Medium Armor", "Shields"],
          weapons: ["Martial Weapons"],
        },
      },
    },
    {
      name: "Whispers",
      summary:
        "A sinister bard who plants terror and steals the identities of the slain.",
    },
  ]),
  // ------------------------------------------------------------------ Cleric
  ...forClass("cleric", [
    {
      name: "Knowledge",
      summary:
        "A seeker of secrets granted extra skills, languages, and lore magic.",
      grants: {
        spellIndices: ["command", "identify"],
        skillChoices: {
          choose: 2,
          from: [
            SkillName.Arcana,
            SkillName.History,
            SkillName.Nature,
            SkillName.Religion,
          ],
          expertise: true,
        },
        features: [
          {
            title: "Blessings of Knowledge",
            detail:
              "You learn two languages of your choice and gain proficiency (with expertise) in two skills from Arcana, History, Nature, and Religion.",
          },
        ],
      },
    },
    {
      name: "Life",
      summary:
        "A healer of the life domain, wearing heavy armor and mending wounds.",
      grants: {
        proficiencies: { armor: ["Heavy Armor"] },
        spellIndices: ["bless", "cure-wounds"],
        features: [
          {
            title: "Disciple of Life",
            detail:
              "Your healing spells of 1st level or higher restore extra hit points equal to 2 + the spell's level.",
          },
        ],
      },
    },
    {
      name: "Light",
      summary:
        "A radiant cleric who wards allies with flares and burns foes with fire.",
      grants: {
        // Bonus Cantrip's Light rides along with the domain spells.
        spellIndices: ["burning-hands", "faerie-fire", "light"],
        features: [
          {
            title: "Bonus Cantrip",
            detail: "You know the Light cantrip if you don't already.",
          },
          {
            title: "Warding Flare",
            detail:
              "When attacked by a creature you can see, you can use your reaction to impose disadvantage on its attack roll. Uses equal to your Wisdom modifier per long rest.",
          },
        ],
      },
    },
    {
      name: "Nature",
      summary:
        "A druidic priest of the wilds with heavy armor and a nature cantrip.",
      grants: {
        proficiencies: { armor: ["Heavy Armor"] },
        spellIndices: ["animal-friendship", "speak-with-animals"],
        features: [
          {
            title: "Acolyte of Nature",
            detail:
              "You learn one druid cantrip and gain proficiency in one of Animal Handling, Nature, or Survival.",
          },
        ],
      },
    },
    {
      name: "Tempest",
      summary:
        "A storm-caller wielding heavy armor, martial weapons, and thunderous wrath.",
      grants: {
        proficiencies: { armor: ["Heavy Armor"], weapons: ["Martial Weapons"] },
        spellIndices: ["fog-cloud", "thunderwave"],
        features: [
          {
            title: "Wrath of the Storm",
            detail:
              "When a creature within 5 feet hits you, you can use your reaction to deal lightning or thunder damage (2d8, halved on a save). Uses equal to your Wisdom modifier per long rest.",
          },
        ],
      },
    },
    {
      name: "Trickery",
      summary:
        "A cunning priest of illusion and misdirection who blesses allies with stealth.",
      grants: {
        spellIndices: ["charm-person", "disguise-self"],
        features: [
          {
            title: "Blessing of the Trickster",
            detail:
              "You can touch a willing creature (other than yourself) to give it advantage on Dexterity (Stealth) checks for 1 hour.",
          },
        ],
      },
    },
    {
      name: "War",
      summary:
        "A martial priest granted heavy armor, martial weapons, and bonus attacks.",
      grants: {
        proficiencies: { armor: ["Heavy Armor"], weapons: ["Martial Weapons"] },
        spellIndices: ["divine-favor", "shield-of-faith"],
        features: [
          {
            title: "War Priest",
            detail:
              "When you take the Attack action, you can make one weapon attack as a bonus action. Uses equal to your Wisdom modifier per long rest.",
          },
        ],
      },
    },
    {
      name: "Death",
      summary:
        "A cleric of the death domain who reaps foes with enhanced necromancy.",
      grants: {
        proficiencies: { weapons: ["Martial Weapons"] },
        spellIndices: ["false-life", "ray-of-sickness"],
        features: [
          {
            title: "Reaper",
            detail:
              "You learn one necromancy cantrip from any spell list. When you cast a single-target necromancy cantrip, it can target two creatures within 5 feet of each other.",
          },
        ],
      },
    },
    {
      name: "Forge",
      summary:
        "A smith-priest who blesses arms and armor with heavy armor and tool skill.",
      grants: {
        proficiencies: { armor: ["Heavy Armor"], tools: ["Smith's Tools"] },
        spellIndices: ["identify", "searing-smite"],
        features: [
          {
            title: "Blessing of the Forge",
            detail:
              "After a long rest you can touch a nonmagical weapon or suit of armor, granting a +1 bonus to AC or to attack and damage rolls until you use this feature again. Your domain spells also include Searing Smite.",
          },
        ],
      },
    },
    {
      name: "Grave",
      summary:
        "A tender of the boundary between life and death, magnifying healing and marking foes.",
      grants: {
        // Circle of Mortality's Spare the Dying rides along with the domain
        // spells (its bonus-action/30-foot upgrades stay in the prose).
        spellIndices: ["bane", "false-life", "spare-the-dying"],
        features: [
          {
            title: "Circle of Mortality",
            detail:
              "You gain the Spare the Dying cantrip (cast as a bonus action at range), and your healing spells restore the maximum roll to creatures at 0 hit points.",
          },
          {
            title: "Eyes of the Grave",
            detail:
              "As an action you can sense undead within 60 feet for up to a minute. Uses equal to your Wisdom modifier per long rest.",
          },
        ],
      },
    },
    {
      name: "Order",
      summary:
        "A disciplined priest of law with heavy armor and commanding social presence.",
      grants: {
        proficiencies: { armor: ["Heavy Armor"] },
        spellIndices: ["command", "heroism"],
        features: [
          {
            title: "Bonus Proficiency",
            detail:
              "You gain proficiency in the Intimidation or Persuasion skill.",
          },
          {
            title: "Voice of Authority",
            detail:
              "When you cast a spell of 1st level or higher on an ally, that ally can use its reaction to make one weapon attack against a creature you attacked this turn.",
          },
        ],
      },
    },
    {
      name: "Peace",
      summary:
        "A binder of communities who links allies to share fortune and defense.",
      grants: {
        spellIndices: ["heroism", "sanctuary"],
        features: [
          {
            title: "Implement of Peace",
            detail:
              "You gain proficiency in the Insight, Performance, or Persuasion skill.",
          },
          {
            title: "Emboldening Bond",
            detail:
              "You can bond a few creatures together for 10 minutes; once per turn a bonded creature within 30 feet of another can add a d4 to an attack, check, or save.",
          },
        ],
      },
    },
    {
      name: "Twilight",
      summary:
        "A guardian of the night granting darkvision, heavy armor, and comforting gloom.",
      grants: {
        proficiencies: { armor: ["Heavy Armor"], weapons: ["Martial Weapons"] },
        spellIndices: ["faerie-fire", "sleep"],
        features: [
          {
            title: "Eyes of Night",
            detail:
              "You have darkvision out to 300 feet, and you can share it with allies for the day. Uses to share equal to your Wisdom modifier per long rest.",
          },
          {
            title: "Vigilant Blessing",
            detail:
              "As an action you give one creature (or yourself) advantage on the next initiative roll before your next rest.",
          },
        ],
      },
      // Eyes of Night's own 300-foot darkvision (sharing it stays prose).
      levelEffects: { 1: { senses: { darkvision: 300 } } },
    },
    {
      name: "Arcana",
      summary:
        "A student of the weave who wields wizard cantrips and arcane lore.",
      grants: {
        proficiencies: { skills: [SkillName.Arcana] },
        spellIndices: ["detect-magic", "magic-missile"],
        features: [
          {
            title: "Arcane Initiate",
            detail:
              "You gain proficiency in the Arcana skill and learn two wizard cantrips of your choice, cast with Wisdom.",
          },
        ],
      },
    },
  ]),
  // ------------------------------------------------------------------- Druid
  ...forClass("druid", [
    {
      name: "Land",
      summary:
        "Draw on the magic of a chosen terrain for extra spells and recovery.",
      grants: {
        features: [
          {
            title: "Bonus Cantrip",
            detail: "Learn one extra druid cantrip of your choice.",
          },
        ],
      },
    },
  ]),
  ...forClass("druid", [
    {
      name: "Dreams",
      summary:
        "A fey-touched druid who channels the Feywild's comfort to heal and ferry allies.",
    },
    {
      name: "Moon",
      summary:
        "A shapeshifting warrior who fights in beast form and takes on ever more dangerous shapes.",
    },
    {
      name: "Shepherd",
      summary:
        "A protector who calls on spirit totems and bolsters summoned allies.",
    },
    {
      name: "Spores",
      summary:
        "A druid bonded to a symbiotic fungus that feeds on death and decay.",
    },
    {
      name: "Stars",
      summary:
        "A reader of constellations who draws starlight into a luminous battle form.",
      grants: {
        // Star Map: Guidance as a known cantrip, Guiding Bolt always prepared.
        // A one-off grant at the choice level, not a growing circle table.
        spellIndices: ["guidance", "guiding-bolt"],
      },
    },
    {
      name: "Wildfire",
      summary:
        "A druid bonded to an elemental fire spirit that burns away growth to renew it.",
    },
  ]),
  // ----------------------------------------------------------------- Fighter
  ...forClass("fighter", [
    {
      name: "Arcane Archer",
      summary: "An elven marksman who imbues arrows with magical effects.",
    },
    {
      name: "Banneret",
      summary:
        "A rallying knight (Purple Dragon Knight) who inspires and shields comrades.",
      // Royal Envoy's Persuasion, arriving at 7th — past the choice level, so
      // it rides `levelEffects` rather than `grants`. Its expertise clause and
      // the already-proficient fallback stay in the feature prose.
      levelEffects: { 7: { skills: [SkillName.Persuasion] } },
    },
    {
      name: "Battle Master",
      summary:
        "A tactician wielding combat maneuvers powered by superiority dice.",
      grants: {
        features: [
          {
            title: "Combat Superiority",
            detail:
              "Learn three maneuvers fueled by superiority dice (d8s); one maneuver per attack. Maneuver save DC is 8 + PB + STR or DEX modifier.",
          },
          {
            title: "Student of War",
            detail: "Gain proficiency with one type of artisan's tools.",
          },
        ],
      },
    },
    {
      name: "Cavalier",
      summary:
        "A mounted or frontline defender who locks down and punishes foes.",
    },
    {
      name: "Champion",
      summary:
        "A straightforward warrior with improved criticals and athletic prowess.",
      grants: {
        features: [
          {
            title: "Improved Critical",
            detail: "Your weapon attacks score a critical hit on a 19 or 20.",
          },
        ],
      },
    },
    {
      name: "Echo Knight",
      summary: "Summon a spectral echo of yourself to strike and reposition.",
    },
    {
      name: "Eldritch Knight",
      summary:
        "A fighter who blends abjuration and evocation magic with swordplay.",
    },
    {
      name: "Psi Warrior",
      summary:
        "A soldier channeling psionic energy to shield, shove, and strike.",
    },
    {
      name: "Rune Knight",
      summary: "Inscribe giant runes to grow in size and gain magical boons.",
      // Bonus Proficiencies; the Giant language is named in the prose.
      grants: { proficiencies: { tools: ["Smith's Tools"] } },
    },
    {
      name: "Samurai",
      summary:
        "A resolute warrior whose fighting spirit grants bursts of relentless focus.",
      grants: {
        features: [
          {
            title: "Fighting Spirit",
            detail:
              "As a bonus action, gain advantage on weapon attack rolls until the end of the turn and temporary hit points (5, rising at higher levels).",
          },
          {
            title: "Bonus Proficiency",
            detail:
              "Gain proficiency in History, Insight, Performance, or Persuasion — or learn a language.",
          },
        ],
      },
    },
  ]),
  // -------------------------------------------------------------------- Monk
  ...forClass("monk", [
    {
      name: "Astral Self",
      summary:
        "Manifest ghostly astral arms and a guardian visage of your true self.",
    },
    {
      name: "Ascendant Dragon",
      summary:
        "Channel draconic might into breath, wings, and elemental strikes.",
    },
    {
      name: "Drunken Master",
      summary: "A staggering, unpredictable fighter who flows between foes.",
      grants: {
        proficiencies: {
          skills: [SkillName.Performance],
          tools: ["Brewer's Supplies"],
        },
      },
    },
    {
      name: "Four Elements",
      summary: "Bend ki into elemental disciplines resembling spells.",
    },
    {
      name: "Kensei",
      summary: "A weapon master who extends martial arts to chosen weapons.",
    },
    {
      name: "Long Death",
      summary:
        "A morbid monk who feeds on nearby death to endure and frighten.",
    },
    {
      name: "Mercy",
      summary:
        "A wandering medic who heals with one hand and harms with the other.",
      // Implements of Mercy.
      grants: {
        proficiencies: {
          skills: [SkillName.Insight, SkillName.Medicine],
          tools: ["Herbalism Kit"],
        },
      },
    },
    {
      name: "Open Hand",
      summary:
        "The classic martial artist with versatile Flurry-of-Blows techniques.",
      grants: {
        features: [
          {
            title: "Open Hand Technique",
            detail:
              "When you hit with a Flurry of Blows attack, you can knock the target prone (DEX save), push it 15 ft. (STR save), or deny its reactions until the end of your next turn.",
          },
        ],
      },
    },
    {
      name: "Shadow",
      summary:
        "A ninja-like monk who bends shadow for stealth and teleportation.",
      // Shadow Arts: Minor Illusion; the ki-cast spells stay in the prose.
      grants: { spellIndices: ["minor-illusion"] },
    },
    {
      name: "Sun Soul",
      summary: "Hurl radiant bolts and bursts of searing light.",
    },
  ]),
  // ----------------------------------------------------------------- Paladin
  ...forClass("paladin", [
    {
      name: "Devotion",
      summary:
        "The archetypal knight's oath: honesty, courage, and radiant purity.",
      // Channel Divinity options are cross-pool action hosts, see
      // SUBCLASS_ACTION_HOSTS["Devotion"] — not prose grants.
      grants: {
        spellIndices: ["protection-from-evil-and-good", "sanctuary"],
        // Oath spells always prepared as the paladin levels.
        spellIndicesByLevel: {
          5: ["lesser-restoration", "zone-of-truth"],
          9: ["beacon-of-hope", "dispel-magic"],
          13: ["freedom-of-movement", "guardian-of-faith"],
          17: ["commune", "flame-strike"],
        },
      },
    },
  ]),
  ...forClass("paladin", [
    {
      name: "Vengeance",
      summary: "An avenger's oath: punish the wicked, whatever the cost.",
      // Channel Divinity options are cross-pool action hosts, see
      // SUBCLASS_ACTION_HOSTS["Vengeance"] — not prose grants.
      grants: {
        spellIndices: ["bane", "hunters-mark"],
      },
    },
  ]),
  ...forClass("paladin", [
    {
      name: "Ancients",
      summary:
        "An oath of the old ways: guard the light and joy of the world against despair.",
    },
    {
      name: "Conquest",
      summary:
        "A tyrant's oath: rule through fear, breaking an enemy's will before their body.",
    },
    {
      name: "Crown",
      summary:
        "An oath of duty: uphold the social order and shield your people at any personal cost.",
    },
    {
      name: "Glory",
      summary:
        "An oath of legend: chase glorious deeds and drive others past their limits.",
    },
    {
      name: "Redemption",
      summary:
        "A pacifist's oath: turn aside violence and offer even the wicked a path to change.",
    },
    {
      name: "Watchers",
      summary:
        "A sentinel's oath: stand ready against incursions from beyond the material world.",
    },
    {
      name: "Oathbreaker",
      summary:
        "A broken vow: power drawn from betrayal, wielded in service of tyranny and undeath.",
    },
  ]),
  // ------------------------------------------------------------------ Ranger
  ...forClass("ranger", [
    {
      name: "Beast Master",
      summary: "Bond with a loyal animal companion that fights at your side.",
    },
    {
      name: "Fey Wanderer",
      summary:
        "A charming, fey-touched hunter with extra psychic damage and social magic.",
      // Otherworldly Glamour's skill pick.
      grants: {
        skillChoices: {
          choose: 1,
          from: [
            SkillName.Deception,
            SkillName.Performance,
            SkillName.Persuasion,
          ],
        },
      },
    },
    {
      name: "Gloom Stalker",
      summary:
        "An ambusher of the dark, striking hard from unseen and dread-inducing.",
      // Dread Ambusher's initiative bonus and Umbral Sight's darkvision (its
      // +30 for existing darkvision can't be modeled — 60 is the floor), then
      // Iron Mind's Wisdom saves at 7th.
      levelEffects: {
        3: { initiativeAbility: StatKey.wis, senses: { darkvision: 60 } },
        7: { savingThrows: [StatKey.wis] },
      },
    },
    {
      name: "Horizon Walker",
      summary:
        "A planar guardian who deals force damage and steps between spaces.",
    },
    {
      name: "Hunter",
      summary:
        "A versatile monster-hunter with tactical options against many foes.",
      // Hunter's Prey now lives in the level table with the rest of the tiered
      // picks (7/11/15), rather than alone here at the choice level.
    },
    {
      name: "Monster Slayer",
      summary:
        "A tracker who exposes and counters a marked quarry's magic and attacks.",
    },
    {
      name: "Swarmkeeper",
      summary:
        "Accompanied by a swarm of nature spirits that harry and reposition.",
    },
    {
      name: "Drakewarden",
      summary: "Summon a draconic drake companion that grows with you.",
    },
  ]),
  // ------------------------------------------------------------------- Rogue
  ...forClass("rogue", [
    {
      name: "Arcane Trickster",
      summary:
        "A magical thief blending enchantment and illusion with sneak attacks.",
      // Spellcasting's fixed cantrip; the chosen cantrips and spells arrive
      // through the level-up wizard like any other learned spell.
      grants: { spellIndices: ["mage-hand"] },
    },
    {
      name: "Assassin",
      summary: "A killer who excels at disguise and lethal surprise strikes.",
      grants: {
        proficiencies: { tools: ["Disguise Kit", "Poisoner's Kit"] },
      },
    },
    {
      name: "Inquisitive",
      summary:
        "A sharp-eyed detective who reads foes and exploits their tells.",
    },
    {
      name: "Mastermind",
      summary: "A schemer of intrigue who aids allies and mimics others.",
      // Master of Intrigue's fixed kits; the gaming set and two languages are
      // choices, named in the feature prose.
      grants: {
        proficiencies: { tools: ["Disguise Kit", "Forgery Kit"] },
      },
    },
    {
      name: "Phantom",
      summary:
        "A death-touched rogue who steals skills and haunts with spectral wails.",
    },
    {
      name: "Scout",
      summary: "A skirmisher of the wilds, mobile and hard to pin down.",
      // Survivalist: both skills, with expertise, no choice.
      grants: {
        expertiseSkills: [SkillName.Nature, SkillName.Survival],
      },
    },
    {
      name: "Soulknife",
      summary: "A psionic rogue who manifests blades of psychic energy.",
    },
    {
      name: "Swashbuckler",
      summary: "A dashing duelist who fights with panache and mobility.",
      // Rakish Audacity's initiative bonus; its Sneak Attack clause is prose.
      levelEffects: { 3: { initiativeAbility: StatKey.cha } },
    },
    {
      name: "Thief",
      summary: "A nimble burglar with fast hands and second-story work.",
      grants: {
        features: [
          {
            title: "Fast Hands",
            detail:
              "Use Cunning Action's bonus action to make Sleight of Hand checks, use thieves' tools, or Use an Object.",
          },
          {
            title: "Second-Story Work",
            detail:
              "Climbing costs no extra movement; running jump distance increases by your DEX modifier in feet.",
          },
        ],
      },
    },
  ]),
  // --------------------------------------------------------------- Sorcerer
  ...forClass("sorcerer", [
    {
      name: "Draconic Bloodline",
      summary:
        "Dragon-blooded magic granting tougher hide and elemental affinity.",
      grants: {
        features: [
          {
            title: "Dragon Ancestor",
            detail:
              "You choose a dragon type. You can speak, read, and write Draconic, and you double your proficiency bonus on Charisma checks when interacting with dragons.",
          },
          {
            title: "Draconic Resilience",
            detail:
              "Your hit point maximum increases by 1 per sorcerer level. While you wear no armor, your base AC is 13 + your Dexterity modifier.",
          },
        ],
      },
      // Dragon Wings: a flying speed equal to the walking speed it's read from.
      levelEffects: { 14: { speeds: { fly: "walk" } } },
    },
    {
      name: "Wild Magic",
      summary:
        "Chaotic power that triggers unpredictable surges and bends luck.",
      grants: {
        features: [
          {
            title: "Wild Magic Surge",
            detail:
              "Your spellcasting can spark random magical effects, which the DM may trigger after you cast a sorcerer spell of 1st level or higher.",
          },
          {
            title: "Tides of Chaos",
            detail:
              "You can gain advantage on one attack roll, ability check, or saving throw. Once used, you regain it after a long rest (or sooner if a surge occurs).",
          },
        ],
      },
    },
    {
      name: "Divine Soul",
      summary:
        "Celestial or fiendish heritage opening the cleric spell list to your sorcery.",
      grants: {
        features: [
          {
            title: "Divine Magic",
            detail:
              "You can draw spells from the cleric list, and an affinity (good, evil, law, chaos, or neutrality) grants you one always-known bonus spell.",
          },
          {
            title: "Favored by the Gods",
            detail:
              "If you fail a save or miss with an attack, you can add 2d4 to the roll. Once per short or long rest.",
          },
        ],
      },
    },
    {
      name: "Lunar Sorcery",
      summary:
        "Magic drawn from the phases of the moon, shifting between three aspects.",
      grants: {
        features: [
          {
            title: "Strand of the Moon",
            detail:
              "You learn extra spells tied to lunar phases and gain the Sacred Flame cantrip. As a bonus action you can shift between a full-, new-, or crescent-moon phase.",
          },
        ],
        // Sacred Flame; the Lunar Embodiment tiers live in the sorcerer
        // subclass-spells table.
        spellIndices: ["sacred-flame"],
      },
    },
    {
      name: "Shadow Magic",
      summary:
        "Power of the Shadowfell granting darkvision and grim resilience.",
      grants: {
        features: [
          {
            title: "Eyes of the Dark",
            detail:
              "You have darkvision out to 120 feet, and you can spend sorcery points to cast Darkness that you can see through.",
          },
          {
            title: "Strength of the Grave",
            detail:
              "When damage would drop you to 0 hit points, you can make a Charisma save to drop to 1 instead. Once per long rest.",
          },
        ],
        // Eyes of the Dark's Darkness-casting (and the spell itself) comes
        // online at 3rd level, not at the level-1 subclass pick.
        spellIndicesByLevel: { 3: ["darkness"] },
      },
      // Eyes of the Dark's own 120-foot darkvision.
      levelEffects: { 1: { senses: { darkvision: 120 } } },
    },
    {
      name: "Storm Sorcery",
      summary: "Elemental air and sea magic that carries you on the wind.",
      grants: {
        features: [
          {
            title: "Wind Speaker",
            detail:
              "You can speak, read, and write Primordial and its dialects.",
          },
          {
            title: "Tempestuous Magic",
            detail:
              "After casting a spell of 1st level or higher, you can use a bonus action to fly 10 feet without provoking opportunity attacks.",
          },
        ],
      },
      // Heart of the Storm's resistances, then Wind Soul's upgrade to immunity
      // plus a flying speed. Merging, not replacing: the 6th-level resistances
      // stay listed, which is harmless once the immunity supersedes them.
      levelEffects: {
        6: { resistances: [DamageType.Lightning, DamageType.Thunder] },
        18: {
          immunities: [DamageType.Lightning, DamageType.Thunder],
          speeds: { fly: 60 },
        },
      },
    },
    {
      name: "Aberrant Mind",
      summary:
        "Alien psionic power granting telepathy and mind-warping spells.",
      grants: {
        features: [
          {
            title: "Psionic Spells",
            detail:
              "You learn additional aberrant spells and can cast some of them by spending sorcery points instead of spell slots.",
          },
          {
            title: "Telepathic Speech",
            detail:
              "As a bonus action you can form a telepathic link with a creature you can see for a time based on your level.",
          },
        ],
      },
    },
    {
      name: "Clockwork Soul",
      summary:
        "Order-aligned magic from Mechanus that restores balance and warps probability.",
      grants: {
        features: [
          {
            title: "Clockwork Magic",
            detail:
              "You learn additional spells of order and protection tied to the plane of absolute law.",
          },
          {
            title: "Restore Balance",
            detail:
              "When a creature you can see rolls with advantage or disadvantage, you can cancel it. Uses equal to your proficiency bonus per long rest.",
          },
        ],
        // The two 1st-level Clockwork Magic spells that exist in the bundled
        // SRD catalog; the rest are named in the level table's detail.
        spellIndices: ["alarm", "protection-from-evil-and-good"],
      },
    },
  ]),
  // ----------------------------------------------------------------- Warlock
  ...forClass("warlock", [
    {
      name: "Archfey",
      summary:
        "A pact with a lord or lady of the Feywild, master of charm and fear.",
      grants: {
        features: [
          {
            title: "Fey Presence",
            detail:
              "As an action you can charm or frighten nearby creatures until the end of your next turn (Wisdom save negates). Once per short or long rest. Your expanded spells include faerie fire and sleep.",
          },
        ],
      },
    },
    {
      name: "Celestial",
      summary:
        "A pact with an empyreal being, blending radiant magic with healing.",
      grants: {
        features: [
          {
            title: "Bonus Cantrips",
            detail: "You learn the Light and Sacred Flame cantrips.",
          },
          {
            title: "Healing Light",
            detail:
              "You have a pool of d6s (1 + your warlock level) you can spend as a bonus action to heal a creature within 60 feet, refreshed on a long rest.",
          },
        ],
        spellIndices: ["light", "sacred-flame"],
      },
    },
    {
      name: "Fathomless",
      summary:
        "A pact with a leviathan of the deep, wielding tentacles and the tide.",
      grants: {
        features: [
          {
            title: "Tentacle of the Deep",
            detail:
              "As a bonus action you can summon a spectral tentacle for a minute that lashes a creature (cold damage and reduced speed). Uses equal to your proficiency bonus per long rest.",
          },
          {
            title: "Gift of the Sea",
            detail:
              "You gain a swimming speed of 40 feet and can breathe underwater.",
          },
        ],
      },
      // Gift of the Sea's swimming speed.
      levelEffects: { 1: { speeds: { swim: 40 } } },
    },
    {
      name: "Fiend",
      summary: "A pact with a devil or demon, rewarding you when foes fall.",
      grants: {
        features: [
          {
            title: "Dark One's Blessing",
            detail:
              "When you reduce a hostile creature to 0 hit points, you gain temporary hit points equal to your Charisma modifier + your warlock level. Your expanded spells include burning hands and command.",
          },
        ],
      },
    },
    {
      name: "Genie",
      summary:
        "A pact with a noble djinni, dao, efreeti, or marid and its wondrous vessel.",
      grants: {
        features: [
          {
            title: "Genie's Vessel",
            detail:
              "You gain a tiny magical vessel; once per long rest as a bonus action you can deal bonus elemental damage (matching your patron) on a hit. At higher levels you can retreat inside the vessel.",
          },
        ],
      },
    },
    {
      name: "Great Old One",
      summary:
        "A pact with an alien entity, gifting telepathy and psychic influence.",
      grants: {
        features: [
          {
            title: "Awakened Mind",
            detail:
              "You can telepathically speak to any creature you can see within 30 feet, so long as it knows a language. Your expanded spells include dissonant whispers and Tasha's hideous laughter.",
          },
        ],
      },
    },
    {
      name: "Hexblade",
      summary:
        "A pact with a sentient weapon of shadow, arming you for melee spellcasting.",
      grants: {
        proficiencies: {
          armor: ["Medium Armor", "Shields"],
          weapons: ["Martial Weapons"],
        },
        features: [
          {
            title: "Hexblade's Curse",
            detail:
              "As a bonus action you curse a creature for a minute, dealing extra damage to it, scoring critical hits on 19–20 against it, and regaining hit points when it dies. Once per short or long rest.",
          },
          {
            title: "Hex Warrior",
            detail:
              "You gain proficiency with medium armor, shields, and martial weapons. Once per long rest you can bond with a weapon to attack with Charisma instead of Strength or Dexterity.",
          },
        ],
      },
    },
    {
      name: "Undead",
      summary:
        "A pact with a deathless horror, letting you assume a form of dread.",
      grants: {
        features: [
          {
            title: "Form of Dread",
            detail:
              "As a bonus action you transform for a minute, gaining temporary hit points, immunity to fright, and the ability to frighten a creature you hit once each turn. Uses equal to your proficiency bonus per long rest.",
          },
        ],
      },
    },
    {
      name: "Undying",
      summary:
        "A pact with a being that has cheated death, sharing its stubborn vitality.",
      grants: {
        features: [
          {
            title: "Among the Dead",
            detail:
              "You learn the Spare the Dying cantrip (cast at range), have advantage on saves against disease, and undead have trouble harming you unless they best your will.",
          },
        ],
        spellIndices: ["spare-the-dying"],
      },
    },
  ]),
  // ------------------------------------------------------------------ Wizard
  ...forClass("wizard", [
    {
      name: "Evocation",
      summary:
        "Sculpt destructive energies to spare allies caught in the blast.",
      grants: {
        features: [
          {
            title: "Evocation Savant",
            detail:
              "Copying an evocation spell into your spellbook takes half the usual gold and time.",
          },
          {
            title: "Sculpt Spells",
            detail:
              "When you cast an evocation spell, choose up to 1 + the spell's level creatures to automatically succeed on their saves and take no damage from it.",
          },
        ],
      },
    },
  ]),
  ...forClass("wizard", [
    {
      name: "Abjuration",
      summary:
        "A defensive caster shielded by a ward that absorbs damage and recharges on protective magic.",
    },
    {
      name: "Bladesinging",
      summary:
        "An elven duelist who weaves spellcraft and swordplay into one graceful defence.",
      grants: {
        // Training in War and Song: the one-handed melee weapon is the player's
        // choice (named in the feature); armor and Performance are fixed.
        proficiencies: {
          armor: ["Light Armor"],
          skills: [SkillName.Performance],
        },
      },
    },
    {
      name: "Chronurgy",
      summary:
        "A time-mage who nudges rolls and freezes moments to bend fate into shape.",
    },
    {
      name: "Conjuration",
      summary:
        "A caster who bends space to summon objects and creatures and to slip away from danger.",
    },
    {
      name: "Divination",
      summary:
        "A seer who reads the threads of fate and replaces rolls with foreseen results.",
    },
    {
      name: "Enchantment",
      summary:
        "A charmer who bends minds and turns enemies against one another.",
    },
    {
      name: "Graviturgy",
      summary:
        "A gravity-mage who crushes, flings, and anchors foes with unseen weight.",
    },
    {
      name: "Illusion",
      summary:
        "A trickster who blurs what is real, sometimes hard enough to make it so.",
      // Improved Minor Illusion (the already-know-it fallback is a manual pick).
      grants: { spellIndices: ["minor-illusion"] },
    },
    {
      name: "Necromancy",
      summary:
        "A death-caster who drains life from the slain and commands the risen.",
      // Undead Thralls adds Animate Dead to the spellbook at 6th.
      grants: { spellIndicesByLevel: { 6: ["animate-dead"] } },
    },
    {
      name: "Order of Scribes",
      summary:
        "A living archivist bonded to an awakened spellbook that speaks and fights alongside them.",
    },
    {
      name: "Transmutation",
      summary:
        "A shaper of matter who reworks objects, stone, and eventually their own body.",
      // Shapechanger adds Polymorph to the spellbook at 10th.
      grants: { spellIndicesByLevel: { 10: ["polymorph"] } },
    },
    {
      name: "War Magic",
      summary:
        "A battle-caster who turns spellcraft into a duelist's parries and ripostes.",
    },
  ]),
  // --------------------------------------------------------------- Artificer
  ...forClass("artificer", [
    // Each specialist's "already proficient" fallback (a different artisan's
    // tool) is a manual pick; the fixed grant is what lands here.
    {
      name: "Alchemist",
      summary: "Brew experimental elixirs that heal, harm, and enhance.",
      grants: { proficiencies: { tools: ["Alchemist's Supplies"] } },
    },
    {
      name: "Armorer",
      summary:
        "Wear arcane power armor configured for defense or infiltration.",
      grants: {
        proficiencies: { armor: ["Heavy Armor"], tools: ["Smith's Tools"] },
      },
    },
    {
      name: "Artillerist",
      summary: "Deploy an eldritch cannon that blasts, protects, or defends.",
      grants: { proficiencies: { tools: ["Woodcarver's Tools"] } },
    },
    {
      name: "Battle Smith",
      summary: "Fight alongside a loyal steel defender construct.",
      grants: {
        proficiencies: {
          weapons: ["Martial Weapons"],
          tools: ["Smith's Tools"],
        },
      },
    },
  ]),
];

import { PB, StatKey } from "src/lib/data/data-definitions";
import { Feat } from "src/lib/builder/types";

// The official 5e feat catalog. Only Grappler ships in the open SRD, so — as
// with the subclass and non-SRD race catalogs — we store only mechanical facts
// and write original short summaries/effect paraphrases, never published prose.
// `abilityIncrease` marks a half-feat (raise one of `from` by `by`); `grants`
// carries the mechanically-enforced parts. Situational combat rules (GWM's
// -5/+10, Sentinel's reactions, …) have no home in the sheet model and stay as
// `effect` prose only. A few feats with a concrete but unmodelled effect
// (Durable's hit-die minimum, Observant's passive bonus, Heavy Armor Master's
// damage reduction) likewise remain text until the sheet grows a home for them.

const ALL_STATS = [
  StatKey.str,
  StatKey.dex,
  StatKey.con,
  StatKey.int,
  StatKey.wis,
  StatKey.cha,
];
const MENTAL = [StatKey.int, StatKey.wis, StatKey.cha];

export const FEATS: Feat[] = [
  // ---- Half-feats (grant an ability score increase) ----
  {
    index: "actor",
    name: "Actor",
    summary: "A master of disguise and mimicry.",
    abilityIncrease: { by: 1, from: [StatKey.cha] },
    effect:
      "You have advantage on Deception and Performance checks made to pass yourself off as someone else, and you can mimic the speech or sounds of others you've heard.",
  },
  {
    index: "athlete",
    name: "Athlete",
    summary: "Nimble and physically honed.",
    abilityIncrease: { by: 1, from: [StatKey.str, StatKey.dex] },
    effect:
      "Standing up from prone costs only 5 feet of movement, climbing doesn't cost extra movement, and you can make a running long/high jump after only 5 feet of run-up.",
  },
  {
    index: "chef",
    name: "Chef",
    summary: "A cook who bolsters allies with food.",
    abilityIncrease: { by: 1, from: [StatKey.con, StatKey.wis] },
    effect:
      "During a short rest you can cook food that lets allies regain extra hit points, and after a long rest you can bake a number of treats equal to your proficiency bonus that each grant temporary hit points.",
    grants: {
      tools: ["Cook's Utensils"],
      limitedUse: {
        name: "Chef's Treats",
        detail:
          "Baked over a long rest; each treat a creature eats grants temporary hit points. You bake a number equal to your proficiency bonus.",
        maxUses: PB,
        recharge: "long",
      },
    },
  },
  {
    index: "durable",
    name: "Durable",
    summary: "Tough and quick to recover.",
    abilityIncrease: { by: 1, from: [StatKey.con] },
    effect:
      "When you roll Hit Dice to regain hit points, the minimum you regain per die is twice your Constitution modifier (minimum 2).",
  },
  {
    index: "fey-touched",
    name: "Fey Touched",
    summary: "Touched by the Feywild's magic.",
    abilityIncrease: { by: 1, from: MENTAL },
    effect:
      "You learn Misty Step and one 1st-level divination or enchantment spell, castable once per long rest without a slot (or with a slot of the appropriate level), using the ability increased by this feat.",
    grants: {
      fixedSpells: ["misty-step"],
      chooseSpells: [{ level: 1, count: 1 }],
    },
  },
  {
    index: "shadow-touched",
    name: "Shadow Touched",
    summary: "Steeped in shadow magic.",
    abilityIncrease: { by: 1, from: MENTAL },
    effect:
      "You learn Invisibility and one 1st-level illusion or necromancy spell, castable once per long rest without a slot, using the ability increased by this feat.",
    grants: {
      fixedSpells: ["invisibility"],
      chooseSpells: [{ level: 1, count: 1 }],
    },
  },
  {
    index: "telekinetic",
    name: "Telekinetic",
    summary: "Shove foes with your mind.",
    abilityIncrease: { by: 1, from: MENTAL },
    effect:
      "You learn the Mage Hand cantrip (invisible, longer range) and can use a bonus action to telekinetically shove a creature 5 feet (Strength save negates), using the ability increased by this feat.",
    grants: { fixedCantrips: ["mage-hand"] },
  },
  {
    index: "telepathic",
    name: "Telepathic",
    summary: "Speak mind to mind.",
    abilityIncrease: { by: 1, from: MENTAL },
    effect:
      "You can speak telepathically to any creature within 60 feet, and you can cast Detect Thoughts once per long rest without a slot, using the ability increased by this feat.",
    grants: { fixedSpells: ["detect-thoughts"] },
  },
  {
    index: "resilient",
    name: "Resilient",
    summary: "Shore up a weak saving throw.",
    abilityIncrease: { by: 1, from: ALL_STATS },
    effect:
      "You gain proficiency in saving throws using the ability score increased by this feat.",
    grants: { savingThrowFromAbility: true },
  },
  {
    index: "skill-expert",
    name: "Skill Expert",
    summary: "Broaden and deepen your skills.",
    abilityIncrease: { by: 1, from: ALL_STATS },
    effect:
      "You gain proficiency in one skill of your choice, and choose one skill proficiency to gain expertise (double proficiency bonus) with.",
    grants: { chooseSkills: 1, chooseExpertise: 1 },
  },
  {
    index: "observant",
    name: "Observant",
    summary: "Little escapes your notice.",
    abilityIncrease: { by: 1, from: [StatKey.int, StatKey.wis] },
    effect:
      "You can read lips, and you gain a +5 bonus to your passive Perception and passive Investigation.",
  },
  {
    index: "keen-mind",
    name: "Keen Mind",
    summary: "A mind like a steel trap.",
    abilityIncrease: { by: 1, from: [StatKey.int] },
    effect:
      "You always know which way is north and how long until the next sunrise or sunset, and you can accurately recall anything you've seen or heard within the past month.",
  },
  {
    index: "tavern-brawler",
    name: "Tavern Brawler",
    summary: "A rough-and-tumble scrapper.",
    abilityIncrease: { by: 1, from: [StatKey.str, StatKey.con] },
    effect:
      "Your unarmed strikes deal 1d4 damage, and when you hit with an unarmed strike or improvised weapon you can use a bonus action to try to grapple.",
    grants: { weapons: ["Improvised Weapons"] },
  },
  {
    index: "heavily-armored",
    name: "Heavily Armored",
    summary: "Trained in the heaviest armor.",
    prerequisite: "Proficiency with medium armor",
    abilityIncrease: { by: 1, from: [StatKey.str] },
    effect: "You gain proficiency with heavy armor.",
    grants: { armor: ["Heavy Armor"] },
  },
  {
    index: "moderately-armored",
    name: "Moderately Armored",
    summary: "Step up to medium armor and shields.",
    prerequisite: "Proficiency with light armor",
    abilityIncrease: { by: 1, from: [StatKey.str, StatKey.dex] },
    effect: "You gain proficiency with medium armor and shields.",
    grants: { armor: ["Medium Armor", "Shields"] },
  },
  {
    index: "lightly-armored",
    name: "Lightly Armored",
    summary: "Pick up light armor training.",
    abilityIncrease: { by: 1, from: [StatKey.str, StatKey.dex] },
    effect: "You gain proficiency with light armor.",
    grants: { armor: ["Light Armor"] },
  },
  {
    index: "weapon-master",
    name: "Weapon Master",
    summary: "Broaden your armory.",
    abilityIncrease: { by: 1, from: [StatKey.str, StatKey.dex] },
    effect: "You gain proficiency with four weapons of your choice.",
    grants: { chooseWeapons: 4 },
  },
  {
    index: "heavy-armor-master",
    name: "Heavy Armor Master",
    summary: "Shrug off blows in heavy armor.",
    prerequisite: "Proficiency with heavy armor",
    abilityIncrease: { by: 1, from: [StatKey.str] },
    effect:
      "While wearing heavy armor, nonmagical bludgeoning, piercing, and slashing damage you take is reduced by 3.",
  },
  {
    index: "slasher",
    name: "Slasher",
    summary: "Cripple foes with slashing hits.",
    abilityIncrease: { by: 1, from: [StatKey.str, StatKey.dex] },
    effect:
      "Once per turn when you deal slashing damage you can reduce the target's speed by 10 feet, and on a critical hit you can give it disadvantage on attacks until your next turn.",
  },
  {
    index: "piercer",
    name: "Piercer",
    summary: "Drive piercing hits home.",
    abilityIncrease: { by: 1, from: [StatKey.str, StatKey.dex] },
    effect:
      "Once per turn you can reroll one piercing damage die, and on a critical hit you roll one additional damage die.",
  },
  {
    index: "crusher",
    name: "Crusher",
    summary: "Bludgeon foes off their feet.",
    abilityIncrease: { by: 1, from: [StatKey.str, StatKey.con] },
    effect:
      "Once per turn when you deal bludgeoning damage you can move the target 5 feet, and on a critical hit attackers have advantage against it until your next turn.",
  },
  // ---- Pure feats (no ability score increase) ----
  {
    index: "alert",
    name: "Alert",
    summary: "Never caught off guard.",
    effect:
      "You can't be surprised while conscious, and hidden or unseen attackers don't gain advantage against you.",
    grants: { initiativeBonus: 5 },
  },
  {
    index: "charger",
    name: "Charger",
    summary: "Turn a dash into a devastating rush.",
    effect:
      "When you Dash and then immediately attack or shove a creature, you gain a bonus to the damage (or shove distance) if you moved at least 10 feet in a straight line.",
  },
  {
    index: "crossbow-expert",
    name: "Crossbow Expert",
    summary: "A crossbow specialist.",
    effect:
      "You ignore the loading property of crossbows, being within 5 feet of an enemy doesn't impose disadvantage on your ranged attacks, and you can fire a hand crossbow as a bonus action after an attack.",
  },
  {
    index: "defensive-duelist",
    name: "Defensive Duelist",
    summary: "Parry with a finesse weapon.",
    prerequisite: "Dexterity 13+",
    effect:
      "When wielding a finesse weapon you're proficient with, you can use your reaction to add your proficiency bonus to your AC against one melee attack.",
  },
  {
    index: "dual-wielder",
    name: "Dual Wielder",
    summary: "Master of two-weapon fighting.",
    effect:
      "You gain +1 AC while wielding a separate weapon in each hand, can two-weapon fight with non-light one-handed weapons, and can draw or stow two weapons at once.",
  },
  {
    index: "great-weapon-master",
    name: "Great Weapon Master",
    summary: "Hew through foes with heavy weapons.",
    effect:
      "On a critical hit or a kill with a melee weapon you get a bonus action attack, and with a heavy weapon you can take a -5 to hit for +10 damage.",
  },
  {
    index: "sharpshooter",
    name: "Sharpshooter",
    summary: "A deadly ranged marksman.",
    effect:
      "Long range doesn't impose disadvantage, your ranged attacks ignore half and three-quarters cover, and you can take a -5 to hit for +10 damage.",
  },
  {
    index: "grappler",
    name: "Grappler",
    summary: "Excel at pinning foes.",
    prerequisite: "Strength 13+",
    effect:
      "You have advantage on attack rolls against a creature you're grappling, and you can try to pin a grappled creature (both restrained).",
  },
  {
    index: "great-weapon-fighting-adept",
    name: "Savage Attacker",
    summary: "Hit for maximum brutality.",
    effect:
      "Once per turn when you roll damage for a melee weapon attack, you can reroll the weapon's damage dice and use either total.",
  },
  {
    index: "healer",
    name: "Healer",
    summary: "A capable battlefield medic.",
    effect:
      "Using a healer's kit, you can stabilize and restore a chunk of hit points to a creature (once per short/long rest per creature).",
  },
  {
    index: "inspiring-leader",
    name: "Inspiring Leader",
    summary: "Rally allies with a rousing speech.",
    prerequisite: "Charisma 13+",
    effect:
      "Spend 10 minutes inspiring allies to grant each temporary hit points equal to your level + your Charisma modifier.",
  },
  {
    index: "lucky",
    name: "Lucky",
    summary: "Fortune favors you.",
    effect:
      "Spend a luck point to roll an extra d20 for your attack, check, or save, or to force an attacker to reroll.",
    grants: {
      limitedUse: {
        name: "Luck Points",
        detail:
          "Roll an extra d20 for an attack, check, or save, or force an attacker to reroll.",
        maxUses: 3,
        recharge: "long",
      },
    },
  },
  {
    index: "mage-slayer",
    name: "Mage Slayer",
    summary: "A bane to spellcasters.",
    effect:
      "You can use your reaction to attack a nearby creature that casts a spell, casters have disadvantage on concentration saves against your damage, and you have advantage on saves against spells cast within 5 feet.",
  },
  {
    index: "magic-initiate",
    name: "Magic Initiate",
    summary: "Dabble in another class's magic.",
    effect:
      "Choose a class (bard, cleric, druid, sorcerer, warlock, or wizard). You learn two of its cantrips and one 1st-level spell you can cast once per long rest.",
    grants: {
      chooseSpells: [
        { level: 0, count: 2 },
        { level: 1, count: 1 },
      ],
    },
  },
  {
    index: "martial-adept",
    name: "Martial Adept",
    summary: "Learn a few battle maneuvers.",
    effect:
      "You learn two maneuvers from the Battle Master list; your superiority die fuels them and is regained on a short or long rest.",
    grants: {
      limitedUse: {
        name: "Superiority Die",
        detail: "A d6 to fuel your Battle Master maneuvers.",
        maxUses: 1,
        recharge: "short",
      },
    },
  },
  {
    index: "mobile",
    name: "Mobile",
    summary: "Fast and hard to pin down.",
    effect:
      "Difficult terrain doesn't slow your Dash, and melee attacking a creature exempts you from its opportunity attacks this turn.",
    grants: { speedBonus: 10 },
  },
  {
    index: "polearm-master",
    name: "Polearm Master",
    summary: "Master reach weapons.",
    effect:
      "With a glaive, halberd, quarterstaff, or spear you can make a bonus-action butt-end attack (1d4), and you get opportunity attacks when creatures enter your reach.",
  },
  {
    index: "ritual-caster",
    name: "Ritual Caster",
    summary: "Cast rituals from a book.",
    prerequisite: "Intelligence or Wisdom 13+",
    effect:
      "You gain a ritual book with two 1st-level ritual spells from a chosen class and can cast known rituals (and copy more you find).",
    grants: { chooseSpells: [{ level: 1, count: 2 }] },
  },
  {
    index: "sentinel",
    name: "Sentinel",
    summary: "Lock down enemies in melee.",
    effect:
      "When you hit with an opportunity attack the target's speed drops to 0, creatures provoke opportunity attacks even if they Disengage, and you can react to attack a foe that strikes an ally near you.",
  },
  {
    index: "shield-master",
    name: "Shield Master",
    summary: "Weaponize your shield.",
    effect:
      "You can shove with your shield as a bonus action after attacking, add your shield's AC to Dexterity saves against targeted effects, and take no damage on some successful Dex saves.",
  },
  {
    index: "skulker",
    name: "Skulker",
    summary: "An expert at staying unseen.",
    prerequisite: "Dexterity 13+",
    effect:
      "You can hide when only lightly obscured, missing with a ranged attack doesn't reveal your position, and dim light doesn't impose disadvantage on your Perception checks relying on sight.",
  },
  {
    index: "spell-sniper",
    name: "Spell Sniper",
    summary: "Extend and sharpen your attack spells.",
    prerequisite: "Spellcasting",
    effect:
      "Your attack-roll spells have doubled range and ignore half and three-quarters cover, and you learn one attack cantrip from a chosen class.",
    grants: { chooseSpells: [{ level: 0, count: 1 }] },
  },
  {
    index: "war-caster",
    name: "War Caster",
    summary: "Cast confidently in the thick of battle.",
    prerequisite: "Spellcasting",
    effect:
      "You have advantage on concentration saves, can perform somatic components with weapons or a shield in hand, and can cast a spell (as a single-target attack) as an opportunity attack.",
  },
  {
    index: "eldritch-adept",
    name: "Eldritch Adept",
    summary: "Learn an eldritch invocation.",
    prerequisite: "Spellcasting or Pact Magic",
    effect:
      "You learn one warlock Eldritch Invocation of your choice whose prerequisites you meet.",
  },
  {
    index: "metamagic-adept",
    name: "Metamagic Adept",
    summary: "Bend spells like a sorcerer.",
    prerequisite: "Spellcasting or Pact Magic",
    effect:
      "You learn two Metamagic options; your sorcery points fuel them and are regained on a long rest.",
    grants: {
      limitedUse: {
        name: "Sorcery Points",
        detail: "Fuel your Metamagic options.",
        maxUses: 2,
        recharge: "long",
      },
    },
  },
  {
    index: "elemental-adept",
    name: "Elemental Adept",
    summary: "Punch through elemental resistance.",
    prerequisite: "Spellcasting",
    effect:
      "Choose acid, cold, fire, lightning, or thunder. Your spells ignore resistance to that damage type, and you treat any 1 rolled on its damage dice as a 2.",
  },
  {
    index: "dungeon-delver",
    name: "Dungeon Delver",
    summary: "A wary explorer of ruins.",
    effect:
      "You have advantage on checks to detect secret doors and on saves against traps, resistance to trap damage, and you search for traps at full speed.",
  },
];

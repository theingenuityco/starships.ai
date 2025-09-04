/**
 * Dictionary of starship names for random selection
 * Contains space-themed, sci-fi inspired names
 */

const STARSHIP_NAMES = [
  // Classic Space Names
  'Endeavour',
  'Discovery',
  'Voyager',
  'Pioneer',
  'Explorer',
  'Pathfinder',
  'Navigator',
  'Horizon',
  'Aurora',
  'Meridian',

  // Celestial Bodies
  'Andromeda',
  'Cassiopeia',
  'Orion',
  'Vega',
  'Sirius',
  'Polaris',
  'Centauri',
  'Nebula',
  'Pulsar',
  'Quasar',

  // Mythological/Epic Names
  'Phoenix',
  'Titan',
  'Atlas',
  'Prometheus',
  'Icarus',
  'Odyssey',
  'Genesis',
  'Excalibur',
  'Valkyrie',
  'Serenity',

  // Science/Tech Names
  'Quantum',
  'Vector',
  'Prism',
  'Nexus',
  'Helix',
  'Matrix',
  'Catalyst',
  'Synthesis',
  'Axiom',
  'Theorem',

  // Nature/Elements
  'Tempest',
  'Thunder',
  'Lightning',
  'Storm',
  'Comet',
  'Meteor',
  'Eclipse',
  'Solar',
  'Lunar',
  'Stellar',

  // Abstract Concepts
  'Infinity',
  'Eternity',
  'Legacy',
  'Destiny',
  'Fortune',
  'Glory',
  'Honor',
  'Liberty',
  'Justice',
  'Triumph',

  // Sci-Fi Inspired
  'Stardust',
  'Starlight',
  'Starfire',
  'Starborn',
  'Starwind',
  'Starforge',
  'Starfall',
  'Starhawk',
  'Starseeker',
  'Starwalker',

  // Direction/Motion
  'Ascendant',
  'Transcendent',
  'Radiant',
  'Luminous',
  'Brilliant',
  'Majestic',
  'Noble',
  'Sovereign',
  'Supreme',
  'Ultimate',

  // Unique Names
  'Harbinger',
  'Sentinel',
  'Guardian',
  'Defiant',
  'Resolute',
  'Intrepid',
  'Dauntless',
  'Fearless',
  'Relentless',
  'Unstoppable',

  // More Creative Names
  'Dreamcatcher',
  'Wishmaker',
  'Starwhisper',
  'Voidwalker',
  'Timekeeper',
  'Spaceforge',
  'Moonrider',
  'Sunblade',
  'Nightfall',
  'Dawnbreaker',
];

/**
 * Get a random starship name from the dictionary
 * @returns {string} A randomly selected starship name
 */
export function getRandomStarshipName(): string {
  const randomIndex = Math.floor(Math.random() * STARSHIP_NAMES.length);
  return STARSHIP_NAMES[randomIndex];
}

/**
 * Get multiple random starship names (useful for generating alternatives)
 * @param count Number of names to return
 * @returns {string[]} Array of randomly selected starship names
 */
export function getMultipleRandomStarshipNames(count: number = 3): string[] {
  const names = new Set<string>();

  while (names.size < count && names.size < STARSHIP_NAMES.length) {
    names.add(getRandomStarshipName());
  }

  return Array.from(names);
}

/**
 * Check if a name exists in the dictionary
 * @param name The name to check
 * @returns {boolean} Whether the name exists in the dictionary
 */
export function isStarshipNameInDictionary(name: string): boolean {
  return STARSHIP_NAMES.includes(name);
}

export default STARSHIP_NAMES;

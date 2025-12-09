/**
 * testLocal.ts
 * 
 * Local testing script to demonstrate the analyze_deck tool with templates and roles.
 * Run with: npm run test:local
 */

import { AnalyzeDeckInput } from './core/types';
import { runAnalyzeDeck } from './mcp/analyzeDeckTool';

// Example deck input with various card types to test role classification and bracket rules
const exampleInput: AnalyzeDeckInput = {
  deckText: `
1 Sol Ring
1 Arcane Signet
1 Cultivate
1 Kodama's Reach
1 Rampant Growth
1 Nature's Lore
1 Three Visits
1 Farseek

1 Swords to Plowshares
1 Path to Exile
1 Beast Within
1 Generous Gift
1 Rapid Hybridization
1 Reality Shift

1 Wrath of God
1 Damnation
1 Cyclonic Rift

1 Rhystic Study
1 Mystic Remora
1 Phyrexian Arena
1 Harmonize
1 Chart a Course
1 Read the Bones
1 Night's Whisper
1 Sign in Blood

1 Counterspell
1 Swan Song
1 Negate

1 Demonic Tutor
1 Vampiric Tutor
1 Mystical Tutor
1 Mana Crypt

1 Time Warp
1 Expropriate

1 Armageddon

1 Command Tower
1 Exotic Orchard
1 Reflecting Pool
10 Island
10 Plains
10 Swamp
5 Forest
5 Mountain
`,
  templateId: 'bracket3',
  banlistId: 'commander',
  options: {
    inferCommander: false,
    language: 'en'
  }
};

async function main() {
  console.log('=== MTG Commander Deck Analyzer - Template & Role Classification Test ===\n');

  console.log('📥 Input:');
  console.log(`  Template ID: ${exampleInput.templateId}`);
  console.log(`  Banlist ID: ${exampleInput.banlistId}`);
  console.log(`  Deck text: ${exampleInput.deckText.trim().split('\n').length} lines\n`);

  // Run the analyze_deck tool
  const result = await runAnalyzeDeck(exampleInput);

  console.log('📊 Complete Result (AnalyzeDeckResult):');
  console.log(JSON.stringify(result, null, 2));
  console.log('\n');

  // Human-readable summary
  console.log('=== Summary ===');
  console.log(`Commander: ${result.analysis.commanderName || 'Not detected'}`);
  console.log(`Total cards: ${result.analysis.totalCards}`);
  console.log(`Unique cards: ${result.analysis.uniqueCards}`);
  
  // Display bracket information if present
  if (result.analysis.bracketId) {
    console.log(`\n🎯 Bracket: ${result.analysis.bracketLabel || result.analysis.bracketId}`);
    console.log(`   Bracket ID: ${result.analysis.bracketId}`);
    if (result.analysis.bracketWarnings.length > 0) {
      console.log(`\n⚠️  Bracket Warnings:`);
      result.analysis.bracketWarnings.forEach(warning => console.log(`  - ${warning}`));
    } else {
      console.log(`   No bracket violations detected.`);
    }
  }
  
  console.log(`\nCategories:`);
  result.analysis.categories.forEach(cat => {
    const range = cat.min && cat.max ? `${cat.min}-${cat.max}` : 'N/A';
    const statusIcon = cat.status === 'within' ? '✓' : cat.status === 'below' ? '↓' : cat.status === 'above' ? '↑' : '?';
    console.log(`  ${statusIcon} ${cat.name}: ${cat.count} [${cat.status}] (recommended: ${range})`);
  });
  console.log(`\nNotes:`);
  result.analysis.notes.forEach(note => console.log(`  - ${note}`));
}

main().catch(error => {
  console.error('Error running analyze_deck tool:', error);
  process.exit(1);
});

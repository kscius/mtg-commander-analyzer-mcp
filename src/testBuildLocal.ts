/**
 * testBuildLocal.ts
 * 
 * Local testing script for the deck builder.
 * Run with: npm run test:build
 */

import { BuildDeckInput } from './core/types';
import { runBuildDeckFromCommander } from './mcp/buildDeckFromCommanderTool';

// Example build input with a popular commander and EDHREC autofill
const exampleInput: BuildDeckInput = {
  commanderName: "Atraxa, Praetors' Voice",
  templateId: 'bracket3',
  banlistId: 'commander',
  bracketId: 'bracket3',
  useEdhrec: true, // Enable EDHREC suggestions
  useEdhrecAutofill: true, // Enable EDHREC autofill for missing categories
  seedCards: [
    'Sol Ring',
    'Arcane Signet',
    'Rhystic Study',
    'Swords to Plowshares',
    'Cultivate'
  ]
};

async function main() {
  console.log('=== MTG Commander Deck Builder - Bracket 3 Skeleton Test ===\n');

  console.log('📥 Input:');
  console.log(`  Commander: ${exampleInput.commanderName}`);
  console.log(`  Template ID: ${exampleInput.templateId}`);
  console.log(`  Bracket ID: ${exampleInput.bracketId}`);
  console.log(`  Seed Cards: ${exampleInput.seedCards?.length || 0}\n`);

  // Run the deck builder
  const result = await runBuildDeckFromCommander(exampleInput);

  // Short summary
  console.log('=== Summary ===');
  console.log(`Commander: ${result.deck.commanderName}`);
  
  const totalBuiltCards = result.deck.cards.reduce(
    (sum, card) => sum + card.quantity,
    0
  );
  console.log(`Total cards in built 99: ${totalBuiltCards}`);
  
  const landsCategory = result.analysis.categories.find(cat => cat.name === 'lands');
  console.log(`Land count from analysis: ${landsCategory?.count || 0}`);
  
  console.log(`\n🎯 Template & Bracket:`);
  console.log(`  Template: ${result.templateId}`);
  console.log(`  Bracket: ${result.bracketLabel || result.bracketId} (ID: ${result.bracketId})`);
  
  if (result.analysis.bracketWarnings.length > 0) {
    console.log(`\n⚠️  Bracket Warnings:`);
    result.analysis.bracketWarnings.forEach(warning => 
      console.log(`  - ${warning}`)
    );
  }
  
  console.log(`\n📊 Categories:`);
  result.analysis.categories.forEach(cat => {
    const range = cat.min && cat.max ? `${cat.min}-${cat.max}` : 'N/A';
    const statusIcon = cat.status === 'within' ? '✓' : 
                       cat.status === 'below' ? '↓' : 
                       cat.status === 'above' ? '↑' : '?';
    console.log(`  ${statusIcon} ${cat.name}: ${cat.count} [${cat.status}] (recommended: ${range})`);
  });

  console.log(`\n📝 Builder Notes (first 10):`);
  result.notes.slice(0, 10).forEach(note => console.log(`  - ${note}`));
  if (result.notes.length > 10) {
    console.log(`  ... and ${result.notes.length - 10} more notes.`);
  }

  // Show EDHREC integration info if present
  if (result.edhrecContext) {
    console.log(`\n🌐 EDHREC Integration:`);
    console.log(`  Sources used: ${result.edhrecContext.sourcesUsed.length}`);
    result.edhrecContext.sourcesUsed.forEach(source => 
      console.log(`    - ${source}`)
    );
    console.log(`  Total suggestions: ${result.edhrecContext.suggestions.length}`);
    
    console.log(`\n  Sample suggestions (first 10):`);
    result.edhrecContext.suggestions.slice(0, 10).forEach((sug, idx) => {
      const category = sug.category ? ` [${sug.category}]` : '';
      const rank = sug.rank ? ` #${sug.rank}` : '';
      console.log(`    ${idx + 1}. ${sug.name}${rank}${category}`);
    });
    
    if (result.edhrecContext.suggestions.length > 10) {
      console.log(`    ... and ${result.edhrecContext.suggestions.length - 10} more suggestions.`);
    }
  } else {
    console.log(`\n🌐 EDHREC Integration: Not enabled or failed to fetch.`);
  }

  console.log('\n');
  console.log('📊 Complete Result (BuildDeckResult):');
  console.log(JSON.stringify(result, null, 2));
}

main().catch(error => {
  console.error('Error running deck builder:', error);
  process.exit(1);
});


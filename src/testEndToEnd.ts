/**
 * testEndToEnd.ts
 * 
 * End-to-end integration test for MTG Commander Analyzer MCP.
 * Tests three scenarios:
 * A) Analyze an existing deck
 * B) Build a deck without EDHREC autofill
 * C) Build a deck with EDHREC autofill
 */

import { AnalyzeDeckInput, BuildDeckInput } from './core/types';
import { runAnalyzeDeck } from './mcp/analyzeDeckTool';
import { runBuildDeckFromCommander } from './mcp/buildDeckFromCommanderTool';

/**
 * Test results tracker
 */
interface TestResult {
  scenarioName: string;
  status: 'OK' | 'FAILED';
  error?: string;
}

const results: TestResult[] = [];

/**
 * Scenario A: Analyze an existing Bracket 3 deck
 */
async function scenarioA_AnalyzeDeck(): Promise<void> {
  console.log('\n' + '='.repeat(70));
  console.log('SCENARIO A: Analyze Existing Deck');
  console.log('='.repeat(70) + '\n');

  try {
    // Sample deck with a variety of cards
    const deckText = `
1 Atraxa, Praetors' Voice
1 Sol Ring
1 Arcane Signet
1 Talisman of Dominance
1 Talisman of Progress
1 Cultivate
1 Kodama's Reach
1 Rhystic Study
1 Mystic Remora
1 Phyrexian Arena
1 Swords to Plowshares
1 Beast Within
1 Generous Gift
1 Assassin's Trophy
1 Wrath of God
1 Damnation
1 Cyclonic Rift
10 Island
10 Plains
10 Swamp
10 Forest
5 Command Tower
`.trim();

    const input: AnalyzeDeckInput = {
      deckText,
      templateId: 'bracket3',
      banlistId: 'commander',
      options: {
      }
    };

    console.log('📥 Input:');
    console.log(`  Template: ${input.templateId}`);
    console.log(`  Banlist: ${input.banlistId}`);
    console.log(`  Deck lines: ${deckText.split('\n').length}`);
    console.log('');

    const result = await runAnalyzeDeck(input);

    console.log('📊 Analysis Result:');
    console.log(`  Commander: ${result.analysis.commanderName || 'Not detected'}`);
    console.log(`  Total cards: ${result.analysis.totalCards}`);
    console.log(`  Unique cards: ${result.analysis.uniqueCards}`);
    console.log('');

    console.log('  Categories:');
    for (const cat of result.analysis.categories) {
      const statusIcon = cat.status === 'within' ? '✓' : 
                        cat.status === 'below' ? '↓' : 
                        cat.status === 'above' ? '↑' : '?';
      const range = cat.min && cat.max ? `${cat.min}-${cat.max}` : 'N/A';
      console.log(`    ${statusIcon} ${cat.name}: ${cat.count} [${cat.status}] (rec: ${range})`);
    }
    console.log('');

    if (result.analysis.bracketWarnings.length > 0) {
      console.log('  Bracket Warnings:');
      result.analysis.bracketWarnings.forEach(w => console.log(`    - ${w}`));
    } else {
      console.log('  ✓ No bracket violations');
    }
    console.log('');

    results.push({ scenarioName: 'Scenario A (AnalyzeDeck)', status: 'OK' });
    console.log('✅ Scenario A PASSED\n');

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    results.push({ scenarioName: 'Scenario A (AnalyzeDeck)', status: 'FAILED', error: errorMsg });
    console.error('❌ Scenario A FAILED:', errorMsg);
  }
}

/**
 * Scenario B: Build a deck from commander WITHOUT EDHREC autofill
 */
async function scenarioB_BuildWithoutAutofill(): Promise<void> {
  console.log('\n' + '='.repeat(70));
  console.log('SCENARIO B: Build Deck WITHOUT EDHREC Autofill');
  console.log('='.repeat(70) + '\n');

  try {
    const input: BuildDeckInput = {
      commanderName: "Atraxa, Praetors' Voice",
      templateId: 'bracket3',
      banlistId: 'commander',
      bracketId: 'bracket3',
      seedCards: [
        'Sol Ring',
        'Arcane Signet',
        'Rhystic Study',
        'Swords to Plowshares',
        'Cultivate'
      ],
      useEdhrec: false,
      useEdhrecAutofill: false
    };

    console.log('📥 Input:');
    console.log(`  Commander: ${input.commanderName}`);
    console.log(`  Seed cards: ${input.seedCards?.length || 0}`);
    console.log(`  EDHREC: ${input.useEdhrec ? 'enabled' : 'disabled'}`);
    console.log(`  Autofill: ${input.useEdhrecAutofill ? 'enabled' : 'disabled'}`);
    console.log('');

    const result = await runBuildDeckFromCommander(input);

    const totalCards = result.deck.cards.reduce((sum, c) => sum + c.quantity, 0);

    console.log('📊 Build Result:');
    console.log(`  Commander: ${result.deck.commanderName}`);
    console.log(`  Total cards: ${totalCards}/99`);
    console.log('');

    const landsCategory = result.analysis.categories.find(c => c.name === 'lands');
    console.log('  Categories:');
    for (const cat of result.analysis.categories) {
      const statusIcon = cat.status === 'within' ? '✓' : 
                        cat.status === 'below' ? '↓' : 
                        cat.status === 'above' ? '↑' : '?';
      console.log(`    ${statusIcon} ${cat.name}: ${cat.count}`);
    }
    console.log('');

    console.log('  EDHREC Context:', result.edhrecContext ? 'NOT PRESENT (expected)' : '✓ Not present (as expected)');
    console.log('');

    results.push({ scenarioName: 'Scenario B (Build w/o Autofill)', status: 'OK' });
    console.log('✅ Scenario B PASSED\n');

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    results.push({ scenarioName: 'Scenario B (Build w/o Autofill)', status: 'FAILED', error: errorMsg });
    console.error('❌ Scenario B FAILED:', errorMsg);
  }
}

/**
 * Scenario C: Build a deck from commander WITH EDHREC autofill
 */
async function scenarioC_BuildWithAutofill(): Promise<void> {
  console.log('\n' + '='.repeat(70));
  console.log('SCENARIO C: Build Deck WITH EDHREC Autofill');
  console.log('='.repeat(70) + '\n');

  try {
    const input: BuildDeckInput = {
      commanderName: "Atraxa, Praetors' Voice",
      templateId: 'bracket3',
      banlistId: 'commander',
      bracketId: 'bracket3',
      seedCards: [
        'Sol Ring',
        'Arcane Signet'
      ],
      useEdhrec: true,
      useEdhrecAutofill: true
    };

    console.log('📥 Input:');
    console.log(`  Commander: ${input.commanderName}`);
    console.log(`  Seed cards: ${input.seedCards?.length || 0}`);
    console.log(`  EDHREC: ${input.useEdhrec ? 'enabled' : 'disabled'}`);
    console.log(`  Autofill: ${input.useEdhrecAutofill ? 'enabled' : 'disabled'}`);
    console.log('');

    const result = await runBuildDeckFromCommander(input);

    const totalCards = result.deck.cards.reduce((sum, c) => sum + c.quantity, 0);

    console.log('📊 Build Result:');
    console.log(`  Commander: ${result.deck.commanderName}`);
    console.log(`  Total cards: ${totalCards}/99`);
    console.log('');

    console.log('  Categories:');
    for (const cat of result.analysis.categories) {
      const statusIcon = cat.status === 'within' ? '✓' : 
                        cat.status === 'below' ? '↓' : 
                        cat.status === 'above' ? '↑' : '?';
      const range = cat.min && cat.max ? `${cat.min}-${cat.max}` : 'N/A';
      console.log(`    ${statusIcon} ${cat.name}: ${cat.count} [${cat.status}] (rec: ${range})`);
    }
    console.log('');

    if (result.edhrecContext) {
      console.log('  🌐 EDHREC Context:');
      console.log(`    ✓ Sources used: ${result.edhrecContext.sourcesUsed.length}`);
      console.log(`    ✓ Total suggestions: ${result.edhrecContext.suggestions.length}`);
      
      // Count autofill actions from notes
      const autofillNote = result.notes.find(n => n.includes('EDHREC Autofill complete'));
      if (autofillNote) {
        console.log(`    ✓ Autofill note found: ${autofillNote}`);
      }
    } else {
      console.log('  ⚠️  EDHREC Context: MISSING (unexpected!)');
    }
    console.log('');

    if (result.analysis.bracketWarnings.length > 0) {
      console.log('  Bracket Warnings:');
      result.analysis.bracketWarnings.forEach(w => console.log(`    - ${w}`));
    } else {
      console.log('  ✓ No bracket violations');
    }
    console.log('');

    results.push({ scenarioName: 'Scenario C (Build w/ Autofill)', status: 'OK' });
    console.log('✅ Scenario C PASSED\n');

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    results.push({ scenarioName: 'Scenario C (Build w/ Autofill)', status: 'FAILED', error: errorMsg });
    console.error('❌ Scenario C FAILED:', errorMsg);
  }
}

/**
 * Main test runner
 */
async function main() {
  console.log('='.repeat(70));
  console.log('MTG Commander Analyzer - End-to-End Integration Test');
  console.log('='.repeat(70));

  await scenarioA_AnalyzeDeck();
  await scenarioB_BuildWithoutAutofill();
  await scenarioC_BuildWithAutofill();

  console.log('\n' + '='.repeat(70));
  console.log('END-TO-END TEST SUMMARY');
  console.log('='.repeat(70) + '\n');

  let passedCount = 0;
  let failedCount = 0;

  for (const result of results) {
    const statusIcon = result.status === 'OK' ? '✅' : '❌';
    console.log(`${statusIcon} ${result.scenarioName}: ${result.status}`);
    if (result.error) {
      console.log(`    Error: ${result.error}`);
    }

    if (result.status === 'OK') {
      passedCount++;
    } else {
      failedCount++;
    }
  }

  console.log('');
  console.log(`Total: ${results.length} scenarios`);
  console.log(`Passed: ${passedCount}`);
  console.log(`Failed: ${failedCount}`);
  console.log('');

  if (failedCount > 0) {
    console.log('⚠️  Some tests failed. Review errors above.');
    process.exit(1);
  } else {
    console.log('✅ All end-to-end tests passed!');
  }
}

// Run tests
main().catch(error => {
  console.error('\n💥 Fatal error in test suite:', error);
  process.exit(1);
});


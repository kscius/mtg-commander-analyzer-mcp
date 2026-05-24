/**
 * Read-only Scryfall API smoke test for auditing coverage.
 * Run: npx ts-node src/scripts/exploreScryfallApi.ts
 */
import {
  autocompleteScryfallApi,
  fetchCardFuzzy,
  fetchCardFromApi,
  getCardByName,
  searchScryfallApi,
} from '../core/scryfall';

async function main(): Promise<void> {
  const local = getCardByName('Sol Ring');
  console.log('Local Sol Ring:', local?.name ?? 'MISSING');

  const exact = await fetchCardFromApi('Sol Ring');
  console.log('API exact:', exact?.name ?? 'fail');

  const fuzzy = await fetchCardFuzzy('Sol Rng');
  console.log('API fuzzy Sol Rng:', fuzzy?.name ?? 'fail');

  const ac = await autocompleteScryfallApi('atraxa');
  console.log('Autocomplete atraxa:', ac.slice(0, 5));

  const search = await searchScryfallApi('identity:WU t:land', 5);
  console.log(
    'Search identity:WU t:land:',
    search.map((c) => c.name)
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

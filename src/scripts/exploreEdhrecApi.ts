/**
 * Read-only EDHREC fetch smoke test for auditing coverage.
 * Run: npx ts-node src/scripts/exploreEdhrecApi.ts [commander-slug]
 */
import { commanderNameToSlug, getFullCommanderProfile } from '../core/edhrec';
import { getCardByName } from '../core/scryfall';

async function main(): Promise<void> {
  const name = process.argv[2] ?? "Atraxa, Praetors' Voice";
  const card = getCardByName(name);
  const colors = card?.color_identity ?? ['W', 'U', 'B', 'G'];
  console.log('Commander:', name, 'CI:', colors.join(''));

  const profile = await getFullCommanderProfile(name, colors, {
    cardLimit: 10,
    landLimit: 10,
  });
  console.log('Sources:', profile.sourcesUsed);
  console.log('Top cards:', profile.cards.slice(0, 5).map((c) => c.name));
  console.log('Top lands:', profile.lands.slice(0, 5).map((c) => c.name));
  console.log('Themes:', profile.themes.slice(0, 5).map((t) => t.slug ?? t.name));
  console.log('Slug:', commanderNameToSlug(name));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

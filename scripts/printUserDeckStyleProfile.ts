/**
 * Print aggregated user deck style profile (data/my_decks) to stdout.
 * Usage: npm run decks:user-style-profile
 */

import { getUserDeckStyleProfile } from '../src/core/userDeckLibrary';

const profile = getUserDeckStyleProfile(true);
console.log(JSON.stringify(profile, null, 2));

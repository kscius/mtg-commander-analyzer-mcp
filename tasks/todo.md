# Daily improvement 2026-07-17 — MCP TOOLS

## Focus
Primary (day 17 mod 8 = 1 → MCP TOOLS). Open PR #42 blocks CORE ANALYSIS only.

## Selected improvements (TIER 2)
1. Fix `evaluate_card_swap` treating DB-resolvable names as "in deck" and appending adds when remove misses
2. Fix `get_category_candidates` always emptying `lands` (land type-line filter + no land autoTag)
3. Point `nextSuggestedAction` at `get_category_candidates` / `apply_deck_changes`

## Status
- [x] Dedup
- [x] Read docs / scan
- [ ] Implement
- [ ] Build + test
- [ ] PR

/**
 * Design-token contrast guard (gap #16a).
 *
 * Locks the two WCAG AA contrast failures the a11y audit measured — the offline
 * banner's white-on-amber text (~2.2:1) and the primary button's white-on-ember
 * label (~3.1:1) — plus every semantic on-color pairing the fix introduced, so a
 * future brand tweak that drops one below threshold fails CI here.
 *
 * IMPORT DISCIPLINE: this test imports ONLY `../contrast` and `../../palette`,
 * both of which are `react-native`-free. It must NEVER import `../../theme` (that
 * pulls in `react-native`, which cannot enter a Node test graph). The theme
 * pairings are reproduced below as literals; the two `theme.ts` colors that are
 * inline literals (the dark-theme info blue and its cross-check) are declared
 * here with the same values and a comment so a drift is a visible diff.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contrastRatio, meetsAA, AA_NORMAL } from '../contrast';
import { palette } from '../../palette';

// Inline theme literals that are NOT in `palette` (mirror theme.ts darkTheme):
const DARK_INFO = '#5B8DEF'; // darkTheme.colors.info

/** Assert an AA pass and echo the measured ratio for CI logs. */
function assertAA(label: string, fg: string, bg: string, large = false): void {
  const ratio = contrastRatio(fg, bg);
  assert.ok(
    meetsAA(ratio, large),
    `${label}: ${ratio.toFixed(3)}:1 is below WCAG AA (${large ? 3.0 : AA_NORMAL}:1)`,
  );
}

test('contrastRatio: known WCAG anchors', () => {
  // Black on white is the theoretical maximum (21:1); identical colors are 1:1.
  assert.equal(Math.round(contrastRatio('#000000', '#FFFFFF')), 21);
  assert.equal(contrastRatio('#123456', '#123456'), 1);
  // Order independence.
  assert.equal(
    contrastRatio(palette.ink, palette.ember),
    contrastRatio(palette.ember, palette.ink),
  );
  // Short-hex parsing matches long-hex.
  assert.equal(contrastRatio('#fff', '#000'), contrastRatio('#FFFFFF', '#000000'));
});

test('hex parsing rejects malformed input', () => {
  assert.throws(() => contrastRatio('nope', '#000000'));
  assert.throws(() => contrastRatio('#12', '#000000'));
});

test('FIX #1 — offline banner: onWarning on warning meets AA (both schemes)', () => {
  // lightTheme: onWarning = ink, warning = amber (#E8A317)
  assertAA('light onWarning/warning', palette.ink, palette.warning);
  // darkTheme: onWarning = ink, warning = spark (#FFB552)
  assertAA('dark onWarning/warning', palette.ink, palette.spark);
});

test('FIX #1 — syncing strip: onInfo on info meets AA (per-scheme on-color)', () => {
  // lightTheme: onInfo = white, info = blue (#2A6FDB)
  assertAA('light onInfo/info', palette.white, palette.info);
  // darkTheme: onInfo = ink (NOT white — see below), info = lighter blue (#5B8DEF)
  assertAA('dark onInfo/info', palette.ink, DARK_INFO);
});

test('FIX #2 — primary button: ink label on ember fill meets AA (both schemes)', () => {
  // lightTheme: primary = ember (#E8551F), button label = ink
  assertAA('light button ink/ember', palette.ink, palette.ember);
  // darkTheme: primary = emberHot (#FF7A3D), button label = ink
  assertAA('dark button ink/emberHot', palette.ink, palette.emberHot);
});

test('REGRESSION SENTINELS — the audit failures stay dead', () => {
  // The two pairings we replaced. If a future edit reverts either to white,
  // these documented expected-fails flip and this test fires.
  assert.ok(
    !meetsAA(contrastRatio(palette.white, palette.warning)),
    'white-on-amber unexpectedly passes AA — did the warning fill change?',
  );
  assert.ok(
    !meetsAA(contrastRatio(palette.white, palette.ember)),
    'white-on-ember unexpectedly passes AA — did the ember fill change?',
  );
  // And white on the dark-theme info blue is exactly why onInfo is ink there.
  assert.ok(
    !meetsAA(contrastRatio(palette.white, DARK_INFO)),
    'white-on-dark-info unexpectedly passes AA — onInfo could have stayed white',
  );
});

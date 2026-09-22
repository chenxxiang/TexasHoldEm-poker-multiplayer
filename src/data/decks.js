// Card skins. Each player picks their own; the choice is local and never leaves the browser.
//
// A sprite skin ships two files under `dir`: deck-sheet.webp (13x4, columns follow VALUES and
// rows follow SUITS, the order server/game/deck.js builds the deck in) and card-back.webp.
// Build them with scripts/build-card-sheet.js.
//
// `legacy` is the original CSS-drawn deck. It stays hand-drawn rather than being baked into a
// sheet: it is the default skin, so keeping it as CSS means a new player downloads no card art
// at all, and it stays sharp at any size. The art skins are opt-in downloads.

export const DECKS = [
  { id: 'legacy', name: '旧版', renderer: 'css' },
  // 经典 came back from the generator a rank short; scripts/repair-classic-sheet.js rebuilds
  // the missing tens out of the misplaced indices before the sheet is cut.
  { id: 'classic', name: '经典', renderer: 'sprite', dir: '/cards/classic' },
  { id: 'gufeng', name: '古风', renderer: 'sprite', dir: '/cards/gufeng' },
  { id: 'cyber', name: '赛博朋克', renderer: 'sprite', dir: '/cards/cyber' },
];

export const DEFAULT_DECK = 'legacy';

export function getDeck(id) {
  const deck = DECKS.find(d => d.id === id && !d.unavailable);
  return deck || DECKS.find(d => d.id === DEFAULT_DECK);
}

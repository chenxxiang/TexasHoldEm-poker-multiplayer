const SUITS = ['s', 'h', 'd', 'c'];
const VALUES = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const SUIT_NAMES = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' };

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const value of VALUES) {
      deck.push({ code: value + suit, suit: SUIT_NAMES[suit], value });
    }
  }
  return deck;
}

function shuffle(deck) {
  const arr = [...deck];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function dealHands(deck, playerIds) {
  const remaining = [...deck];
  const hands = {};
  for (const id of playerIds) {
    hands[id] = [remaining.shift(), remaining.shift()];
  }
  return { hands, remainingDeck: remaining };
}

function drawCards(deck, count) {
  const remaining = [...deck];
  const drawn = remaining.splice(0, count);
  return { drawn, remainingDeck: remaining };
}

module.exports = { createDeck, shuffle, dealHands, drawCards };

const { createDeck, shuffle, dealHands } = require('../game/deck');

describe('deck', () => {
  test('createDeck 返回 52 张牌', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(52);
  });

  test('createDeck 每张牌格式为 {code, suit, value}', () => {
    const deck = createDeck();
    deck.forEach(card => {
      expect(card).toHaveProperty('code');
      expect(card).toHaveProperty('suit');
      expect(card).toHaveProperty('value');
    });
  });

  test('createDeck 所有牌的 code 唯一', () => {
    const deck = createDeck();
    const codes = deck.map(c => c.code);
    const unique = new Set(codes);
    expect(unique.size).toBe(52);
  });

  test('shuffle 返回相同数量的牌', () => {
    const deck = createDeck();
    const shuffled = shuffle(deck);
    expect(shuffled).toHaveLength(52);
  });

  test('shuffle 返回新数组（不改变原数组引用）', () => {
    const deck = createDeck();
    const shuffled = shuffle(deck);
    expect(shuffled).not.toBe(deck);
  });

  test('dealHands 给每个玩家发 2 张手牌', () => {
    const deck = createDeck();
    const { hands, remainingDeck } = dealHands(deck, ['p1', 'p2', 'p3']);
    expect(hands['p1']).toHaveLength(2);
    expect(hands['p2']).toHaveLength(2);
    expect(hands['p3']).toHaveLength(2);
    expect(remainingDeck).toHaveLength(52 - 6);
  });

  test('dealHands 发出的牌不重复', () => {
    const deck = createDeck();
    const { hands } = dealHands(deck, ['p1', 'p2']);
    const allCards = [...hands['p1'], ...hands['p2']].map(c => c.code);
    const unique = new Set(allCards);
    expect(unique.size).toBe(4);
  });
});

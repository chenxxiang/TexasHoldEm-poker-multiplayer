const { calculateSidePots, splitPotAmount } = require('../game/pots');

describe('splitPotAmount', () => {
  test('能整除时平均分配', () => {
    expect(splitPotAmount(100, 4)).toEqual([25, 25, 25, 25]);
  });

  test('不能整除时，余数分给前面的赢家，总和等于彩池金额（回归筹码丢失问题）', () => {
    const shares = splitPotAmount(101, 2);
    expect(shares).toEqual([51, 50]);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(101);
  });

  test('三人平分且有余数', () => {
    const shares = splitPotAmount(100, 3);
    expect(shares).toEqual([34, 33, 33]);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(100);
  });

  test('单人获胜（winnerCount=1）拿到全部彩池', () => {
    expect(splitPotAmount(37, 1)).toEqual([37]);
  });
});

describe('calculateSidePots', () => {
  test('无人全下时，只有一个主池，金额等于全部下注之和', () => {
    const players = [
      { nickname: 'A', totalBet: 30, folded: false },
      { nickname: 'B', totalBet: 30, folded: false },
      { nickname: 'C', totalBet: 30, folded: false },
    ];
    const pots = calculateSidePots(players);
    expect(pots).toHaveLength(1);
    expect(pots[0].amount).toBe(90);
    expect(pots[0].eligible.map(p => p.nickname).sort()).toEqual(['A', 'B', 'C']);
  });

  test('有人全下且下注额不同时，正确拆分主池和边池', () => {
    const players = [
      { nickname: 'short', totalBet: 10, folded: false },
      { nickname: 'mid', totalBet: 30, folded: false },
      { nickname: 'big', totalBet: 30, folded: false },
    ];
    const pots = calculateSidePots(players);
    // main pot: 10*3 = 30 (all three eligible)
    // side pot: (30-10)*2 = 40 (mid, big eligible)
    expect(pots).toHaveLength(2);
    expect(pots[0].amount).toBe(30);
    expect(pots[0].eligible.map(p => p.nickname).sort()).toEqual(['big', 'mid', 'short']);
    expect(pots[1].amount).toBe(40);
    expect(pots[1].eligible.map(p => p.nickname).sort()).toEqual(['big', 'mid']);
    const totalDistributed = pots.reduce((s, p) => s + p.amount, 0);
    expect(totalDistributed).toBe(70); // 10+30+30
  });

  test('弃牌玩家的下注仍计入彩池金额，但不计入 eligible', () => {
    const players = [
      { nickname: 'folder', totalBet: 20, folded: true },
      { nickname: 'winner', totalBet: 20, folded: false },
    ];
    const pots = calculateSidePots(players);
    expect(pots).toHaveLength(1);
    expect(pots[0].amount).toBe(40);
    expect(pots[0].eligible.map(p => p.nickname)).toEqual(['winner']);
  });
});

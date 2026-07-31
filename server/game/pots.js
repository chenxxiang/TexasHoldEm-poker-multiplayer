// 边池计算
function calculateSidePots(players) {
  const entries = players
    .map(p => ({ player: p, amount: p.totalBet || 0, folded: p.folded }))
    .filter(e => e.amount > 0)
    .sort((a, b) => a.amount - b.amount);

  const pots = [];
  let prevLevel = 0;
  let remaining = [...entries];
  let carryover = 0;

  while (remaining.length > 0) {
    const level = remaining[0].amount;
    const potAmount = (level - prevLevel) * remaining.length + carryover;
    const eligible = remaining.filter(e => !e.folded).map(e => e.player);
    carryover = 0;
    if (eligible.length > 0) {
      pots.push({ amount: potAmount, eligible });
    } else {
      carryover = potAmount;
    }
    prevLevel = level;
    remaining = remaining.filter(e => e.amount > level);
  }
  if (carryover > 0 && pots.length > 0) pots[pots.length - 1].amount += carryover;
  return pots;
}

// Split an integer pot amount evenly across winnerCount winners without losing
// the remainder to rounding. Earlier entries in the returned array receive the
// extra chip(s) when the amount doesn't divide evenly (e.g. splitPotAmount(101, 2)
// => [51, 50]). The sum of the returned shares always equals `amount`.
function splitPotAmount(amount, winnerCount) {
  const share = Math.floor(amount / winnerCount);
  const remainder = amount - share * winnerCount;
  return Array.from({ length: winnerCount }, (_, i) => share + (i < remainder ? 1 : 0));
}

module.exports = { calculateSidePots, splitPotAmount };

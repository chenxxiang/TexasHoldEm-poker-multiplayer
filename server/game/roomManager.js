const { createDeck, shuffle, dealHands, drawCards } = require('./deck');

class RoomManager {
  constructor() {
    this.rooms = new Map();
  }

  _generateRoomId() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let id = '';
    for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
    return this.rooms.has(id) ? this._generateRoomId() : id;
  }

  createRoom(socketId, nickname, settings) {
    const roomId = this._generateRoomId();
    const room = {
      roomId,
      hostSocketId: socketId,
      settings: {
        initialChips: settings.initialChips,
        smallBlind: settings.smallBlind,
        maxRebuyAmount: settings.maxRebuyAmount,
      },
      players: [{
        socketId,
        nickname,
        chips: settings.initialChips,
        seatIndex: 0,
        bet: 0,
        totalBet: 0,
        folded: false,
        hasActed: false,
        hasUsedTimeBank: false,
        holeCards: [],
        status: 'active',
        won: 0,
        raiseCount: 0,
      }],
      phase: 'waiting',
      communityCards: [],
      pot: 0,
      betSize: settings.smallBlind * 2,
      currentTurnIndex: -1,
      lastAggressorIndex: 0,
      loopNum: 0,
      dealerIndex: 0,
      actedPlayerIds: new Set(),
      deck: [],
    };
    this.rooms.set(roomId, room);
    return room;
  }

  joinRoom(roomId, socketId, nickname) {
    const room = this.rooms.get(roomId);
    if (!room) return { error: 'ROOM_NOT_FOUND' };
    if (room.players.length >= 10) return { error: 'ROOM_FULL' };
    if (room.phase !== 'waiting') return { error: 'GAME_IN_PROGRESS' };
    room.players.push({
      socketId,
      nickname,
      chips: room.settings.initialChips,
      seatIndex: room.players.length,
      bet: 0,
      totalBet: 0,
      folded: false,
      hasActed: false,
      hasUsedTimeBank: false,
      holeCards: [],
      status: 'active',
      won: 0,
      raiseCount: 0,
    });
    return { success: true, room };
  }

  leaveRoom(roomId, socketId) {
    const room = this.rooms.get(roomId);
    if (!room) return { hostChanged: false };
    const wasHost = room.hostSocketId === socketId;
    room.players = room.players.filter(p => p.socketId !== socketId);
    if (room.players.length === 0) {
      this.rooms.delete(roomId);
      return { hostChanged: false, roomDeleted: true };
    }
    if (wasHost) {
      room.hostSocketId = room.players[0].socketId;
      return { hostChanged: true, newHostSocketId: room.players[0].socketId };
    }
    return { hostChanged: false };
  }

  startGame(roomId) {
    const room = this.rooms.get(roomId);
    if (!room || room.players.length < 2) return { error: 'NOT_ENOUGH_PLAYERS' };
    if (room.phase !== 'waiting') return { error: 'GAME_ALREADY_STARTED' };

    const n = room.players.length;
    const dealerIdx = room.dealerIndex % n;
    // Heads-up: dealer = SB; 3+ players: SB is left of dealer
    const sbIdx = n === 2 ? dealerIdx : (dealerIdx + 1) % n;
    const bbIdx = n === 2 ? (dealerIdx + 1) % n : (dealerIdx + 2) % n;

    const deck = shuffle(createDeck());
    const playerIds = room.players.map(p => p.socketId);
    const { hands, remainingDeck } = dealHands(deck, playerIds);

    room.players.forEach(p => {
      p.holeCards = hands[p.socketId];
      p.bet = 0;
      p.totalBet = 0;
      p.folded = false;
      p.hasActed = false;
      p.hasUsedTimeBank = false;
      p.status = 'active';
      p.won = 0;
      p.raiseCount = 0;
    });

    room.deck = remainingDeck;
    room.communityCards = [];
    room.pot = 0;
    room.loopNum = 0;
    room.actedPlayerIds = new Set();
    room.phase = 'preflop';
    room.dealerIndex = dealerIdx;

    // Post blinds
    const sbPlayer = room.players[sbIdx];
    const bbPlayer = room.players[bbIdx];
    const sbAmount = Math.min(room.settings.smallBlind, sbPlayer.chips);
    const bbAmount = Math.min(room.settings.smallBlind * 2, bbPlayer.chips);

    sbPlayer.chips -= sbAmount;
    sbPlayer.bet = sbAmount;
    sbPlayer.totalBet = sbAmount;
    bbPlayer.chips -= bbAmount;
    bbPlayer.bet = bbAmount;
    bbPlayer.totalBet = bbAmount;
    room.pot = sbAmount + bbAmount;
    room.betSize = bbAmount;

    // Pre-flop: heads-up → dealer/SB acts first; 3+ players → UTG acts first
    if (n === 2) {
      room.currentTurnIndex = dealerIdx;
    } else {
      room.currentTurnIndex = (dealerIdx + 3) % n;
    }
    room.lastAggressorIndex = bbIdx;

    return { success: true };
  }

  advanceToNextStreet(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return { error: 'ROOM_NOT_FOUND' };

    room.loopNum += 1;
    room.actedPlayerIds = new Set();
    room.players.forEach(p => { p.bet = 0; p.hasActed = false; });
    room.betSize = 0;

    // Post-flop: action starts from first active player after dealer (SB position)
    const n = room.players.length;
    const startSearch = (room.dealerIndex + 1) % n;
    room.currentTurnIndex = -1; // default: no one acts (all-in runout)
    for (let i = 0; i < n; i++) {
      const idx = (startSearch + i) % n;
      const p = room.players[idx];
      if (!p.folded && p.chips > 0) {
        room.currentTurnIndex = idx;
        break;
      }
    }
    room.lastAggressorIndex = room.currentTurnIndex;

    if (room.loopNum === 1) {
      const { drawn, remainingDeck } = drawCards(room.deck, 3);
      room.communityCards.push(...drawn);
      room.deck = remainingDeck;
      room.phase = 'flop';
    } else if (room.loopNum === 2) {
      const { drawn, remainingDeck } = drawCards(room.deck, 1);
      room.communityCards.push(...drawn);
      room.deck = remainingDeck;
      room.phase = 'turn';
    } else if (room.loopNum === 3) {
      const { drawn, remainingDeck } = drawCards(room.deck, 1);
      room.communityCards.push(...drawn);
      room.deck = remainingDeck;
      room.phase = 'river';
    } else {
      room.phase = 'showdown';
    }
    return { success: true };
  }

  advanceDealer(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    room.dealerIndex = (room.dealerIndex + 1) % room.players.length;
  }

  rebuy(roomId, socketId, amount) {
    const room = this.rooms.get(roomId);
    if (!room) return { error: 'ROOM_NOT_FOUND' };
    if (amount > room.settings.maxRebuyAmount) return { error: 'EXCEEDS_REBUY_LIMIT' };
    const player = room.players.find(p => p.socketId === socketId);
    if (!player) return { error: 'PLAYER_NOT_FOUND' };
    player.chips += amount;
    return { success: true };
  }

  getRoom(roomId) {
    return this.rooms.get(roomId);
  }

  getRoomBySocket(socketId) {
    for (const room of this.rooms.values()) {
      if (room.players.find(p => p.socketId === socketId)) return room;
    }
    return null;
  }
}

module.exports = RoomManager;

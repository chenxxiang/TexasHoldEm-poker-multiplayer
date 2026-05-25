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
        folded: false,
        hasActed: false,
        hasUsedTimeBank: false,
        holeCards: [],
      }],
      phase: 'waiting',
      communityCards: [],
      pot: 0,
      betSize: settings.smallBlind * 2,
      currentTurnIndex: -1,
      lastAggressorIndex: 0,
      loopNum: 0,
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
      folded: false,
      hasActed: false,
      hasUsedTimeBank: false,
      holeCards: [],
    });
    return { success: true, room };
  }

  leaveRoom(roomId, socketId) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    room.players = room.players.filter(p => p.socketId !== socketId);
    if (room.players.length === 0) this.rooms.delete(roomId);
  }

  startGame(roomId) {
    const room = this.rooms.get(roomId);
    if (!room || room.players.length < 2) return { error: 'NOT_ENOUGH_PLAYERS' };
    const deck = shuffle(createDeck());
    const playerIds = room.players.map(p => p.socketId);
    const { hands, remainingDeck } = dealHands(deck, playerIds);
    room.players.forEach(p => {
      p.holeCards = hands[p.socketId];
      p.bet = 0;
      p.folded = false;
      p.hasActed = false;
    });
    room.deck = remainingDeck;
    room.communityCards = [];
    room.pot = 0;
    room.betSize = room.settings.smallBlind * 2;
    room.loopNum = 0;
    room.actedPlayerIds = new Set();
    room.currentTurnIndex = 0;
    room.lastAggressorIndex = 0;
    room.phase = 'preflop';
    // Post blinds
    const sbPlayer = room.players[0];
    const bbPlayer = room.players[1] || room.players[0];
    sbPlayer.chips -= room.settings.smallBlind;
    sbPlayer.bet = room.settings.smallBlind;
    bbPlayer.chips -= room.settings.smallBlind * 2;
    bbPlayer.bet = room.settings.smallBlind * 2;
    room.pot = room.settings.smallBlind * 3;
    room.currentTurnIndex = room.players.length > 2 ? 2 : 0;
    room.lastAggressorIndex = 1;
    return { success: true };
  }

  advanceToNextStreet(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return { error: 'ROOM_NOT_FOUND' };
    room.loopNum += 1;
    room.actedPlayerIds = new Set();
    room.players.forEach(p => { p.bet = 0; p.hasActed = false; });
    room.betSize = 0;
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

  getActivePlayers(room) {
    return room.players.filter(p => !p.folded);
  }
}

module.exports = RoomManager;

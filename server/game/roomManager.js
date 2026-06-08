const { createDeck, shuffle, dealHands, drawCards } = require('./deck');
const fs = require('fs');
const path = require('path');

const PERSIST_FILE = path.join(__dirname, '../../data/rooms.json');

class RoomManager {
  constructor() {
    this.rooms = new Map();
    this._loadFromDisk();
  }

  _generateRoomId() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let id = '';
    for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
    return this.rooms.has(id) ? this._generateRoomId() : id;
  }

  _defaultPlayerFields() {
    return {
      socketId: '',
      bet: 0,
      totalBet: 0,
      folded: false,
      hasActed: false,
      hasUsedTimeBank: false,
      holeCards: [],
      status: 'active',
      won: 0,
      raiseCount: 0,
      disconnected: true,
      readyStatus: 'pending',
      voluntaryReveal: false,
    };
  }

  saveToDisk(rooms) {
    const target = rooms || this.rooms;
    const data = {};
    for (const [roomId, room] of target.entries()) {
      data[roomId] = {
        roomId,
        settings: room.settings,
        dealerIndex: room.dealerIndex || 0,
        handHistory: (room.handHistory || []).slice(-5),
        players: room.players.map(p => ({
          nickname: p.nickname,
          chips: p.chips,
          seatIndex: p.seatIndex,
          rebuyCount: p.rebuyCount || 0,
          stats: p.stats || { handsPlayed: 0, wins: 0 },
        })),
      };
    }
    try {
      fs.mkdirSync(path.dirname(PERSIST_FILE), { recursive: true });
      fs.writeFileSync(PERSIST_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
      console.error('[persist] save error:', e.message);
    }
  }

  _loadFromDisk() {
    try {
      if (!fs.existsSync(PERSIST_FILE)) return;
      const data = JSON.parse(fs.readFileSync(PERSIST_FILE, 'utf8'));
      for (const [roomId, saved] of Object.entries(data)) {
        const room = {
          roomId,
          hostSocketId: '',
          settings: saved.settings,
          players: (saved.players || []).map(p => ({
            ...this._defaultPlayerFields(),
            nickname: p.nickname,
            chips: p.chips,
            seatIndex: p.seatIndex,
            rebuyCount: p.rebuyCount || 0,
            stats: p.stats || { handsPlayed: 0, wins: 0 },
          })),
          phase: 'waiting',
          communityCards: [],
          pot: 0,
          betSize: (saved.settings?.smallBlind || 5) * 2,
          currentTurnIndex: -1,
          lastAggressorIndex: 0,
          loopNum: 0,
          dealerIndex: saved.dealerIndex || 0,
          actedPlayerIds: new Set(),
          deck: [],
          actionLog: [],
          handHistory: saved.handHistory || [],
        };
        this.rooms.set(roomId, room);
        console.log(`[persist] restored room ${roomId} with ${room.players.length} players`);
      }
    } catch (e) {
      console.error('[persist] load error:', e.message);
    }
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
        actionTime: settings.actionTime || 20,
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
        disconnected: false,
        readyStatus: 'pending',
        voluntaryReveal: false,
        rebuyCount: 0,
        stats: { handsPlayed: 0, wins: 0 },
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
      actionLog: [],
      handHistory: [],
    };
    this.rooms.set(roomId, room);
    return room;
  }

  joinRoom(roomId, socketId, nickname) {
    const room = this.rooms.get(roomId);
    if (!room) return { error: 'ROOM_NOT_FOUND' };

    // Reconnect: same nickname already in room
    const existing = room.players.find(p => p.nickname === nickname);
    if (existing) {
      existing.socketId = socketId;
      existing.disconnected = false;
      if (!room.hostSocketId) room.hostSocketId = socketId;
      return { success: true, reconnected: true, room };
    }

    // New player
    if (room.players.length >= 10) return { error: 'ROOM_FULL' };

    const midGame = room.phase !== 'waiting';
    room.players.push({
      socketId,
      nickname,
      chips: room.settings.initialChips,
      seatIndex: room.players.length,
      bet: 0,
      totalBet: 0,
      folded: midGame,
      hasActed: midGame,
      hasUsedTimeBank: false,
      holeCards: [],
      status: midGame ? 'spectating' : 'active',
      won: 0,
      raiseCount: 0,
      disconnected: false,
      readyStatus: 'pending',
      voluntaryReveal: false,
      rebuyCount: 0,
      stats: { handsPlayed: 0, wins: 0 },
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
      const newHost = room.players.find(p => !p.disconnected) || room.players[0];
      room.hostSocketId = newHost.socketId;
      return { hostChanged: true, newHostSocketId: newHost.socketId };
    }
    return { hostChanged: false };
  }

  _nextPlayingIndex(room, fromIndex) {
    const n = room.players.length;
    for (let i = 1; i <= n; i++) {
      const idx = (fromIndex + i) % n;
      if (room.players[idx]?.status !== 'spectating') return idx;
    }
    return -1;
  }

  startGame(roomId) {
    const room = this.rooms.get(roomId);
    console.log('[startGame] roomId:', roomId, 'phase:', room?.phase, 'players:', room?.players?.length);
    if (!room || room.phase !== 'waiting') return { error: 'GAME_ALREADY_STARTED' };

    const playingPlayers = room.players.filter(p => p.status !== 'spectating');
    console.log('[startGame] playingPlayers:', playingPlayers.length, 'statuses:', room.players.map(p => p.status));
    if (playingPlayers.length < 2) return { error: 'NOT_ENOUGH_PLAYERS' };

    const n = room.players.length;

    for (let i = 0; i < n; i++) {
      if (room.players[room.dealerIndex % n]?.status !== 'spectating') break;
      room.dealerIndex = (room.dealerIndex + 1) % n;
    }
    const dealerIdx = room.dealerIndex % n;

    const sbIdx = playingPlayers.length === 2
      ? dealerIdx
      : this._nextPlayingIndex(room, dealerIdx);
    const bbIdx = this._nextPlayingIndex(room, sbIdx);
    const firstToActIdx = playingPlayers.length === 2
      ? dealerIdx
      : this._nextPlayingIndex(room, bbIdx);

    const deck = shuffle(createDeck());
    const { hands, remainingDeck } = dealHands(deck, playingPlayers.map(p => p.socketId));

    room.players.forEach(p => {
      if (p.status === 'spectating') {
        p.holeCards = [];
        p.folded = true;
        p.bet = 0;
        p.totalBet = 0;
        p.hasActed = true;
        p.won = 0;
      } else {
        p.holeCards = hands[p.socketId];
        p.bet = 0;
        p.totalBet = 0;
        p.folded = false;
        p.hasActed = false;
        p.hasUsedTimeBank = false;
        p.status = 'active';
        p.won = 0;
        p.raiseCount = 0;
        if (!p.stats) p.stats = { handsPlayed: 0, wins: 0 };
        p.stats.handsPlayed += 1;
      }
    });

    room.deck = remainingDeck;
    room.communityCards = [];
    room.pot = 0;
    room.loopNum = 0;
    room.actedPlayerIds = new Set();
    room.actionLog = [];
    room.phase = 'preflop';

    const sbPlayer = room.players[sbIdx];
    const bbPlayer = room.players[bbIdx];
    const sbAmount = Math.min(room.settings.smallBlind, sbPlayer.chips);
    const bbAmount = Math.min(room.settings.smallBlind * 2, bbPlayer.chips);

    sbPlayer.chips -= sbAmount; sbPlayer.bet = sbAmount; sbPlayer.totalBet = sbAmount;
    bbPlayer.chips -= bbAmount; bbPlayer.bet = bbAmount; bbPlayer.totalBet = bbAmount;
    room.pot = sbAmount + bbAmount;
    room.betSize = bbAmount;

    room.currentTurnIndex = firstToActIdx;
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

    const n = room.players.length;
    const startSearch = (room.dealerIndex + 1) % n;
    room.currentTurnIndex = -1;
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
    const n = room.players.length;
    for (let i = 0; i < n; i++) {
      room.dealerIndex = (room.dealerIndex + 1) % n;
      if (room.players[room.dealerIndex]?.status !== 'spectating') break;
    }
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

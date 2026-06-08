const RoomManager = require('../game/roomManager');
const TimerManager = require('../timerManager');

const roomManager = new RoomManager();
const timerManager = new TimerManager();

module.exports = (io, socket) => {

  // ── 创建房间 ──────────────────────────────────────────────
  socket.on('createRoom', ({ nickname, settings }) => {
    if (!nickname || !settings) { socket.emit('error', { code: 'INVALID_PARAMS' }); return; }
    const room = roomManager.createRoom(socket.id, nickname, settings);
    socket.join(room.roomId);
    socket.emit('roomCreated', { roomId: room.roomId, room: sanitizeRoom(room, socket.id) });
  });

  // ── 加入房间 ──────────────────────────────────────────────
  socket.on('joinRoom', ({ roomId, nickname }) => {
    const result = roomManager.joinRoom(roomId, socket.id, nickname);
    if (result.error) { socket.emit('joinError', { code: result.error }); return; }

    socket.join(roomId);

    if (result.reconnected) {
      const room = result.room;
      socket.emit('joinedRoom', { room: sanitizeRoom(room, socket.id) });
      io.to(roomId).emit('playerReconnected', { nickname, socketId: socket.id });
      if (room.phase === 'settlement' && room._settlementBaseResults) {
        const results = recomputeSettlementResults(room, socket.id);
        socket.emit('showdown', {
          room: sanitizeRoom(room, socket.id),
          results,
          wasMuckWin: room._settlementWasMuckWin,
          settlementDeadline: room._settlementDeadline,
          potBreakdown: room._potBreakdown || [],
          isReconnect: true,
          actionLog: room._actionLog || [],
        });
      }
      return;
    }

    socket.emit('joinedRoom', { room: sanitizeRoom(result.room, socket.id) });
    for (const player of result.room.players) {
      if (player.socketId !== socket.id) {
        io.to(player.socketId).emit('playerJoined', { room: sanitizeRoom(result.room, player.socketId) });
      }
    }
  });

  // ── 主动同步房间状态 ──────────────────────────────────────
  socket.on('getRoomState', ({ roomId }) => {
    const room = roomManager.getRoom(roomId);
    if (!room) return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player) return;
    socket.join(roomId);
    if (room.phase === 'settlement' && room._settlementBaseResults) {
      const results = recomputeSettlementResults(room, socket.id);
      socket.emit('showdown', {
        room: sanitizeRoom(room, socket.id),
        results,
        wasMuckWin: room._settlementWasMuckWin,
        settlementDeadline: room._settlementDeadline,
        potBreakdown: room._potBreakdown || [],
        isReconnect: true,
        actionLog: room._actionLog || [],
      });
    } else {
      socket.emit('gameStateUpdate', { room: sanitizeRoom(room, socket.id) });
    }
  });

  // ── 获取手牌历史 ──────────────────────────────────────────
  socket.on('getHandHistory', ({ roomId }) => {
    const room = roomManager.getRoom(roomId);
    if (!room) return;
    socket.emit('handHistory', { history: room.handHistory || [] });
  });

  // ── 开始游戏（房主触发，仅第一局需要手动）────────────────
  socket.on('startGame', ({ roomId }) => {
    const room = roomManager.getRoom(roomId);
    if (!room || room.hostSocketId !== socket.id) { socket.emit('error', { code: 'NOT_HOST' }); return; }
    const result = roomManager.startGame(roomId);
    if (result.error) { socket.emit('error', { code: result.error }); return; }
    const updatedRoom = roomManager.getRoom(roomId);
    broadcastToEach(io, updatedRoom, 'gameStarted');
    startNextPlayerTimer(updatedRoom);
  });

  // ── 玩家行动 ──────────────────────────────────────────────
  socket.on('playerAction', ({ roomId, action, amount }) => {
    const room = roomManager.getRoom(roomId);
    if (!room) return;

    // Race condition guard: prevent double-processing
    if (room._processing) return;
    room._processing = true;

    const actor = room.players[room.currentTurnIndex];
    if (!actor || actor.socketId !== socket.id) {
      room._processing = false;
      return;
    }

    timerManager.clearTimer(roomId);

    const valid = applyAction(room, actor, action, Number(amount) || 0);
    if (!valid) {
      room._processing = false;
      socket.emit('actionError', { code: 'INVALID_ACTION' });
      return;
    }

    room._processing = false;
    const lastAction = { socketId: actor.socketId, action, amount: Number(amount) || 0 };
    processAfterAction(room, roomId, lastAction);
  });

  // ── 时间银行 ──────────────────────────────────────────────
  socket.on('extendTime', ({ roomId }) => {
    const room = roomManager.getRoom(roomId);
    if (!room) return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player) return;
    const result = timerManager.extendTimer(roomId);
    if (result.error) { socket.emit('timeBankError', { code: result.error }); return; }
    player.hasUsedTimeBank = true;
    io.to(roomId).emit('timerExtended', { socketId: socket.id });
  });

  // ── 补码 ──────────────────────────────────────────────────
  socket.on('rebuy', ({ roomId, amount }) => {
    const room = roomManager.getRoom(roomId);
    if (!room) { socket.emit('rebuyError', { code: 'ROOM_NOT_FOUND' }); return; }
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player) { socket.emit('rebuyError', { code: 'PLAYER_NOT_FOUND' }); return; }
    if (room.phase !== 'waiting' && !player.folded && player.chips > 0) {
      socket.emit('rebuyError', { code: 'CANNOT_REBUY_NOW' });
      return;
    }
    const rebuyAmount = Number(amount) || room.settings.initialChips;
    if (room.settings.maxRebuyAmount && rebuyAmount > room.settings.maxRebuyAmount) {
      socket.emit('rebuyError', { code: 'EXCEEDS_REBUY_LIMIT' });
      return;
    }
    player.chips += rebuyAmount;
    player.rebuyCount = (player.rebuyCount || 0) + 1;
    broadcastToEach(io, room, 'gameStateUpdate');
  });

  // ── 结算阶段：准备/观战 ───────────────────────────────────
  socket.on('playerReadyStatus', ({ roomId, status }) => {
    const room = roomManager.getRoom(roomId);
    if (!room || room.phase !== 'settlement') return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player) return;
    player.readyStatus = status;
    broadcastToEach(io, room, 'gameStateUpdate');
    checkAllReadyAndStart(roomId);
  });

  socket.on('queueForNextHand', ({ roomId }) => {
    const room = roomManager.getRoom(roomId);
    if (!room) return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player) return;
    player.readyStatus = 'queued';
    broadcastToEach(io, room, 'gameStateUpdate');
    checkAllReadyAndStart(roomId);
  });

  socket.on('foldToSpectate', ({ roomId }) => {
    const room = roomManager.getRoom(roomId);
    if (!room) return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.folded || player.status === 'spectating') return;
    player.status = 'spectating';
    player.readyStatus = 'spectating';
    broadcastToEach(io, room, 'gameStateUpdate');
  });

  // ── 结算阶段：自主揭示手牌 ───────────────────────────────────
  socket.on('revealCards', ({ roomId }) => {
    const room = roomManager.getRoom(roomId);
    if (!room || room.phase !== 'settlement') return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player) return;
    player.voluntaryReveal = true;
    io.to(roomId).emit('cardRevealed', {
      socketId: socket.id,
      holeCards: player.holeCards,
    });
  });

  // ── 嘲讽 / 表情气泡 ──────────────────────────────────────────
  socket.on('playerTaunt', ({ roomId, type, payload }) => {
    const room = roomManager.getRoom(roomId);
    if (!room) return;
    const sender = room.players.find(p => p.socketId === socket.id);
    if (!sender) return;
    io.to(roomId).emit('playerTaunt', {
      socketId: socket.id,
      nickname: sender.nickname,
      type,
      payload,
    });
  });

  // ── 断线处理 ──────────────────────────────────────────────
  socket.on('disconnect', () => {
    const room = roomManager.getRoomBySocket(socket.id);
    if (!room) return;

    const roomId = room.roomId;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player) return;

    player.disconnected = true;

    // Only clear timer if it's NOT this player's turn.
    // If it IS their turn, let the server-side timer continue → auto-fold when it fires.
    const isTheirTurn = room.players[room.currentTurnIndex]?.socketId === socket.id;
    if (!isTheirTurn) timerManager.clearTimer(roomId);

    if (room.players.every(p => p.disconnected)) {
      if (room._settlementTimeout) {
        clearTimeout(room._settlementTimeout);
        room._settlementTimeout = null;
      }
      // Don't delete room — keep for reconnect (persistence handles cleanup)
      broadcastToEach(io, room, 'gameStateUpdate');
      return;
    }

    broadcastToEach(io, room, 'gameStateUpdate');

    if (room.phase === 'settlement') {
      if (player.readyStatus === 'pending') player.readyStatus = 'spectating';
      checkAllReadyAndStart(roomId);
    }
  });

  // ─────────────────────────────────────────────────────────
  // 游戏流程核心逻辑
  // ─────────────────────────────────────────────────────────

  function processAfterAction(room, roomId, lastAction = null) {
    const extra = lastAction ? { lastAction } : {};
    if (!shouldAdvanceStreet(room)) {
      advanceTurn(room);
      broadcastToEach(io, room, 'gameStateUpdate', extra);
      startNextPlayerTimer(room);
      return;
    }

    const active = room.players.filter(p => !p.folded);
    if (active.length <= 1) {
      resolveShowdown(room, io, room.roomId);
      return;
    }

    const canAct = active.filter(p => p.chips > 0);
    if (canAct.length === 0) room.currentTurnIndex = -1;
    broadcastToEach(io, room, 'gameStateUpdate', extra);
    advanceStreet(roomId);
  }

  function advanceStreet(roomId) {
    const streetResult = roomManager.advanceToNextStreet(roomId);
    if (streetResult.error) return;
    const updatedRoom = roomManager.getRoom(roomId);

    if (updatedRoom.phase === 'showdown') {
      resolveShowdown(updatedRoom, io, roomId);
      return;
    }

    broadcastToEach(io, updatedRoom, 'gameStateUpdate');

    const active = updatedRoom.players.filter(p => !p.folded);
    const canAct = active.filter(p => p.chips > 0);
    if (canAct.length === 0 && active.length > 1) {
      autoRunBoard(roomId);
    } else {
      startNextPlayerTimer(updatedRoom);
    }
  }

  function autoRunBoard(roomId) {
    setTimeout(() => {
      const r = roomManager.getRoom(roomId);
      if (!r || r.phase === 'showdown' || r.phase === 'waiting') return;
      advanceStreet(roomId);
    }, 1500);
  }

  function applyAction(room, actor, action, amount) {
    if (!room.actionLog) room.actionLog = [];
    if (action === 'fold') {
      actor.folded = true;
      actor.hasActed = true;
      room.actedPlayerIds.add(actor.socketId);
      room.actionLog.push({ phase: room.phase, nickname: actor.nickname, action: 'fold', amount: 0 });
      return true;
    }
    if (action === 'check') {
      if (room.betSize - actor.bet > 0) return false;
      actor.hasActed = true;
      room.actedPlayerIds.add(actor.socketId);
      room.actionLog.push({ phase: room.phase, nickname: actor.nickname, action: 'check', amount: 0 });
      return true;
    }
    if (action === 'call') {
      const toCall = Math.min(room.betSize - actor.bet, actor.chips);
      actor.chips -= toCall;
      actor.bet += toCall;
      actor.totalBet = (actor.totalBet || 0) + toCall;
      room.pot += toCall;
      actor.hasActed = true;
      room.actedPlayerIds.add(actor.socketId);
      if (actor.chips === 0) actor.status = 'allin';
      room.actionLog.push({ phase: room.phase, nickname: actor.nickname, action: 'call', amount: toCall });
      return true;
    }
    if (action === 'raise') {
      if (amount <= room.betSize) return false;
      const callAmount = Math.max(0, room.betSize - actor.bet);
      const raiseBy = amount - room.betSize;
      const total = callAmount + raiseBy;
      if (actor.chips < total) return false;
      actor.chips -= total;
      actor.bet += total;
      actor.totalBet = (actor.totalBet || 0) + total;
      room.pot += total;
      room.betSize = amount;
      room.lastAggressorIndex = room.currentTurnIndex;
      actor.raiseCount = (actor.raiseCount || 0) + 1;
      if (actor.chips === 0) actor.status = 'allin';
      room.players.forEach(p => { if (p.socketId !== actor.socketId && !p.folded) p.hasActed = false; });
      room.actedPlayerIds = new Set([actor.socketId]);
      actor.hasActed = true;
      room.actionLog.push({ phase: room.phase, nickname: actor.nickname, action: 'raise', amount });
      return true;
    }
    if (action === 'allin') {
      const allInAmount = actor.chips;
      actor.bet += allInAmount;
      actor.totalBet = (actor.totalBet || 0) + allInAmount;
      room.pot += allInAmount;
      actor.chips = 0;
      actor.status = 'allin';
      if (actor.bet > room.betSize) {
        room.betSize = actor.bet;
        room.lastAggressorIndex = room.currentTurnIndex;
        room.players.forEach(p => { if (p.socketId !== actor.socketId && !p.folded) p.hasActed = false; });
        room.actedPlayerIds = new Set([actor.socketId]);
      }
      actor.hasActed = true;
      room.actedPlayerIds.add(actor.socketId);
      room.actionLog.push({ phase: room.phase, nickname: actor.nickname, action: 'allin', amount: allInAmount });
      return true;
    }
    return false;
  }

  function shouldAdvanceStreet(room) {
    const active = room.players.filter(p => !p.folded);
    if (active.length <= 1) return true;
    const canAct = active.filter(p => p.chips > 0);
    if (canAct.length === 0) return true;
    return canAct.every(p => p.hasActed && p.bet === room.betSize);
  }

  function advanceTurn(room) {
    const total = room.players.length;
    let next = room.currentTurnIndex;
    for (let i = 0; i < total; i++) {
      next = (next + 1) % total;
      const p = room.players[next];
      if (!p.folded && p.chips > 0) break;
    }
    room.currentTurnIndex = next;
  }

  function startNextPlayerTimer(room) {
    const actor = room.players[room.currentTurnIndex];
    if (!actor || actor.folded || actor.chips === 0) {
      const active = room.players.filter(p => !p.folded);
      const canAct = active.filter(p => p.chips > 0);
      if (canAct.length === 0 && active.length > 1 && room.phase !== 'showdown' && room.phase !== 'waiting') {
        autoRunBoard(room.roomId);
      }
      return;
    }

    timerManager.startTimer(room.roomId, actor.nickname, room.settings.actionTime || 20, (actorNickname, roomId) => {
      const r = roomManager.getRoom(roomId);
      if (!r) return;
      const timedOutActor = r.players[r.currentTurnIndex];
      // Match by nickname to handle reconnects where socketId changed
      if (!timedOutActor || timedOutActor.nickname !== actorNickname) return;
      const autoAction = timedOutActor.chips === 0 ? 'check' : 'fold';
      applyAction(r, timedOutActor, autoAction, 0);
      io.to(roomId).emit('timedOut', { socketId: timedOutActor.socketId, autoAction });
      const lastAction = { socketId: timedOutActor.socketId, action: autoAction, amount: 0 };
      processAfterAction(r, roomId, lastAction);
    });

    io.to(room.roomId).emit('timerStarted', {
      socketId: actor.socketId,
      duration: room.settings.actionTime || 20,
      hasTimeBank: !actor.hasUsedTimeBank,
    });
  }

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

  function recomputeSettlementResults(room, viewerSocketId) {
    if (!room._settlementBaseResults) return [];
    const wasMuckWin = room._settlementWasMuckWin;
    return room._settlementBaseResults.map(r => {
      const p = room.players.find(x => x.nickname === r.nickname);
      const currentSocketId = p?.socketId ?? r.socketId;
      const canSeeCards = !wasMuckWin || currentSocketId === viewerSocketId || p?.voluntaryReveal;
      const holeCards = canSeeCards && p && !p.folded
        ? p.holeCards
        : p && p.folded ? [] : ['hidden', 'hidden'];
      return { ...r, socketId: currentSocketId, holeCards };
    });
  }

  function resolveShowdown(room, io, roomId) {
    const active = room.players.filter(p => !p.folded);
    const winnings = {}; // nickname -> total won
    const potBreakdown = []; // [{ amount, winners: [nickname], type: 'main'|'side' }]

    if (active.length === 1) {
      const w = active[0];
      winnings[w.nickname] = room.pot;
      potBreakdown.push({ amount: room.pot, winners: [w.nickname], type: 'main' });
    } else {
      try {
        const { Hand } = require('pokersolver');
        const community = room.communityCards.map(c => c.code);
        const sidePots = calculateSidePots(room.players);

        sidePots.forEach((pot, idx) => {
          if (pot.eligible.length === 0) return;
          if (pot.eligible.length === 1) {
            const w = pot.eligible[0];
            winnings[w.nickname] = (winnings[w.nickname] || 0) + pot.amount;
            potBreakdown.push({ amount: pot.amount, winners: [w.nickname], type: idx === 0 ? 'main' : 'side' });
            return;
          }
          const solved = pot.eligible.map(p => ({
            player: p,
            hand: Hand.solve([...p.holeCards.map(c => c.code), ...community]),
          }));
          const winningHands = Hand.winners(solved.map(s => s.hand));
          const potWinners = solved.filter(s => winningHands.includes(s.hand)).map(s => s.player);
          const share = Math.floor(pot.amount / potWinners.length);
          potWinners.forEach(w => {
            winnings[w.nickname] = (winnings[w.nickname] || 0) + share;
          });
          potBreakdown.push({
            amount: pot.amount,
            winners: potWinners.map(w => w.nickname),
            type: idx === 0 ? 'main' : 'side',
          });
        });
      } catch (e) {
        const w = active[0];
        winnings[w.nickname] = room.pot;
        potBreakdown.push({ amount: room.pot, winners: [w.nickname], type: 'main' });
      }
    }

    room.players.forEach(p => {
      p.won = winnings[p.nickname] || 0;
      p.chips += p.won;
      // Update win stats
      if (p.won > 0) {
        if (!p.stats) p.stats = { handsPlayed: 0, wins: 0 };
        p.stats.wins += 1;
      }
    });
    room.pot = 0;
    room.phase = 'settlement';
    room.players.forEach(p => {
      p.readyStatus = (p.status === 'spectating' || p.disconnected) ? 'spectating' : 'pending';
    });

    const { Hand } = require('pokersolver');
    const community = room.communityCards.map(c => c.code);
    const baseResults = room.players.map(p => {
      let handName = null;
      if (!p.folded && active.length > 1) {
        try {
          handName = Hand.solve([...p.holeCards.map(c => c.code), ...community]).name;
        } catch (e) { /* ignore */ }
      }
      return {
        socketId: p.socketId,
        nickname: p.nickname,
        delta: p.won - (p.totalBet || 0),
        handName,
      };
    });

    const wasMuckWin = active.length === 1;
    const settlementDeadline = Date.now() + 10000;

    // Save hand to history
    const handRecord = {
      handNum: (room.handHistory?.length || 0) + 1,
      communityCards: [...room.communityCards],
      potBreakdown,
      players: baseResults.map(r => ({ nickname: r.nickname, delta: r.delta, handName: r.handName })),
      wasMuckWin,
      timestamp: Date.now(),
    };
    if (!room.handHistory) room.handHistory = [];
    room.handHistory.push(handRecord);
    if (room.handHistory.length > 5) room.handHistory.shift();

    room._settlementBaseResults = baseResults;
    room._settlementWasMuckWin = wasMuckWin;
    room._settlementDeadline = settlementDeadline;
    room._actionLog = room.actionLog || [];
    room._potBreakdown = potBreakdown;

    for (const player of room.players) {
      const playerResults = recomputeSettlementResults(room, player.socketId);
      io.to(player.socketId).emit('showdown', {
        room: sanitizeRoom(room, player.socketId),
        results: playerResults,
        wasMuckWin,
        settlementDeadline,
        potBreakdown,
        isReconnect: false,
        actionLog: room._actionLog,
      });
    }

    // Persist after each hand
    roomManager.saveToDisk();

    room._settlementTimeout = setTimeout(() => {
      const r = roomManager.getRoom(roomId);
      if (!r || r.phase !== 'settlement') return;
      let changed = false;
      r.players.forEach(p => {
        if (p.readyStatus === 'pending') { p.readyStatus = 'spectating'; changed = true; }
      });
      if (changed) broadcastToEach(io, r, 'gameStateUpdate');
      checkAllReadyAndStart(roomId);
    }, 10000);
  }

  // ── 工具函数 ──────────────────────────────────────────────

  function broadcastToEach(io, room, event, extra = {}) {
    for (const player of room.players) {
      io.to(player.socketId).emit(event, { room: sanitizeRoom(room, player.socketId), ...extra });
    }
  }

  function sanitizeRoom(room, viewerSocketId) {
    return {
      ...room,
      _settlementTimeout: undefined,
      _startingNextHand: undefined,
      _settlementBaseResults: undefined,
      _settlementWasMuckWin: undefined,
      _settlementDeadline: undefined,
      _actionLog: undefined,
      _potBreakdown: undefined,
      _processing: undefined,
      actedPlayerIds: [...(room.actedPlayerIds || [])],
      players: room.players.map(p => ({
        ...p,
        holeCards: p.socketId === viewerSocketId
          ? p.holeCards
          : (p.holeCards?.length ? ['hidden', 'hidden'] : []),
      })),
    };
  }

  function checkAllReadyAndStart(roomId) {
    const room = roomManager.getRoom(roomId);
    if (!room || room.phase !== 'settlement') return;

    const connected = room.players.filter(p => !p.disconnected);
    if (connected.length === 0) return;

    const allChosen = connected.every(p => p.readyStatus !== 'pending');
    if (!allChosen) return;

    const readyCount = connected.filter(
      p => p.readyStatus === 'ready' || p.readyStatus === 'queued'
    ).length;

    if (readyCount < 2) {
      broadcastToEach(io, room, 'gameStateUpdate');
      return;
    }

    startNextHand(roomId);
  }

  function startNextHand(roomId) {
    const room = roomManager.getRoom(roomId);
    if (!room) return;
    if (room._startingNextHand) return;
    room._startingNextHand = true;

    if (room._settlementTimeout) {
      clearTimeout(room._settlementTimeout);
      room._settlementTimeout = null;
    }

    timerManager.clearTimer(roomId);
    roomManager.advanceDealer(roomId);

    room.players.forEach(p => {
      if (p.readyStatus === 'spectating') {
        p.status = 'spectating';
      } else {
        p.status = 'active';
        if (p.chips === 0) {
          p.chips = room.settings.initialChips;
          p.rebuyCount = (p.rebuyCount || 0) + 1;
        }
      }
      p.holeCards = [];
      p.won = 0;
      p.bet = 0;
      p.totalBet = 0;
      p.folded = false;
      p.hasActed = false;
      p.hasUsedTimeBank = false;
      p.raiseCount = 0;
      p.readyStatus = 'pending';
      p.voluntaryReveal = false;
    });

    room.communityCards = [];
    room.pot = 0;
    room.deck = [];
    room.betSize = room.settings.smallBlind * 2;
    room.loopNum = 0;
    room.actedPlayerIds = new Set();
    room.currentTurnIndex = -1;
    room.phase = 'waiting';
    room._settlementBaseResults = null;
    room._settlementWasMuckWin = null;
    room._settlementDeadline = null;
    room.actionLog = [];
    room._actionLog = null;
    room._potBreakdown = null;

    const result = roomManager.startGame(roomId);
    room._startingNextHand = false;
    if (!result.error) {
      const next = roomManager.getRoom(roomId);
      broadcastToEach(io, next, 'gameStarted');
      startNextPlayerTimer(next);
    } else {
      broadcastToEach(io, room, 'gameStateUpdate');
    }

    // Persist chip counts after hand completes
    roomManager.saveToDisk();
  }
};

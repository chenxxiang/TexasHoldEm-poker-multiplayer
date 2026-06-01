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
      socket.emit('gameStateUpdate', { room: sanitizeRoom(result.room, socket.id) });
      io.to(roomId).emit('playerReconnected', { nickname, socketId: socket.id });
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
    socket.emit('gameStateUpdate', sanitizeRoom(room, socket.id));
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
    const actor = room.players[room.currentTurnIndex];
    if (!actor || actor.socketId !== socket.id) return;

    timerManager.clearTimer(socket.id);

    const valid = applyAction(room, actor, action, Number(amount) || 0);
    if (!valid) { socket.emit('actionError', { code: 'INVALID_ACTION' }); return; }

    processAfterAction(room, roomId);
  });

  // ── 延时申请 ──────────────────────────────────────────────
  socket.on('extendTime', ({ roomId }) => {
    const room = roomManager.getRoom(roomId);
    if (!room) return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player) return;
    const result = timerManager.extendTimer(socket.id);
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
    // 游戏中：只有弃牌后或筹码为0时可补码
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
    player.readyStatus = status; // 'ready' or 'spectating'
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

  // ── 断线处理 ──────────────────────────────────────────────
  socket.on('disconnect', () => {
    timerManager.clearTimer(socket.id);
    const room = roomManager.getRoomBySocket(socket.id);
    if (!room) return;
    const roomId = room.roomId;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player) return;

    player.disconnected = true;

    // Delete room only when all players disconnected
    if (room.players.every(p => p.disconnected)) {
      if (room._settlementTimeout) {
        clearTimeout(room._settlementTimeout);
        room._settlementTimeout = null;
      }
      roomManager.rooms.delete(roomId);
      return;
    }

    broadcastToEach(io, room, 'gameStateUpdate');
  });

  // ─────────────────────────────────────────────────────────
  // 游戏流程核心逻辑
  // ─────────────────────────────────────────────────────────

  // 玩家行动后的统一处理入口
  function processAfterAction(room, roomId) {
    if (!shouldAdvanceStreet(room)) {
      advanceTurn(room);
      broadcastToEach(io, room, 'gameStateUpdate');
      startNextPlayerTimer(room);
      return;
    }

    const active = room.players.filter(p => !p.folded);
    if (active.length <= 1) {
      resolveShowdown(room, io, room.roomId);
      return;
    }

    // 全员 all-in 或轮次结束：清除行动索引，广播当前状态，再进入下一街
    const canAct = active.filter(p => p.chips > 0);
    if (canAct.length === 0) room.currentTurnIndex = -1;
    broadcastToEach(io, room, 'gameStateUpdate');
    advanceStreet(roomId);
  }

  // 进入下一街（或摊牌）
  function advanceStreet(roomId) {
    const streetResult = roomManager.advanceToNextStreet(roomId);
    if (streetResult.error) return;
    const updatedRoom = roomManager.getRoom(roomId);

    if (updatedRoom.phase === 'showdown') {
      resolveShowdown(updatedRoom, io, roomId);
      return;
    }

    broadcastToEach(io, updatedRoom, 'gameStateUpdate');

    // 全员 all-in：自动连续翻出剩余公共牌
    const active = updatedRoom.players.filter(p => !p.folded);
    const canAct = active.filter(p => p.chips > 0);
    if (canAct.length === 0 && active.length > 1) {
      autoRunBoard(roomId);
    } else {
      startNextPlayerTimer(updatedRoom);
    }
  }

  // 全员 all-in：延迟1.5s翻下一张牌，直至showdown
  function autoRunBoard(roomId) {
    setTimeout(() => {
      const r = roomManager.getRoom(roomId);
      if (!r || r.phase === 'showdown' || r.phase === 'waiting') return;
      advanceStreet(roomId);
    }, 1500);
  }

  function applyAction(room, actor, action, amount) {
    if (action === 'fold') {
      actor.folded = true;
      actor.hasActed = true;
      room.actedPlayerIds.add(actor.socketId);
      return true;
    }
    if (action === 'check') {
      if (room.betSize - actor.bet > 0) return false;
      actor.hasActed = true;
      room.actedPlayerIds.add(actor.socketId);
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
      // Safety: if everyone is all-in and we're mid-game, trigger runout
      const active = room.players.filter(p => !p.folded);
      const canAct = active.filter(p => p.chips > 0);
      if (canAct.length === 0 && active.length > 1 && room.phase !== 'showdown' && room.phase !== 'waiting') {
        autoRunBoard(room.roomId);
      }
      return;
    }

    timerManager.startTimer(actor.socketId, room.roomId, room.settings.actionTime || 20, (socketId, roomId) => {
      const r = roomManager.getRoom(roomId);
      if (!r) return;
      const timedOutActor = r.players[r.currentTurnIndex];
      if (!timedOutActor || timedOutActor.socketId !== socketId) return;
      const autoAction = timedOutActor.chips === 0 ? 'check' : 'fold';
      applyAction(r, timedOutActor, autoAction, 0);
      io.to(roomId).emit('timedOut', { socketId, autoAction });
      processAfterAction(r, roomId);
    });

    io.to(room.roomId).emit('timerStarted', {
      socketId: actor.socketId,
      duration: room.settings.actionTime || 20,
      hasTimeBank: !actor.hasUsedTimeBank,
    });
  }

  // 边池计算：按各玩家总投入分级，确保短码玩家只赢自己能匹配的部分
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
        carryover = potAmount; // 所有投入该级别的玩家都已弃牌，金额顺延
      }
      prevLevel = level;
      remaining = remaining.filter(e => e.amount > level);
    }
    if (carryover > 0 && pots.length > 0) pots[pots.length - 1].amount += carryover;
    return pots;
  }

  function resolveShowdown(room, io, roomId) {
    const active = room.players.filter(p => !p.folded);
    const winnings = {}; // socketId -> total won

    if (active.length === 1) {
      winnings[active[0].socketId] = room.pot;
    } else {
      try {
        const { Hand } = require('pokersolver');
        const community = room.communityCards.map(c => c.code);
        const sidePots = calculateSidePots(room.players);

        for (const pot of sidePots) {
          if (pot.eligible.length === 0) continue;
          if (pot.eligible.length === 1) {
            const w = pot.eligible[0];
            winnings[w.socketId] = (winnings[w.socketId] || 0) + pot.amount;
            continue;
          }
          const solved = pot.eligible.map(p => ({
            player: p,
            hand: Hand.solve([...p.holeCards.map(c => c.code), ...community]),
          }));
          const winningHands = Hand.winners(solved.map(s => s.hand));
          const potWinners = solved.filter(s => winningHands.includes(s.hand)).map(s => s.player);
          const share = Math.floor(pot.amount / potWinners.length);
          potWinners.forEach(w => {
            winnings[w.socketId] = (winnings[w.socketId] || 0) + share;
          });
        }
      } catch (e) {
        winnings[active[0].socketId] = room.pot;
      }
    }

    room.players.forEach(p => {
      p.won = winnings[p.socketId] || 0;
      p.chips += p.won;
    });
    room.pot = 0;
    room.phase = 'settlement';
    room.players.forEach(p => { p.readyStatus = 'pending'; });

    // Build per-hand results with hand names from pokersolver
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
    const settlementDeadline = Date.now() + 60000;

    // Send each player their personalized result view
    for (const player of room.players) {
      const playerResults = baseResults.map(r => {
        const p = room.players.find(x => x.socketId === r.socketId);
        const canSeeCards = !wasMuckWin
          || r.socketId === player.socketId
          || (p && p.voluntaryReveal);
        const holeCards = canSeeCards && p && !p.folded
          ? p.holeCards
          : p && p.folded ? [] : ['hidden', 'hidden'];
        return { ...r, holeCards };
      });
      io.to(player.socketId).emit('showdown', {
        room: sanitizeRoom(room, player.socketId),
        results: playerResults,
        wasMuckWin,
        settlementDeadline,
      });
    }

    // 60-second timeout: auto-spectate pending players
    room._settlementTimeout = setTimeout(() => {
      const r = roomManager.getRoom(roomId);
      if (!r || r.phase !== 'settlement') return;
      r.players.forEach(p => {
        if (p.readyStatus === 'pending') p.readyStatus = 'spectating';
      });
      const readyCount = r.players.filter(
        p => p.readyStatus === 'ready' || p.readyStatus === 'queued'
      ).length;
      if (readyCount >= 2) {
        startNextHand(roomId);
      } else {
        broadcastToEach(io, r, 'gameStateUpdate');
      }
    }, 60000);
  }

  // ── 工具函数 ──────────────────────────────────────────────

  // 向所有玩家逐个发送（绕过 socket.io 房间），每人收到自己视角的房间状态
  function broadcastToEach(io, room, event) {
    for (const player of room.players) {
      io.to(player.socketId).emit(event, { room: sanitizeRoom(room, player.socketId) });
    }
  }

  function sanitizeRoom(room, viewerSocketId) {
    return {
      ...room,
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

    // Only consider connected players — disconnected players can't choose
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

    if (room._settlementTimeout) {
      clearTimeout(room._settlementTimeout);
      room._settlementTimeout = null;
    }

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

    const result = roomManager.startGame(roomId);
    if (!result.error) {
      const next = roomManager.getRoom(roomId);
      broadcastToEach(io, next, 'gameStarted');
      startNextPlayerTimer(next);
    } else {
      broadcastToEach(io, room, 'gameStateUpdate');
    }
  }
};

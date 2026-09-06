const RoomManager = require('../game/roomManager');
const TimerManager = require('../timerManager');
const { calculateSidePots, splitPotAmount } = require('../game/pots');

const roomManager = new RoomManager();
const timerManager = new TimerManager();
const AUTO_RUN_DELAY_MS = 500;
const BETTING_PHASES = new Set(['preflop', 'flop', 'turn', 'river']);

module.exports = (io, socket) => {
  const onPayload = (event, handler) => {
    socket.on(event, payload => {
      const safePayload = payload && typeof payload === 'object' && !Array.isArray(payload)
        ? payload
        : {};
      handler(safePayload);
    });
  };

  // ── 创建房间 ──────────────────────────────────────────────
  onPayload('createRoom', ({ nickname, settings }) => {
    if (!nickname || !settings) { socket.emit('error', { code: 'INVALID_PARAMS' }); return; }
    const room = roomManager.createRoom(socket.id, nickname, settings);
    socket.join(room.roomId);
    socket.emit('roomCreated', { roomId: room.roomId, room: sanitizeRoom(room, socket.id) });
  });

  // ── 加入房间 ──────────────────────────────────────────────
  onPayload('joinRoom', ({ roomId, nickname }) => {
    const result = roomManager.joinRoom(roomId, socket.id, nickname);
    if (result.error) { socket.emit('joinError', { code: result.error }); return; }

    socket.join(roomId);

    if (result.reconnected) {
      const room = result.room;
      // Cancel pending room cleanup if someone reconnects
      if (room._cleanupTimeout) {
        clearTimeout(room._cleanupTimeout);
        room._cleanupTimeout = null;
      }
      socket.emit('joinedRoom', { room: sanitizeRoom(room, socket.id) });
      io.to(roomId).emit('playerReconnected', { nickname, socketId: socket.id });
      if (room.phase === 'settlement' && room._settlementBaseResults) {
        const results = recomputeSettlementResults(room, socket.id);
        socket.emit('showdown', {
          room: sanitizeRoom(room, socket.id),
          results,
          wasMuckWin: room._settlementWasMuckWin,
          displayCommunityCards: room._settlementCommunityCards || room.communityCards,
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
  onPayload('getRoomState', ({ roomId }) => {
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
        displayCommunityCards: room._settlementCommunityCards || room.communityCards,
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
  onPayload('getHandHistory', ({ roomId }) => {
    const room = roomManager.getRoom(roomId);
    if (!room) return;
    socket.emit('handHistory', { history: room.handHistory || [] });
  });

  // ── 开始游戏（房主触发，仅第一局需要手动）────────────────
  onPayload('startGame', ({ roomId }) => {
    const room = roomManager.getRoom(roomId);
    if (!room || room.hostSocketId !== socket.id) { socket.emit('error', { code: 'NOT_HOST' }); return; }
    const result = roomManager.startGame(roomId);
    if (result.error) { socket.emit('error', { code: result.error }); return; }
    const updatedRoom = roomManager.getRoom(roomId);
    broadcastToEach(io, updatedRoom, 'gameStarted');
    startNextPlayerTimer(updatedRoom);
  });

  // ── 玩家行动 ──────────────────────────────────────────────
  onPayload('playerAction', ({ roomId, action, amount }) => {
    const room = roomManager.getRoom(roomId);
    if (!room) return;
    if (!BETTING_PHASES.has(room.phase) || room._settledHandId === room._handId) {
      socket.emit('actionError', { code: 'HAND_NOT_ACTIVE' });
      return;
    }
    if (room.autoRunningBoard) {
      socket.emit('actionError', { code: 'AUTO_RUN_IN_PROGRESS' });
      return;
    }

    // Race condition guard: prevent double-processing
    if (room._processing) return;
    room._processing = true;

    const actor = room.players[room.currentTurnIndex];
    if (!actor || actor.socketId !== socket.id) {
      room._processing = false;
      return;
    }

    const valid = applyAction(room, actor, action, Number(amount) || 0);
    if (!valid) {
      room._processing = false;
      socket.emit('actionError', { code: 'INVALID_ACTION' });
      return;
    }

    timerManager.clearTimer(roomId);
    room._processing = false;
    const lastAction = { socketId: actor.socketId, action, amount: Number(amount) || 0 };
    processAfterAction(room, roomId, lastAction);
  });

  // ── 时间银行 ──────────────────────────────────────────────
  onPayload('extendTime', ({ roomId }) => {
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
  onPayload('rebuy', ({ roomId, amount }) => {
    const room = roomManager.getRoom(roomId);
    if (!room) { socket.emit('rebuyError', { code: 'ROOM_NOT_FOUND' }); return; }
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player) { socket.emit('rebuyError', { code: 'PLAYER_NOT_FOUND' }); return; }
    // Only allow topping up players who are actually out of chips (or before a
    // hand has started). Folding is not the same as busting — a folded player
    // who still has chips must not be able to add more.
    if (room.phase !== 'waiting' && player.chips > 0) {
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
  onPayload('playerReadyStatus', ({ roomId, status }) => {
    const room = roomManager.getRoom(roomId);
    if (!room || room.phase !== 'settlement') return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player) return;
    player.readyStatus = status;
    broadcastToEach(io, room, 'gameStateUpdate');
    checkAllReadyAndStart(roomId);
  });

  onPayload('queueForNextHand', ({ roomId }) => {
    const room = roomManager.getRoom(roomId);
    if (!room) return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player) return;
    player.readyStatus = 'queued';
    broadcastToEach(io, room, 'gameStateUpdate');
    checkAllReadyAndStart(roomId);
  });

  onPayload('foldToSpectate', ({ roomId }) => {
    const room = roomManager.getRoom(roomId);
    if (!room) return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.folded || player.status === 'spectating') return;
    player.status = 'spectating';
    player.readyStatus = 'spectating';
    broadcastToEach(io, room, 'gameStateUpdate');
  });

  onPayload('selectHero', ({ roomId, heroId }) => {
    const room = roomManager.getRoom(roomId);
    if (!room) return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player) return;
    if (heroId && room.players.some(p => p.heroId === heroId && p.socketId !== socket.id)) {
      socket.emit('heroError', { code: 'HERO_TAKEN' });
      return;
    }
    player.heroId = heroId || null;
    broadcastToEach(io, room, 'gameStateUpdate');
  });

  // ── 结算阶段：自主揭示手牌 ───────────────────────────────────
  onPayload('revealCards', ({ roomId }) => {
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
  onPayload('playerTaunt', ({ roomId, type, payload }) => {
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

    if (room.players.every(p => p.disconnected)) {
      if (room._settlementTimeout) {
        clearTimeout(room._settlementTimeout);
        room._settlementTimeout = null;
      }
      timerManager.clearTimer(roomId);
      // All gone: start 30-min cleanup window so players can reconnect
      room._cleanupTimeout = setTimeout(() => {
        roomManager.rooms.delete(roomId);
        roomManager.saveToDisk();
        console.log(`[cleanup] room ${roomId} expired after all players disconnected`);
      }, 30 * 60 * 1000);
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
      resolveShowdown(room, io, room.roomId, room._handId);
      return;
    }

    if (shouldAutoRunBoard(room)) {
      room.currentTurnIndex = -1;
      broadcastToEach(io, room, 'gameStateUpdate', extra);
      autoRunBoard(roomId);
      return;
    }

    broadcastToEach(io, room, 'gameStateUpdate', extra);
    advanceStreet(roomId, room._handId);
  }

  function advanceStreet(roomId, handId) {
    const room = roomManager.getRoom(roomId);
    if (!room || room._handId !== handId || !BETTING_PHASES.has(room.phase)) return;

    const streetResult = roomManager.advanceToNextStreet(roomId);
    if (streetResult.error) return;
    const updatedRoom = roomManager.getRoom(roomId);

    if (updatedRoom.phase === 'showdown') {
      resolveShowdown(updatedRoom, io, roomId, handId);
      return;
    }

    broadcastToEach(io, updatedRoom, 'gameStateUpdate');

    if (shouldAutoRunBoard(updatedRoom)) {
      autoRunBoard(roomId);
    } else {
      startNextPlayerTimer(updatedRoom);
    }
  }

  function autoRunBoard(roomId) {
    const room = roomManager.getRoom(roomId);
    if (!room || !BETTING_PHASES.has(room.phase)) return;

    const handId = room._handId;
    const enteringAutoRun = !room.autoRunningBoard;
    room.autoRunningBoard = true;
    if (enteringAutoRun) {
      timerManager.clearTimer(roomId);
      broadcastToEach(io, room, 'gameStateUpdate');
    }
    if (room._autoRunTimeout) return;

    room._autoRunTimeout = setTimeout(() => {
      const r = roomManager.getRoom(roomId);
      if (!r || r._handId !== handId) return;
      r._autoRunTimeout = null;
      if (!r.autoRunningBoard || !BETTING_PHASES.has(r.phase)) return;
      advanceStreet(roomId, handId);
    }, AUTO_RUN_DELAY_MS);
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

  function shouldAutoRunBoard(room) {
    const active = room.players.filter(p => !p.folded);
    if (active.length <= 1) return false;

    const canAct = active.filter(p => p.chips > 0);
    if (canAct.length === 0) return true;

    // With only one player holding chips, betting can continue only when that
    // player still owes chips to match an all-in wager.
    return canAct.length === 1 && canAct[0].bet >= room.betSize;
  }

  function startNextPlayerTimer(room) {
    const actor = room.players[room.currentTurnIndex];
    if (!actor || actor.folded || actor.chips === 0) {
      if (shouldAutoRunBoard(room) && room.phase !== 'showdown' && room.phase !== 'waiting') {
        autoRunBoard(room.roomId);
      } else {
        const previousTurnIndex = room.currentTurnIndex;
        advanceTurn(room);
        if (room.currentTurnIndex !== previousTurnIndex) startNextPlayerTimer(room);
      }
      return;
    }

    const handId = room._handId;
    timerManager.startTimer(room.roomId, actor.nickname, room.settings.actionTime || 20, (actorNickname, roomId) => {
      const r = roomManager.getRoom(roomId);
      if (!r || r._handId !== handId) return;
      // Race guard: if the real action for this turn already resolved the hand
      // (e.g. moved to showdown/settlement) before this stale timeout fired,
      // the turn-order recompute can land back on a player whose nickname still
      // matches — do not re-run betting logic outside an active betting street.
      if (!BETTING_PHASES.has(r.phase)) return;
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

  function resolveShowdown(room, io, roomId, handId) {
    // Idempotency guard: a hand must only ever be settled once. Without this,
    // any duplicate trigger (racing timer, replayed event) that reaches here a
    // second time would re-distribute an already-emptied pot and record a
    // phantom hand-history entry, corrupting chip totals.
    if (!room || room._handId !== handId) return;
    if (room.phase !== 'showdown' && !BETTING_PHASES.has(room.phase)) return;
    if (room._autoRunTimeout) {
      clearTimeout(room._autoRunTimeout);
      room._autoRunTimeout = null;
    }
    room.autoRunningBoard = false;
    const active = room.players.filter(p => !p.folded);
    const winnings = {}; // nickname -> total won
    const potBreakdown = []; // [{ amount, winners: [nickname], type: 'main'|'side' }]
    const handNames = new Map();

    if (active.length === 1) {
      const w = active[0];
      winnings[w.nickname] = room.pot;
      potBreakdown.push({ amount: room.pot, winners: [w.nickname], type: 'main' });
    } else {
      try {
        const { Hand } = require('pokersolver');
        const community = room.communityCards.map(c => c.code);
        const sidePots = calculateSidePots(room.players);
        const solvedHands = new Map(active.map(p => [
          p,
          Hand.solve([...p.holeCards.map(c => c.code), ...community]),
        ]));

        active.forEach(p => handNames.set(p, solvedHands.get(p).name));

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
            hand: solvedHands.get(p),
          }));
          const winningHands = Hand.winners(solved.map(s => s.hand));
          const potWinners = solved.filter(s => winningHands.includes(s.hand)).map(s => s.player);
          if (potWinners.length === 0) throw new Error(`No winner for pot ${idx}`);
          const shares = splitPotAmount(pot.amount, potWinners.length);
          potWinners.forEach((w, i) => {
            winnings[w.nickname] = (winnings[w.nickname] || 0) + shares[i];
          });
          potBreakdown.push({
            amount: pot.amount,
            winners: potWinners.map(w => w.nickname),
            type: idx === 0 ? 'main' : 'side',
          });
        });

        const distributedTotal = Object.values(winnings).reduce((sum, amount) => sum + amount, 0);
        if (distributedTotal !== room.pot) {
          throw new Error(`Pot mismatch: expected ${room.pot}, calculated ${distributedTotal}`);
        }
      } catch (e) {
        console.error(`[settlement] failed for room ${roomId}, hand ${handId}:`, e);
        broadcastToEach(io, room, 'gameStateUpdate');
        room.players.forEach(p => {
          io.to(p.socketId).emit('error', { code: 'SETTLEMENT_FAILED' });
        });
        return;
      }
    }

    // Claim only after all fallible hand evaluation has completed. A failed
    // evaluation remains eligible for a later retry of the same hand.
    if (!roomManager.claimSettlement(roomId, handId)) return;

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

    const baseResults = room.players.map(p => {
      return {
        socketId: p.socketId,
        nickname: p.nickname,
        delta: p.won - (p.totalBet || 0),
        handName: handNames.get(p) || null,
      };
    });

    const wasMuckWin = active.length === 1;
    room._settlementCommunityCards = wasMuckWin && room.communityCards.length < 5
      ? [...room.communityCards, ...room.deck.slice(0, 5 - room.communityCards.length)]
      : [...room.communityCards];
    const settlementDeadline = Date.now() + 30000;

    // Save hand to history
    const lastHandNum = Number(room.handHistory?.[room.handHistory.length - 1]?.handNum);
    const nextHandNum = Number.isFinite(lastHandNum)
      ? lastHandNum + 1
      : (room.handHistory?.length || 0) + 1;
    const handRecord = {
      handNum: nextHandNum,
      communityCards: [...room.communityCards],
      potBreakdown,
      players: baseResults.map(r => {
        const player = room.players.find(p => p.nickname === r.nickname);
        const totalProfit = player
          ? player.chips
            - room.settings.initialChips
            - (player.rebuyCount || 0) * room.settings.initialChips
          : null;
        return {
          nickname: r.nickname,
          delta: r.delta,
          handName: r.handName,
          totalProfit,
        };
      }),
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
        displayCommunityCards: room._settlementCommunityCards,
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
    }, 30000);
  }

  // ── 工具函数 ──────────────────────────────────────────────

  function broadcastToEach(io, room, event, extra = {}) {
    for (const player of room.players) {
      io.to(player.socketId).emit(event, { room: sanitizeRoom(room, player.socketId), ...extra });
    }
  }

  function sanitizeRoom(room, viewerSocketId) {
    const publicRoom = { ...room };
    delete publicRoom.deck;
    delete publicRoom._settlementTimeout;
    delete publicRoom._cleanupTimeout;
    delete publicRoom._autoRunTimeout;
    delete publicRoom._startingNextHand;
    delete publicRoom._settlementBaseResults;
    delete publicRoom._settlementWasMuckWin;
    delete publicRoom._settlementCommunityCards;
    delete publicRoom._settlementDeadline;
    delete publicRoom._actionLog;
    delete publicRoom._potBreakdown;
    delete publicRoom._processing;
    delete publicRoom._handId;
    delete publicRoom._settledHandId;

    return {
      ...publicRoom,
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
    room._settlementCommunityCards = null;
    room._settlementDeadline = null;
    room.actionLog = [];
    room._actionLog = null;
    room._potBreakdown = null;
    room.autoRunningBoard = false;

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

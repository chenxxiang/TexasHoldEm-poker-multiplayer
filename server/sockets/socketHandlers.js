const RoomManager = require('../game/roomManager');
const TimerManager = require('../timerManager');

const roomManager = new RoomManager();
const timerManager = new TimerManager();

module.exports = (io, socket) => {

  // ── 创建房间 ──────────────────────────────────────────────
  socket.on('createRoom', ({ nickname, settings }) => {
    if (!nickname || !settings) {
      socket.emit('error', { code: 'INVALID_PARAMS' });
      return;
    }
    const room = roomManager.createRoom(socket.id, nickname, settings);
    socket.join(room.roomId);
    socket.emit('roomCreated', { roomId: room.roomId, room: sanitizeRoom(room, socket.id) });
  });

  // ── 加入房间 ──────────────────────────────────────────────
  socket.on('joinRoom', ({ roomId, nickname }) => {
    const result = roomManager.joinRoom(roomId, socket.id, nickname);
    if (result.error) {
      socket.emit('joinError', { code: result.error });
      return;
    }
    socket.join(roomId);
    socket.emit('joinedRoom', { room: sanitizeRoom(result.room, socket.id) });
    socket.to(roomId).emit('playerJoined', { room: sanitizeRoomForAll(result.room) });
  });

  // ── 开始游戏（房主触发）──────────────────────────────────
  socket.on('startGame', ({ roomId }) => {
    const room = roomManager.getRoom(roomId);
    if (!room || room.hostSocketId !== socket.id) {
      socket.emit('error', { code: 'NOT_HOST' });
      return;
    }
    const result = roomManager.startGame(roomId);
    if (result.error) {
      socket.emit('error', { code: result.error });
      return;
    }
    const updatedRoom = roomManager.getRoom(roomId);
    // 给每个玩家发送含手牌的私密状态
    for (const player of updatedRoom.players) {
      io.to(player.socketId).emit('gameStarted', { room: sanitizeRoom(updatedRoom, player.socketId) });
    }
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
    if (!valid) {
      socket.emit('actionError', { code: 'INVALID_ACTION' });
      return;
    }

    // 检查是否需要推进到下一个街
    if (shouldAdvanceStreet(room)) {
      const streetResult = roomManager.advanceToNextStreet(roomId);
      if (streetResult.error) return;
      const updatedRoom = roomManager.getRoom(roomId);
      if (updatedRoom.phase === 'showdown') {
        resolveShowdown(updatedRoom, io, roomId);
        return;
      }
      broadcastGameState(io, updatedRoom, roomId);
      startNextPlayerTimer(updatedRoom);
    } else {
      advanceTurn(room);
      broadcastGameState(io, room, roomId);
      startNextPlayerTimer(room);
    }
  });

  // ── 延时申请 ──────────────────────────────────────────────
  socket.on('extendTime', ({ roomId }) => {
    const room = roomManager.getRoom(roomId);
    if (!room) return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player) return;
    const result = timerManager.extendTimer(socket.id);
    if (result.error) {
      socket.emit('timeBankError', { code: result.error });
      return;
    }
    player.hasUsedTimeBank = true;
    io.to(roomId).emit('timerExtended', { socketId: socket.id });
  });

  // ── 补码 ──────────────────────────────────────────────────
  socket.on('rebuy', ({ roomId, amount }) => {
    const result = roomManager.rebuy(roomId, socket.id, Number(amount));
    if (result.error) {
      socket.emit('rebuyError', { code: result.error });
      return;
    }
    const room = roomManager.getRoom(roomId);
    io.to(roomId).emit('playerRebuyed', { room: sanitizeRoomForAll(room), socketId: socket.id });
  });

  // ── 断线处理 ──────────────────────────────────────────────
  socket.on('disconnect', () => {
    timerManager.clearTimer(socket.id);
    const room = roomManager.getRoomBySocket(socket.id);
    if (!room) return;
    const roomId = room.roomId;
    const player = room.players.find(p => p.socketId === socket.id);
    const nickname = player?.nickname || '玩家';

    // 30 秒后才真正移除（给重连机会）
    setTimeout(() => {
      const currentRoom = roomManager.getRoom(roomId);
      if (!currentRoom) return;
      const stillThere = currentRoom.players.find(p => p.socketId === socket.id);
      if (!stillThere) return;

      const leaveResult = roomManager.leaveRoom(roomId, socket.id);
      io.to(roomId).emit('playerLeft', { nickname, socketId: socket.id });

      if (leaveResult?.hostChanged) {
        io.to(roomId).emit('hostChanged', { newHostSocketId: leaveResult.newHostSocketId });
      }
      if (leaveResult?.roomDeleted) return;

      const updatedRoom = roomManager.getRoom(roomId);
      if (updatedRoom) {
        io.to(roomId).emit('gameStateUpdate', sanitizeRoomForAll(updatedRoom));
      }
    }, 30000);
  });

  // ─────────────────────────────────────────────────────────
  // 内部辅助函数
  // ─────────────────────────────────────────────────────────

  function applyAction(room, actor, action, amount) {
    if (action === 'fold') {
      actor.folded = true;
      actor.hasActed = true;
      room.actedPlayerIds.add(actor.socketId);
      return true;
    }
    if (action === 'check') {
      if (room.betSize - actor.bet > 0) return false; // 不能 check
      actor.hasActed = true;
      room.actedPlayerIds.add(actor.socketId);
      return true;
    }
    if (action === 'call') {
      const toCall = Math.min(room.betSize - actor.bet, actor.chips);
      actor.chips -= toCall;
      actor.bet += toCall;
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
      room.pot += total;
      room.betSize = amount;
      room.lastAggressorIndex = room.currentTurnIndex;
      // 重置其他玩家的 hasActed
      room.players.forEach(p => { if (p.socketId !== actor.socketId && !p.folded) p.hasActed = false; });
      room.actedPlayerIds = new Set([actor.socketId]);
      actor.hasActed = true;
      return true;
    }
    if (action === 'allin') {
      const allInAmount = actor.chips;
      actor.bet += allInAmount;
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
    if (canAct.length === 0) return true; // 所有人 all-in
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
    if (!actor || actor.folded || actor.chips === 0) return;
    timerManager.startTimer(actor.socketId, room.roomId, actor.hasUsedTimeBank, (socketId, roomId) => {
      const r = roomManager.getRoom(roomId);
      if (!r) return;
      const timedOutActor = r.players[r.currentTurnIndex];
      if (!timedOutActor || timedOutActor.socketId !== socketId) return;
      const autoAction = timedOutActor.chips === 0 ? 'check' : 'fold';
      applyAction(r, timedOutActor, autoAction, 0);
      io.to(roomId).emit('timedOut', { socketId, autoAction });
      if (shouldAdvanceStreet(r)) {
        const streetResult = roomManager.advanceToNextStreet(roomId);
        if (!streetResult.error) {
          const updated = roomManager.getRoom(roomId);
          if (updated.phase === 'showdown') {
            resolveShowdown(updated, io, roomId);
          } else {
            broadcastGameState(io, updated, roomId);
            startNextPlayerTimer(updated);
          }
        }
      } else {
        advanceTurn(r);
        broadcastGameState(io, r, roomId);
        startNextPlayerTimer(r);
      }
    });
    io.to(room.roomId).emit('timerStarted', {
      socketId: actor.socketId,
      duration: 60,
      hasTimeBank: !actor.hasUsedTimeBank,
    });
  }

  function resolveShowdown(room, io, roomId) {
    // 简单胜负判定：有多个活跃玩家时用 pokersolver，只有1人时直接获胜
    const active = room.players.filter(p => !p.folded);
    let winners = [];
    if (active.length === 1) {
      winners = [active[0]];
    } else {
      // 使用 pokersolver 比较手牌
      try {
        const { Hand } = require('pokersolver');
        const community = room.communityCards.map(c => convertCard(c.code));
        const solved = active.map(p => ({
          player: p,
          hand: Hand.solve([...p.holeCards.map(c => convertCard(c.code)), ...community]),
        }));
        const winningHands = Hand.winners(solved.map(s => s.hand));
        winners = solved
          .filter(s => winningHands.includes(s.hand))
          .map(s => s.player);
      } catch (e) {
        winners = [active[0]]; // fallback
      }
    }
    const winAmount = Math.floor(room.pot / winners.length);
    winners.forEach(w => { w.chips += winAmount; w.won = winAmount; });
    room.pot = 0;
    room.phase = 'showdown';
    io.to(roomId).emit('showdown', {
      room: {
        ...room,
        players: room.players.map(p => ({ ...p })), // 摊牌时暴露所有手牌
      },
      winners: winners.map(w => w.socketId),
    });
    // 5 秒后重置为 waiting
    setTimeout(() => {
      const r = roomManager.getRoom(roomId);
      if (r) {
        r.phase = 'waiting';
        r.players.forEach(p => { p.holeCards = []; p.won = 0; p.bet = 0; p.folded = false; p.hasActed = false; });
        r.communityCards = [];
        r.pot = 0;
        io.to(roomId).emit('gameStateUpdate', sanitizeRoomForAll(r));
      }
    }, 5000);
  }

  function convertCard(code) {
    // 将 'Ah' -> 'Ah', 'Ts' -> 'Ts' (pokersolver 格式)
    const rankMap = { 'T': 'T', 'J': 'J', 'Q': 'Q', 'K': 'K', 'A': 'A' };
    const suitMap = { 's': 's', 'h': 'h', 'd': 'd', 'c': 'c' };
    const rank = code.slice(0, -1);
    const suit = code.slice(-1);
    return (rankMap[rank] || rank) + (suitMap[suit] || suit);
  }

  function broadcastGameState(io, room, roomId) {
    // 每个玩家收到带自己手牌的私密状态
    for (const player of room.players) {
      io.to(player.socketId).emit('gameStateUpdate', sanitizeRoom(room, player.socketId));
    }
  }

  function sanitizeRoom(room, viewerSocketId) {
    return {
      ...room,
      actedPlayerIds: [...room.actedPlayerIds],
      players: room.players.map(p => ({
        ...p,
        holeCards: p.socketId === viewerSocketId ? p.holeCards : (p.holeCards?.length ? ['hidden', 'hidden'] : []),
      })),
    };
  }

  function sanitizeRoomForAll(room) {
    return {
      ...room,
      actedPlayerIds: [...room.actedPlayerIds],
      players: room.players.map(p => ({
        ...p,
        holeCards: (p.holeCards?.length ? ['hidden', 'hidden'] : []),
      })),
    };
  }
};

# 德州扑克 UX V2 设计文档

**日期：** 2026-06-04  
**范围：** GameRoom.jsx（主要）/ roomManager.js / socketHandlers.js

---

## 总览

7 项改动分两类：纯前端（1–5、结算简化）和前后端（6）。

---

## 1. 加注 UI 重构

### 行为
- 点击「加注」→ `showRaise=true`，弃牌和跟注按钮同时设为 `opacity: 0.35, pointerEvents: none`
- 加注面板新增数字 `<input type="number">` 输入框，与 slider 联动（任一改变另一同步）
- 输入值超出 [minRaise, maxRaise] 时输入框边框变红，提交按钮 disabled
- 面板新增「取消」按钮：`showRaise=false`，弃牌/跟注按钮恢复
- 「确认加注」按钮高亮为蓝色主按钮

### 数据流
纯前端 `raiseAmount` state 联动，无新事件。

---

## 2. 按钮立体感 + 音效 + 行动特效

### 按钮立体感
所有三个操作按钮（弃牌/跟注/加注）：
- 底部增加深色阴影模拟厚度：`boxShadow: '0 6px 0 rgba(0,0,0,0.35), 0 8px 14px rgba(0,0,0,0.4)'`
- 点击时：`transform: translateY(3px)`，阴影压缩为 `0 3px 0`
- 用 CSS `active` 伪类或 `onPointerDown/Up` 实现

### 音效（Web Audio API，无需外部文件）
模块级 `playSound(type)` 函数，用 `AudioContext` 合成：
- `fold`：低频（220Hz）短促下降音，0.15s
- `call`/`check`：中频（440Hz）单音，0.12s
- `raise`/`allin`：上扬双音（440Hz → 660Hz），0.2s

在 `sendAction` 调用后立即触发对应音效。

### 行动徽章（Action Badge）
**服务端：** `gameStateUpdate` payload 中新增可选字段 `lastAction: { socketId, action, amount }`，在每次 `processAfterAction` 广播时附带。

**前端：** `AvatarTimer` 组件接收 `actionBadge` prop，在头像正上方（`SpeechBubble` 位置逻辑相同）展示：

| 行动 | 文字 | 颜色 |
|------|------|------|
| fold | 弃牌 | 红色 `#ef4444` |
| call | 跟注 N | 绿色 `#22c55e` |
| check | 过牌 | 灰色 `#9ca3af` |
| raise | 加注 N | 蓝色 `#3b82f6` |
| allin | ALL IN | 金色 `#f0d060` |

徽章出现后 **1.5s 淡出消失**。`GameRoom` 用 `actionBadges` state（Map: socketId→badge）管理，收到 `gameStateUpdate` 时更新，自动 setTimeout 清除。

---

## 3. 胜者动画 + 结算简化

### 动画流程（2.5s）
`showdown` 事件到达时：
1. 设 `winAnimating=true`，延迟 2500ms 后设为 false 并展示结算面板
2. `WinAnimation` 覆盖层：
   - 半透明黑色遮罩
   - 胜者头像所在坐标处：`@keyframes winner-bounce`（上下跳动）+ 头顶 👑 emoji
   - 屏幕中心：「🏆 [昵称] 赢了！」（大字，白色，渐入）
   - 平分：「🏆 [A] 和 [B] 平分！」
   - 胜者通过 `results` 中 `delta > 0` 筛选

### 结算简化（取代 60s 准备流程）
- 移除「✅ 准备」「👁 观战」按钮
- 移除玩家状态列表（谁准备了）
- 改为固定 **3 秒倒计时进度条**，结束后自动调用 `startNextHand`
- 服务端：`resolveShowdown` 中的 60s timeout 改为 **3s**，回调直接调用 `startNextHand(roomId)`（不再检查各玩家 readyStatus，直接开局）
- 移除 "auto-spectate pending players" 的逻辑（原本是 60s 后把 pending 改成 spectating，现在不需要）
- `startNextHand` 逻辑不变：`readyStatus='spectating'` → 继续观战；`readyStatus='queued'`（点了坐下） → `status='active'`；`readyStatus='pending'`（普通活跃玩家） → `status='active'`

### 结算面板保留
- 亮牌按钮（3s 内可点）
- 胜者行显示 👑
- 公共牌展示（见第 4 条）
- **亮牌后同行显示牌型**（见下）

---

## 4. 结算展示公共牌 + 亮牌显示牌型

### 公共牌
结算面板标题下方，横排展示最多 5 张 Card（`size="sm"`），使用 `room.communityCards`。

### 亮牌与牌型
- 玩家行：若该玩家牌已可见（`revealedCards` 非 hidden），显示 Card + 牌型中文名
- 若未亮牌：显示两张「?」占位，**不显示牌型**
- 牌型中文名复用现有 `HAND_NAME_MAP`

---

## 5. 座位动态分散

### 算法
废弃硬编码 `SEAT_POS` 数组，改用按玩家数动态计算：

```javascript
// 椭圆参数（% 单位）：中心 (cx, cy)，横半径 rx，纵半径 ry
// i=0 始终是"我"，位于正下方 (50, 66)
// i=1..n-1 从正上方顺时针均匀排开
function getSeatPositions(n) {
  const cx = 50, cy = 42, rx = 42, ry = 24;
  return Array.from({ length: n }, (_, i) => {
    const angle = Math.PI / 2 + (2 * Math.PI * i / n);
    return {
      x: Math.round(cx + rx * Math.cos(angle)),
      y: Math.round(cy + ry * Math.sin(angle)),
    };
  });
}
// 验证：n=2 → 我(50,66) 对手(50,18)
//       n=3 → 我(50,66) 左上(15,30) 右上(85,30)
//       n=4 → 我(50,66) 左(8,42)  上(50,18) 右(92,42)
```

在 `PokerTable` 渲染时调用，用 `orderedPlayers.length` 作为 `n`。x 值自动夹在 [8, 92]，y 值夹在 [16, 68] 内（极端情况实现时可加 clamp）。

---

## 6. 弃牌→随时站起观战 + 坐下

### 服务端（socketHandlers.js）
新增事件 `foldToSpectate`：
```
条件：player.folded === true && player.status !== 'spectating'
操作：player.status = 'spectating'
     player.readyStatus = 'spectating'
广播：broadcastToEach(gameStateUpdate)
```

无需修改 `roomManager.js`（直接操作 room 对象）。

### 前端（GameRoom.jsx）
**「站起观战」按钮：**
- 显示条件：`me.folded && me.status !== 'spectating' && 游戏进行中（非 waiting/settlement）`
- 位置：底部行动区，替换掉现有的「等待」提示
- 点击：`socket.emit('foldToSpectate', { roomId })`

**「🪑 坐下（下局参与）」按钮：**
- 显示条件：`me.status === 'spectating' && 游戏进行中（非 settlement）`
- 点击：复用 `sendQueueNextHand()`（已有）
- 点击后本地显示「🟡 下局将参与」状态文字

### 与结算简化的配合
结算面板 3s 后自动开局时，服务端 `startNextHand` 已有逻辑：
- `readyStatus === 'queued'`（点过坐下）→ `status = 'active'`
- `readyStatus === 'spectating'` → `status = 'spectating'`

无需额外修改。

---

## 不在范围内
- USSD 渠道
- 后端游戏逻辑（下注、边池、摊牌算法）
- timerManager 测试修复
- 移动端 Safari 适配

# Texas Hold'em 优化设计文档

**日期：** 2026-06-01  
**范围：** 6 项功能优化，基于现有 Socket.IO + React 架构  
**实现策略：** 方案 B — 有针对性的小重构 + 功能扩展，不新增文件

---

## 架构概览

### 服务端文件变更

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `server/game/roomManager.js` | 修改 | joinRoom 支持重连；player 增加 `disconnected`、`readyStatus`、`voluntaryReveal` 字段 |
| `server/timerManager.js` | 修改 | 时长从硬编码 60s → 接收 `duration` 参数 |
| `server/sockets/socketHandlers.js` | 修改 | 断线不删玩家；新增 `playerReadyStatus`、`revealCards` 事件；结算逻辑调整 |

### 客户端文件变更

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `src/pages/HomePage.jsx` | 修改 | 创建房间表单增加"行动时限"输入框 |
| `src/pages/GameRoom.jsx` | 修改 | 圆形倒计时、手牌提示、结算界面、统计面板、头像置灰 |

**新增内嵌组件**（均在 `GameRoom.jsx` 中定义）：
- `SettlementScreen` — 结算界面
- `AvatarTimer` — 头像 SVG 圆形倒计时（替换 `PlayerSeat`）
- `HandHint` — 当前牌型提示

---

## 功能 1：持久房间 + 断线重连

### 目标
房间开设后永久存在；玩家断线后可凭相同昵称重新加入并恢复状态。

### 重连身份识别
使用**昵称匹配**：同一房间内相同昵称的 join 请求视为重连。

### 服务端逻辑

**`roomManager.joinRoom` 修改：**
```
输入: { roomId, socketId, nickname }

1. 在房间 players 中查找 nickname 相同的玩家
2. 若找到（重连路径）:
   - 更新 player.socketId = 新 socketId
   - 清除 player.disconnected = false
   - 返回 { success: true, reconnected: true, room }
3. 若未找到 + phase !== 'waiting':
   - 返回 { error: 'GAME_IN_PROGRESS' }（原行为）
4. 若未找到 + phase === 'waiting':
   - 正常创建新玩家并加入（原行为）
```

**`socketHandlers.js` disconnect 事件修改：**
```
断线时：
- 立即标记 player.disconnected = true
- 广播 gameStateUpdate（其他玩家看到该玩家头像置灰）
- 不再调用 leaveRoom，不再设定时删除（leaveRoom 保留给未来"主动退出"功能）
- 若该玩家当前轮到行动，计时器照常运行，超时自动弃牌

房间删除条件：
- 所有玩家均为 disconnected 状态
- 且 phase === 'waiting'（无进行中游戏）
```

**`socketHandlers.js` joinRoom / reconnect 路径：**
```
重连成功后：
- socket.join(roomId)
- 向该玩家发送完整 gameStateUpdate（含当前游戏状态）
- 向其他玩家广播 playerReconnected 事件
```

### 客户端
无额外改动。重连后服务端推送完整 `gameStateUpdate`，现有 `onUpdate` handler 处理即可。

---

## 功能 2：准备系统 + 结算界面

### 目标
每局结束后进入结算界面，玩家自选"准备"或"观战"，全员选完或 60 秒超时后开始下一局。

### 新增 Player 字段
```js
readyStatus: 'pending' | 'ready' | 'spectating'  // 结算阶段状态
```

### 结算流程
```
resolveShowdown 完成结算 →
  phase = 'settlement'
  所有玩家 readyStatus = 'pending'
  广播 showdown 事件（含结算数据：胜负、盈亏、牌型名称，settlementDeadline: Date.now() + 60000）
  服务端启动 60 秒超时计时器（一次性，不重复广播）

玩家发送 playerReadyStatus({ roomId, status: 'ready' | 'spectating' }) →
  更新 player.readyStatus
  广播 gameStateUpdate

全员非 pending（或 60 秒到期）→
  未选的玩家自动设为 'spectating'
  ready 人数 ≥ 2 → 仅 ready 玩家参与下一局（startGame 时跳过 spectating 玩家）
  ready 人数 < 2 → 继续等待（保持 settlement 阶段，不自动开局）

观战玩家：
  - 可看到进行中的牌局，不参与发牌/行动
  - `startGame` 时跳过 status='spectating' 的玩家（不发手牌，跳过其行动轮）
  - 有"下一局参与"按钮 → readyStatus = 'queued'
  - 下一局结算前自动重置为 'ready'，参与下一局
```

### 结算数据结构（服务端发送）
```js
{
  room: { ...sanitizedRoom },
  winners: [socketId, ...],
  results: [
    { socketId, nickname, delta: +300, handName: '同花顺', holeCards: [...] },
    { socketId, nickname, delta: -300, handName: null, holeCards: [] },
    ...
  ],
  wasMuckWin: boolean  // true = 众人弃牌，false = 跟注摊牌
}
```

### 结算界面 UI（`SettlementScreen` 组件）

内容区域：
- **赢家行**：`🏆 [名字]  +金额  [牌型名称]`（金色高亮）
- **输家行**：`[名字]  -金额`（红色）
- **玩家状态列表**：每人头像 + 姓名 + 状态徽章
  - 🟡 待定（默认）
  - 🟢 准备
  - 👁 观战
- **60 秒全局倒计时进度条**
- **操作按钮**：`✅ 准备` / `👁 观战`（点击后按钮置灰，显示已选状态）

观战玩家在游戏中的 UI：
- 顶部显示"👁 观战中" badge
- 底部行动区替换为"下一局参与"按钮

### 头像置灰规则（游戏进行中）

在 `AvatarTimer` 组件中，满足以下任一条件时应用置灰样式：
- `player.disconnected === true` → 头像 `opacity: 0.35` + `filter: grayscale(1)` + 标签"📡 断线"
- `player.status === 'spectating'` → 同上 + 标签"👁 观战"

---

## 功能 3：统计面板 — 总盈利

**纯前端计算**，在 `Scoreboard` 组件中新增：

```js
const totalProfit = player.chips
  - room.settings.initialChips
  - (player.rebuyCount || 0) * room.settings.initialChips;
```

**显示规则：**
- 正数：绿色 `+{n}`
- 负数：红色 `-{n}`
- 零：不显示

统计面板展示顺序：筹码 → 总盈利 → 补码次数。

---

## 功能 4：头像圆形倒计时（可配置时长）

### 创建房间表单
新增"行动时限（秒）"输入框，默认 `20`，最小 `5`，最大 `120`。存入 `room.settings.actionTime`。

### 服务端
- `TimerManager.startTimer(socketId, roomId, duration, onTimeout)` — 新增 `duration` 参数
- `socketHandlers.js startNextPlayerTimer`：使用 `room.settings.actionTime` 替代 60
- 广播 `timerStarted` 时 `duration: room.settings.actionTime`

### `AvatarTimer` 组件（替换 `PlayerSeat`）

**当 `isCurrentTurn` 时：**
- 头像容器 `transform: scale(1.25)`，`transition: transform 0.2s`
- 叠加 SVG 圆环（绝对定位，尺寸略大于头像）：
  ```
  外圈：半透明灰色轨道
  内圈：进度弧，颜色随剩余时间变化：
    > 50% 剩余 → #4ade80（绿）
    25–50%     → #facc15（黄）
    < 25%      → #ef4444（红）+ animate-pulse 闪烁
  ```
- 圆环**内不显示秒数**（避免拥挤）
- 底部工具栏保留一行小文字：`等待 {name}... {countdown}s`

**当非当前回合时：**
- 无圆环，头像正常大小

---

## 功能 5：手牌提示（仅自己可见）

### 触发条件
- `isMe && seatPos === 0`（自己的座位）
- `player.holeCards.length >= 2`（已发牌）
- `room.phase !== 'waiting' && room.phase !== 'settlement'`

### 计算逻辑
使用客户端已安装的 `pokersolver`：
```js
import { Hand } from 'pokersolver';
const allCards = [...holeCards, ...communityCards].map(convertCardCode);
const hand = Hand.solve(allCards);
const chineseName = HAND_NAME_MAP[hand.name] || hand.name;
```

**翻牌前（无公共牌）：** pokersolver 仅能评估 2 张牌，显示基本信息（对子/高牌等）。

### 牌型中文映射
```js
const HAND_NAME_MAP = {
  'Royal Flush':    '皇家同花顺',
  'Straight Flush': '同花顺',
  'Four of a Kind': '四条',
  'Full House':     '葫芦',
  'Flush':          '同花',
  'Straight':       '顺子',
  'Three of a Kind':'三条',
  'Two Pair':       '两对',
  'Pair':           '一对',
  'High Card':      '高牌',
};
```

### UI
手牌图片下方一行小标签（半透明深色背景）：
```
💡 当前牌型：葫芦
```
仅渲染在自己的座位，其他玩家看不到。

---

## 功能 6：亮牌 / 盖牌规则

### 规则定义
- **跟注摊牌**（`wasMuckWin = false`）：所有未弃牌玩家手牌自动亮出（现有行为保留）
- **众人弃牌赢池**（`wasMuckWin = true`）：获胜者手牌默认对其他人不可见，显示牌背

### 服务端
**`resolveShowdown` 修改：**
```js
const wasMuckWin = active.length === 1;

// sanitize 时：
holeCards: (wasMuckWin && p.socketId !== viewerSocketId && p.won > 0)
  ? ['hidden', 'hidden']   // 盖牌赢：隐藏获胜者牌
  : (!p.folded ? p.holeCards : [])
```

**新增 `revealCards` 事件：**
```
客户端发送 revealCards({ roomId })
服务端：
  找到该玩家，设 player.voluntaryReveal = true
  向房间广播 cardRevealed({ socketId, holeCards: player.holeCards })
客户端收到后：更新对应玩家手牌显示
```

### 结算界面亮牌 UI
- **跟注摊牌**：自动显示所有手牌
- **盖牌赢**：
  - 获胜者手牌 → 牌背 + "？" 标识
  - 获胜者可看到"亮牌"按钮（点击后亮出自己的牌）
- **所有玩家**（包括输家、弃牌者）均可点"亮牌"按钮主动秀牌
- 亮牌按钮**仅在 `phase === 'settlement'` 时显示**，游戏中不可用
- 已亮牌的玩家按钮变为"已亮牌"并置灰

---

## 数据流变更摘要

### 新增 Socket 事件

| 方向 | 事件名 | 数据 |
|------|--------|------|
| 客→服 | `playerReadyStatus` | `{ roomId, status: 'ready' \| 'spectating' }` |
| 客→服 | `revealCards` | `{ roomId }` |
| 服→客 | `cardRevealed` | `{ socketId, holeCards }` |
| 服→客 | `playerReconnected` | `{ nickname, socketId }` |
| 服→客 | `settlementDeadline` | `{ deadline: timestamp }` （结算开始时广播一次） |

### Player 字段新增

```js
disconnected: boolean         // 是否断线中
readyStatus: string           // 'pending' | 'ready' | 'spectating' | 'queued'
voluntaryReveal: boolean      // 是否主动亮牌
```

### Room Settings 新增

```js
actionTime: number            // 行动倒计时秒数，默认 20
```

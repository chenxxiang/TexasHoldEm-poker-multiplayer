# 德州扑克 5 项优化设计文档

**日期**: 2026-06-04  
**范围**: GameRoom.jsx / Card.jsx / roomManager.js / socketHandlers.js

---

## 1. 手机端语音修复

### 根因
`speechSynthesis.getVoices()` 在 Android / 华为浏览器中同步调用返回空数组，TTS 引擎异步加载，`voiceschanged` 事件触发后才能获取到 voice 列表。未赋值 `voice` 时华为浏览器静默失败。另外，socket 事件触发的 `speak()` 不在用户手势上下文里，Android 会阻断自动播放。

### 方案
- 在模块顶层（React 组件外）初始化 voice 缓存，监听 `voiceschanged`，按 `zh-CN → zh* → 任意` 优先级选 voice。
- `speakText(text)` 工具函数：取缓存 voice，设置到 `SpeechSynthesisUtterance`，在 `synth.speaking` 时先 `cancel()`。
- 自己发嘲讽：在 click handler（用户手势上下文）里直接调用 `speakText`。
- 接收他人嘲讽（socket 事件，非手势上下文）：把文本写入 `pendingSpeech` ref，绑定一次性 `touchstart / click` listener 到 document，触发后消费队列播放。

### 改动文件
`src/pages/GameRoom.jsx`

---

## 2. 嘲讽气泡对齐修复

### 根因
`SpeechBubble` 放在 `AvatarTimer` 最外层 div（宽度由昵称标签 ~80px 撑开），`left: 50%` 以外层容器宽度为基准，导致气泡水平偏离头像圆心。

### 方案
将 `SpeechBubble` 渲染位置移入头像圆形 div（`position: relative, width: sz, height: sz`），使 `bottom: calc(100% + 8px)` 和 `left: 50%` 完全以头像圆为参考，尾巴箭头精准指向头像中心。

### 改动文件
`src/pages/GameRoom.jsx` — `AvatarTimer` 组件

---

## 3. 游戏中途加入（观战模式）

### 后端

**roomManager.js — `joinRoom()`**:
- 删除 `if (room.phase !== 'waiting') return { error: 'GAME_IN_PROGRESS' }` 限制。
- 改为：若当前阶段非 `waiting`，新玩家以 `status: 'spectating'`、`readyStatus: 'queued'` 加入（下局自动参与）。
- 其余字段与正常加入一致（chips 取房间初始值）。

**socketHandlers.js — `joinRoom` handler**:
- 无论是否游戏进行中，成功加入后均广播 `playerJoined` 给房间内其他玩家。

### 前端

**GameRoom.jsx**:
- `WaitingRoom` 覆盖层条件不变（仅 `phase === 'waiting'` 时显示），中途加入的观战者直接看到游戏牌桌画面。
- 底部行动区：当 `me?.status === 'spectating' && me?.readyStatus === 'queued'` 时，显示观战提示条替代操作按钮：`👁 观战中 · 本局结束后自动参与下一局`。
- 结算界面（SettlementScreen）：`readyStatus === 'queued'` 玩家已显示"🟡 下局将参与"，无需额外修改。

---

## 4. 手牌提示移至牌桌上方并放大

### 当前
手牌 div 内嵌，`fontSize: 11`，位于底部手牌区。

### 新位置
- 绝对定位，`top: '37%'`，水平居中 `left: 50%`, `transform: translateX(-50%)`，`zIndex: 6`。
- 仅在 `myHandHint` 存在且游戏进行中（非 waiting / settlement）显示。
- 样式：`fontSize: 17`，`fontWeight: 800`，`padding: '5px 18px'`，金色边框，半透明深色背景。
- 原手牌 div 保留，但移除 `myHandHint` 部分。

---

## 5. 扑克牌 UI 优化

### 变更
- 角落（左上 / 右下旋转）：**只显示点数**，删除花色符号。
- 中心：**只显示花色符号**，字号加大。

### 尺寸参数

| size | cornerFs (旧→新) | centerFs (旧→新) |
|------|----------------|----------------|
| sm   | 9 → 12         | 14 → 20        |
| md   | 11 → 15        | 20 → 28        |
| my   | 12 → 16        | 24 → 32        |
| lg   | 13 → 18        | 28 → 38        |

---

## 不在范围内
- 后端游戏逻辑（下注、边池、摊牌）
- 其他 UI 组件
- 测试文件

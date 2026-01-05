# 项目架构说明

## 总体架构

```
┌─────────────────┐
│  TUIO/OSC 设备  │ (UDP)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  TUIO Processor │ ──► Cursor 列表
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Zone Manager   │ ──► 区域状态判定
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Protocol Encoder│ ──► 二进制帧生成
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   TCP Sender    │ ──► TCP 发送
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   灯控设备      │ (TCP)
└─────────────────┘

         │
         ▼
┌─────────────────┐
│  Web Frontend   │ ◄──► HTTP API + WebSocket
└─────────────────┘
```

## 后端架构

### 核心模块

#### 1. TUIOProcessor (`server/tuio-processor.js`)

**职责**：
- 监听 UDP 端口接收 TUIO/OSC 消息
- 解析 OSC 消息格式
- 维护活跃 cursor 列表（ID、坐标、更新时间）
- 处理 TUIO 2Dcur 消息（set、alive、fseq）

**关键方法**：
- `start()` - 启动 UDP 监听
- `parseOSCMessage(buffer)` - 解析 OSC 二进制消息
- `handleOSCMessage(message)` - 处理解析后的消息
- `updatePort(port)` - 动态更新监听端口

**数据流**：
```
UDP Packet → OSC 解析 → Cursor 更新 → 回调通知
```

#### 2. ZoneManager (`server/zone-manager.js`)

**职责**：
- 根据配置判定区域状态
- 支持两种模式：网格分区、自定义矩形
- 判断 cursor 是否落在区域内

**关键方法**：
- `updateZoneStates(cursors)` - 更新所有区域状态
- `updateGridZones()` - 网格模式判定
- `updateCustomZones()` - 自定义模式判定
- `isPointInRect(x, y, rect)` - 点是否在矩形内

**判定逻辑**：
- 网格模式：根据 cursor 坐标计算所在网格单元
- 自定义模式：遍历所有矩形区域，检查 cursor 是否在区域内
- 状态：区域内至少有一个有效 cursor → 有人，否则 → 无人

#### 3. ProtocolEncoder (`server/protocol-encoder.js`)

**职责**：
- 生成符合灯具厂协议的 8 字节二进制帧
- 计算校验和（checksum）

**协议格式**：
```
[0x1C] [zone] [0x64] [status] [0x00] [0x00] [0xFF] [checksum]
```

**关键方法**：
- `encode(zoneId, occupied)` - 编码协议帧
- `calculateChecksum(frame)` - 计算校验和
- `verify(frame)` - 验证帧的校验和

**校验和算法**：
```javascript
sum = byte1 + byte2 + ... + byte7
checksum = (0x100 - (sum % 0x100)) % 0x100
```

#### 4. TCPSender (`server/tcp-sender.js`)

**职责**：
- 管理 TCP 连接（客户端/服务端模式）
- 发送二进制帧
- 自动重连（客户端模式，指数退避）
- 连接状态通知

**关键方法**：
- `start()` - 启动 TCP 连接
- `send(frame)` - 发送二进制帧
- `updateConfig(mode, host, port)` - 更新配置并重启
- `stop()` - 停止连接

**重连策略**：
- 指数退避：初始 1s，最大 30s
- 最大重试次数：10 次

### 主服务器 (`server/index.js`)

**职责**：
- 初始化所有组件
- 管理全局状态
- 状态更新循环（50ms 间隔）
- HTTP API 路由
- WebSocket 服务

**状态更新循环**：
1. 清理超时 cursor
2. 更新区域状态
3. 检测状态变化
4. 根据发送策略发送帧
5. 广播状态更新

**发送策略**：
- `onChange`：仅在区域状态变化时发送
- `heartbeat`：按固定间隔周期发送所有区域状态

### API 路由

#### `/api/config` (`server/routes/config.js`)
- `GET` - 获取配置
- `POST` - 更新配置（通知相关组件）

#### `/api/zones` (`server/routes/zones.js`)
- `GET` - 获取区域配置
- `POST` - 更新区域配置

#### `/api/test` (`server/routes/test.js`)
- `POST /send` - 测试发送帧（手动指定区域和状态）

#### `/api/status`
- `GET` - 获取系统状态（cursors、区域状态、TCP 状态等）

## 前端架构

### 技术栈

- **React 18** - UI 框架
- **Vite** - 构建工具
- **WebSocket** - 实时通信
- **Canvas API** - 区域可视化

### 核心 Hooks

#### useWebSocket (`client/src/hooks/useWebSocket.js`)

**功能**：
- 建立 WebSocket 连接
- 自动重连
- 接收服务器推送的状态更新

**消息类型**：
- `init` - 初始状态
- `cursors` - cursor 更新
- `zoneStates` - 区域状态更新
- `tcpStatus` - TCP 连接状态
- `frameSent` - 帧发送成功
- `error` - 错误信息
- `config` - 配置更新
- `zones` - 区域配置更新

#### useAPI (`client/src/hooks/useAPI.js`)

**功能**：
- 封装 HTTP API 调用
- 提供配置、区域、状态、测试等接口

### 页面组件

#### 1. ConfigPage (`client/src/pages/ConfigPage.jsx`)

**功能**：
- UDP/TUIO 输入配置
- TCP 输出配置（客户端/服务端模式）
- 发送策略配置
- 区域模式选择（网格/自定义）
- 网格参数配置（列数/行数）

#### 2. MonitorPage (`client/src/pages/MonitorPage.jsx`)

**功能**：
- TUIO 输入实时监控（cursor 列表）
- TCP 连接状态显示
- 区域状态列表（有人/无人）
- 最近发送的帧（十六进制显示）
- 错误日志
- 测试发送功能

#### 3. ZoneEditorPage (`client/src/pages/ZoneEditorPage.jsx`)

**功能**：
- Canvas 画布可视化
- 网格模式：显示网格分区和状态
- 自定义模式：拖拽绘制矩形区域
- 区域列表管理（删除）
- 实时显示区域状态（颜色高亮）

## 数据流

### TUIO 输入流程

```
TUIO 设备
  ↓ (UDP)
TUIOProcessor
  ↓ (解析 OSC)
Cursor 列表更新
  ↓ (回调)
主服务器状态更新
  ↓ (WebSocket)
前端显示
```

### 区域判定流程

```
Cursor 列表
  ↓
ZoneManager.updateZoneStates()
  ↓
区域状态 Map
  ↓
检测状态变化
  ↓
ProtocolEncoder.encode()
  ↓
二进制帧
  ↓
TCPSender.send()
  ↓
TCP 发送
```

### 配置更新流程

```
前端配置页面
  ↓ (HTTP POST)
配置路由
  ↓
更新全局配置
  ↓
通知相关组件（TUIOProcessor、TCPSender、ZoneManager）
  ↓ (WebSocket)
前端同步更新
```

## 状态管理

### 后端全局状态

```javascript
{
  config: {
    udpPort, tcpMode, tcpHost, tcpPort,
    cursorTimeout, sendStrategy, heartbeatInterval,
    zoneMode, gridCols, gridRows
  },
  zones: {
    grid: { cols, rows, zones },
    custom: [{ id, x, y, width, height }, ...]
  },
  cursors: Map<id, { id, x, y, lastUpdate }>,
  zoneStates: Map<zoneId, { occupied, lastChange }>,
  tcpConnected: boolean,
  sendCount: number,
  lastSentFrame: { zoneId, occupied, frame, time },
  errors: [{ time, message }, ...]
}
```

### 前端状态

- 通过 WebSocket 实时同步后端状态
- 使用 React Hooks 管理本地 UI 状态
- 配置变更通过 HTTP API 提交

## 协议细节

### TUIO 2Dcur 消息格式

**set 消息**：
```
/tuio/2Dcur set s_id x_pos y_pos X_vel Y_vel m_accel
```

**alive 消息**：
```
/tuio/2Dcur alive s_id s_id ...
```

**fseq 消息**：
```
/tuio/2Dcur fseq frame_id
```

### 二进制协议帧

**帧结构**（8 字节）：
```
[0x1C] [zone(1-255)] [0x64] [status(0x00/0x01)] [0x00] [0x00] [0xFF] [checksum]
```

**状态值**：
- `0x00` = 有人
- `0x01` = 无人

## 扩展点

### 添加新的区域判定算法

1. 在 `ZoneManager` 中添加新方法
2. 在 `updateZoneStates()` 中添加分支
3. 在前端配置页面添加选项

### 支持其他 TUIO 消息类型

1. 在 `TUIOProcessor.handleOSCMessage()` 中添加处理逻辑
2. 更新状态数据结构
3. 在前端添加显示

### 自定义协议格式

1. 修改 `ProtocolEncoder.encode()` 方法
2. 更新校验和算法（如需要）
3. 更新文档和测试

### 数据持久化

1. 集成数据库（SQLite/PostgreSQL）
2. 保存配置和区域设置
3. 记录发送历史

## 性能考虑

- **状态更新频率**：50ms（可调整）
- **WebSocket 广播**：仅在有变化时发送
- **Cursor 超时**：默认 300ms（可配置）
- **TCP 重连**：指数退避，避免频繁重连
- **错误日志**：限制最多 100 条

## 安全考虑

- **输入验证**：区域号范围检查（1-255）
- **坐标归一化**：确保坐标在 0-1 范围内
- **TCP 连接**：支持本地和远程连接（需注意防火墙）
- **WebSocket**：当前无认证（生产环境建议添加）


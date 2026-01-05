# TUIO to TCP Protocol Converter

基于 Web 的 TUIO 信号转二进制 TCP 协议转换器。接收 TUIO/OSC UDP 消息，解析触点信息，判定区域状态，并转换为灯具厂要求的二进制协议帧通过 TCP 发送。

## 功能特性

- ✅ **TUIO/UDP 输入监听**：支持 `/tuio/2Dcur` 消息解析，实时显示 cursor 信息
- ✅ **区域判定**：支持屏幕分区法（网格）和自定义矩形区域两种模式
- ✅ **协议编码**：严格按照灯具厂协议生成 8 字节二进制帧，包含正确的 checksum
- ✅ **TCP 发送**：支持客户端模式和服务端模式，自动重连
- ✅ **实时监控**：Web 界面实时显示输入数据、区域状态、发送日志
- ✅ **测试功能**：支持手动测试发送，无需实际 TUIO 输入

## 项目结构

```
TUIO-ASCII/
├── server/                 # Node.js 后端
│   ├── index.js           # 主服务器入口
│   ├── tuio-processor.js  # TUIO/UDP 消息处理
│   ├── zone-manager.js    # 区域判定逻辑
│   ├── protocol-encoder.js # 协议帧编码
│   ├── tcp-sender.js      # TCP 发送器
│   └── routes/            # API 路由
├── client/                 # React 前端
│   ├── src/
│   │   ├── pages/         # 页面组件
│   │   ├── hooks/         # React Hooks
│   │   └── App.jsx        # 主应用
│   └── package.json
├── package.json            # 根 package.json
└── README.md
```

## 安装与启动

### 前置要求

- Node.js >= 16.0.0
- npm 或 yarn

### 安装步骤

1. **安装根目录依赖**：
```bash
npm install
```

2. **安装前端依赖**：
```bash
cd client
npm install
cd ..
```

### 启动方式

#### 方式一：开发模式（推荐）

同时启动后端和前端开发服务器：

```bash
npm run dev
```

- 后端服务：`http://localhost:3001`
- 前端应用：`http://localhost:3000`

#### 方式二：分别启动

**启动后端**：
```bash
npm run server
```

**启动前端**（新终端）：
```bash
cd client
npm run dev
```

#### 方式三：生产模式

1. 构建前端：
```bash
cd client
npm run build
cd ..
```

2. 启动后端（需要配置静态文件服务，或使用 nginx）：
```bash
npm start
```

## 使用指南

### 1. 配置页面

访问 `http://localhost:3000`，进入**配置**标签页：

- **UDP/TUIO 输入配置**：设置 UDP 监听端口（默认 3333）
- **TCP 输出配置**：
  - 选择客户端模式：输入目标 IP 和端口
  - 选择服务端模式：设置监听端口
- **发送策略**：
  - `onChange`：仅在状态变化时发送
  - `heartbeat`：按固定间隔周期发送
- **区域模式**：
  - `grid`：屏幕分区法，设置列数和行数
  - `custom`：自定义矩形区域（在区域编辑页绘制）

### 2. 监控页面

- **TUIO 输入监控**：实时显示接收到的 cursor 信息（ID、坐标）
- **TCP 连接状态**：显示连接状态和发送计数
- **区域状态**：显示每个区域的当前状态（有人/无人）
- **最近发送的帧**：显示最后一次发送的十六进制帧
- **错误日志**：显示系统错误信息
- **测试发送**：手动测试发送功能，输入区域号和状态

### 3. 区域编辑页面

- **网格模式**：区域由配置页面的网格设置自动生成，画布仅用于可视化
- **自定义模式**：
  - 在画布上拖拽绘制矩形区域
  - 为每个区域指定区域号（1-255）
  - 可以删除已有区域
  - 实时显示区域状态（绿色=有人，灰色=无人）

## 协议说明

### 二进制帧格式

每帧 8 字节：

| 字节 | 位置 | 值 | 说明 |
|------|------|-----|------|
| byte1 | 0 | 0x1C | 帧头（固定） |
| byte2 | 1 | 1-255 | 区域号 |
| byte3 | 2 | 0x64 | 命令（固定） |
| byte4 | 3 | 0x00/0x01 | 状态（0x00=有人，0x01=无人） |
| byte5 | 4 | 0x00 | 固定 |
| byte6 | 5 | 0x00 | 固定 |
| byte7 | 6 | 0xFF | 固定 |
| byte8 | 7 | 计算值 | 校验和 |

### 校验和算法

```
checksum = (0x100 - (sum(byte1..byte7) mod 0x100)) mod 0x100
```

**示例验证**：
- 有人帧：`1C 02 64 00 00 00 FF`
  - sum = 0x1C + 0x02 + 0x64 + 0x00 + 0x00 + 0x00 + 0xFF = 0x181
  - sum mod 0x100 = 0x81
  - checksum = (0x100 - 0x81) mod 0x100 = 0x7F ✓
- 无人帧：`1C 02 64 01 00 00 FF`
  - sum = 0x1C + 0x02 + 0x64 + 0x01 + 0x00 + 0x00 + 0xFF = 0x182
  - sum mod 0x100 = 0x82
  - checksum = (0x100 - 0x82) mod 0x100 = 0x7E ✓

## API 接口

### HTTP API

- `GET /api/config` - 获取配置
- `POST /api/config` - 更新配置
- `GET /api/zones` - 获取区域配置
- `POST /api/zones` - 更新区域配置
- `GET /api/status` - 获取系统状态
- `POST /api/test/send` - 测试发送帧

### WebSocket

连接地址：`ws://localhost:3001`

消息类型：
- `init` - 初始状态推送
- `cursors` - cursor 更新
- `zoneStates` - 区域状态更新
- `tcpStatus` - TCP 连接状态变化
- `frameSent` - 帧发送成功
- `error` - 错误信息
- `config` - 配置更新
- `zones` - 区域配置更新

## 常见问题排查

### 1. 端口占用

**问题**：启动时提示端口被占用

**解决**：
- 检查端口占用：`netstat -ano | findstr :3001` (Windows) 或 `lsof -i :3001` (Mac/Linux)
- 修改配置中的端口号
- 关闭占用端口的进程

### 2. UDP 收不到消息

**问题**：监控页面显示无 cursor

**排查步骤**：
1. 确认 TUIO 发送端配置的端口与系统 UDP 端口一致
2. 检查防火墙是否阻止 UDP 端口
3. 使用网络抓包工具（如 Wireshark）验证 UDP 包是否到达
4. 检查 TUIO 消息格式是否为 `/tuio/2Dcur`

**测试方法**：
- 使用 `testSend` 功能验证 TCP 发送是否正常
- 使用模拟 TUIO 工具（如 TUIO Simulator）发送测试消息

### 3. TCP 连接失败

**客户端模式**：
- 确认目标 IP 和端口正确
- 检查目标设备是否在运行并监听 TCP 端口
- 检查网络连通性（ping、telnet）

**服务端模式**：
- 确认监听端口未被占用
- 检查防火墙是否允许 TCP 连接
- 确认客户端连接地址和端口正确

### 4. Checksum 验证

**验证方法**：
1. 在监控页面查看发送的十六进制帧
2. 手动计算前 7 字节的和
3. 使用公式计算 checksum
4. 对比第 8 字节是否一致

**代码验证**：
```javascript
// 在浏览器控制台运行
const frame = [0x1C, 0x02, 0x64, 0x00, 0x00, 0x00, 0xFF];
const sum = frame.reduce((a, b) => a + b, 0);
const checksum = (0x100 - (sum % 0x100)) % 0x100;
console.log('Checksum:', checksum.toString(16).toUpperCase()); // 应输出 7F
```

### 5. 区域判定不准确

**网格模式**：
- 确认网格列数和行数设置正确
- 检查 cursor 坐标是否在 0-1 范围内（归一化坐标）

**自定义模式**：
- 在区域编辑页面检查区域边界
- 确认区域号设置正确（1-255）
- 检查是否有区域重叠

### 6. 状态不更新

**可能原因**：
- cursor 超时时间设置过短
- 区域判定逻辑未正确触发
- 发送策略设置为 `onChange` 但状态未变化

**解决方法**：
- 调整 cursor 超时时间（默认 300ms）
- 检查区域配置是否正确
- 切换到 `heartbeat` 模式测试

## 模拟输入模式

当没有实际 TUIO 输入时，可以使用以下方法测试：

1. **测试发送功能**：在监控页面点击"测试发送"，手动指定区域号和状态
2. **模拟 TUIO 消息**：使用 Python 脚本发送测试 UDP 消息：

```python
import socket
import struct

# 发送 TUIO set 消息
sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
addr = ('127.0.0.1', 3333)

# /tuio/2Dcur set s_id x y X_vel Y_vel m_accel
message = b'/tuio/2Dcur\x00\x00\x00\x00,siifff\x00\x00'
message += struct.pack('>i', 0)  # set
message += struct.pack('>i', 1)  # id
message += struct.pack('>f', 0.5)  # x
message += struct.pack('>f', 0.5)  # y
message += struct.pack('>f', 0.0)  # vel_x
message += struct.pack('>f', 0.0)  # vel_y
message += struct.pack('>f', 0.0)  # accel

sock.sendto(message, addr)
sock.close()
```

## 技术栈

- **后端**：Node.js, Express, WebSocket (ws), osc-js
- **前端**：React, Vite
- **协议**：UDP (OSC/TUIO), TCP (Binary)

## 开发说明

### 项目架构

1. **后端架构**：
   - `TUIOProcessor`：监听 UDP，解析 OSC 消息，维护 cursor 列表
   - `ZoneManager`：根据配置判定区域状态
   - `ProtocolEncoder`：生成符合协议的二进制帧
   - `TCPSender`：管理 TCP 连接和发送

2. **前端架构**：
   - React 函数组件 + Hooks
   - WebSocket 实时通信
   - HTTP API 配置管理
   - Canvas 区域可视化

### 扩展开发

- 添加新的区域判定算法：修改 `ZoneManager`
- 支持其他 TUIO 消息类型：扩展 `TUIOProcessor`
- 自定义协议格式：修改 `ProtocolEncoder`
- 添加数据持久化：集成数据库（SQLite/PostgreSQL）

## 许可证

MIT License

## 联系方式

如有问题或建议，请提交 Issue 或 Pull Request。


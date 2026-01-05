# OSC Bundle 格式支持修复

## 问题描述

TUIO 设备（如 TUIOpad）发送的是 **OSC Bundle 格式**，而不是单个 OSC 消息。这导致：
- UDP 消息能收到
- 但 OSC 解析失败
- 前端收不到信号

## OSC Bundle 格式说明

OSC Bundle 是 OSC 协议中用于打包多个 OSC 消息的格式：

```
#bundle\0          (8字节) - Bundle 标识符
[时间戳]           (8字节) - OSC 时间戳（可以忽略）
[长度1][消息1]     (4字节长度 + 消息数据)
[长度2][消息2]     (4字节长度 + 消息数据)
...
```

TUIO 协议通常使用 Bundle 格式发送一个完整的帧，包含：
- `/tuio/2Dcur source` - 源标识
- `/tuio/2Dcur alive` - 活跃 cursor 列表
- `/tuio/2Dcur set` - cursor 位置更新（可能有多个）
- `/tuio/2Dcur fseq` - 帧序列号

## 修复内容

### 1. 添加 Bundle 检测 (`isOSCBundle()`)

检测 UDP 数据包是否以 `#bundle` 开头：

```javascript
isOSCBundle(buffer) {
  if (buffer.length < 8) return false;
  const bundleHeader = buffer.toString('ascii', 0, 7);
  return bundleHeader === '#bundle';
}
```

### 2. 添加 Bundle 解析 (`parseOSCBundle()`)

解析 Bundle 格式：
1. 跳过 Bundle 头（8字节）
2. 跳过时间戳（8字节）
3. 循环读取每个消息：
   - 读取4字节长度字段
   - 提取对应长度的消息数据
   - 递归处理（支持嵌套 Bundle）
   - 解析 OSC 消息

### 3. 更新消息处理流程

在 `socket.on('message')` 中：
1. 首先检测是否是 Bundle 格式
2. 如果是 Bundle，调用 `parseOSCBundle()`
3. 如果不是，调用原有的 `parseOSCMessage()`
4. 统一处理解析出的消息

### 4. 更新测试脚本

`test-tuio-sender.js` 现在默认使用 Bundle 格式发送，符合 TUIO 标准：
- `sendFrame()` - 使用 Bundle 发送 alive 和 fseq
- `set` 命令 - 使用 Bundle 发送 set、alive、fseq
- 添加了 `buildOSCBundle()` 和 `sendTUIOBundle()` 函数

## 代码位置

- `server/tuio-processor.js`:
  - `isOSCBundle()` - Bundle 检测
  - `parseOSCBundle()` - Bundle 解析
  - `socket.on('message')` - 消息处理流程更新

- `test-tuio-sender.js`:
  - `buildOSCBundle()` - Bundle 构建
  - `sendTUIOBundle()` - Bundle 发送
  - 所有发送函数更新为使用 Bundle 格式

## 测试验证

### 使用测试脚本

```bash
node test-tuio-sender.js
```

然后输入：
```
set 1 0.5 0.5
```

**预期结果**：
- 控制台显示：`[TUIO] 收到 OSC Bundle，包含 X 条消息`
- 监控页面显示 cursor
- 区域状态更新

### 使用真实 TUIO 设备

1. 配置 TUIO 设备发送到 `127.0.0.1:3333`
2. 在监控页面查看是否收到 cursor
3. 检查控制台日志确认收到 Bundle

## 调试信息

修复后，控制台会显示：
- `[TUIO] 收到 OSC Bundle，包含 X 条消息` - 收到 Bundle 时
- `[TUIO] 收到 cursor: ID=X, X=0.xxx, Y=0.xxx` - 解析到 set 消息时

## 注意事项

1. **嵌套 Bundle**：代码支持嵌套 Bundle（Bundle 中包含 Bundle）
2. **时间戳**：Bundle 时间戳被忽略，消息立即处理
3. **向后兼容**：仍然支持单个 OSC 消息格式（非 Bundle）
4. **消息顺序**：Bundle 中的消息按顺序处理，确保 alive 在 set 之后处理

## 相关资源

- [OSC 协议规范](https://opensoundcontrol.org/spec-1_0.html)
- [TUIO 协议规范](https://www.tuio.org/)


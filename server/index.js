import express from 'express';
import { WebSocketServer } from 'ws';
import http from 'http';
import cors from 'cors';

// 全局异常处理，防止服务器崩溃
process.on('uncaughtException', (err) => {
  console.error('[CRITICAL] Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[CRITICAL] Unhandled Rejection at:', promise, 'reason:', reason);
});
import { TUIOProcessor } from './tuio-processor.js';
import { ZoneManager } from './zone-manager.js';
import { ProtocolEncoder } from './protocol-encoder.js';
import { TCPSender } from './tcp-sender.js';
import { configRouter } from './routes/config.js';
import { zoneRouter } from './routes/zones.js';
import { testRouter } from './routes/test.js';
import { loadConfig, loadZones } from './config-manager.js';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(cors());
app.use(express.json());

// 从文件加载配置
const savedConfig = loadConfig();
const savedZones = loadZones();

// 全局状态
const state = {
  config: savedConfig,
  zones: savedZones,
  cursors: new Map(), // cursorId -> { id, x, y, lastUpdate }
  zoneStates: new Map(), // zoneId -> { occupied: bool, lastChange }
  tcpConnected: false,
  sendCount: 0,
  sendSuccessCount: 0,
  sendFailCount: 0,
  lastSentFrame: null,
  sentFrames: [], // 帧历史记录（最近50条）
  errors: [],
  outputZoneFilter: [] // 空数组表示输出所有区域，数组中的数字表示只输出这些区域
};

// 初始化组件
const tuioProcessor = new TUIOProcessor(state.config.udpPort, (cursors) => {
  state.cursors = cursors;
  broadcast({ type: 'cursors', data: Array.from(cursors.values()) });
});

const zoneManager = new ZoneManager(state.zones, state.config);
const protocolEncoder = new ProtocolEncoder();
const tcpSender = new TCPSender(
  state.config.tcpMode,
  state.config.tcpHost,
  state.config.tcpPort,
  (connected) => {
    state.tcpConnected = connected;
    broadcast({ type: 'tcpStatus', data: { connected } });
  },
  (error) => {
    state.errors.push({ time: Date.now(), message: error });
    if (state.errors.length > 100) state.errors.shift();
    broadcast({ type: 'error', data: error });
  }
);

// 状态更新循环
let lastHeartbeat = Date.now();
setInterval(() => {
  const now = Date.now();

  // 清理超时 cursor
  for (const [id, cursor] of state.cursors.entries()) {
    if (now - cursor.lastUpdate > state.config.cursorTimeout) {
      state.cursors.delete(id);
    }
  }

  // 更新区域状态
  const newZoneStates = zoneManager.updateZoneStates(state.cursors);
  const changed = checkZoneStateChanges(state.zoneStates, newZoneStates);
  state.zoneStates = newZoneStates;

  if (changed.length > 0) {
    broadcast({ type: 'zoneStates', data: Array.from(state.zoneStates.entries()) });
  }

  // 发送策略
  if (state.config.sendStrategy === 'onChange' && changed.length > 0) {
    sendFramesForZones(changed);
  } else if (state.config.sendStrategy === 'heartbeat' && now - lastHeartbeat >= state.config.heartbeatInterval) {
    sendFramesForZones(Array.from(state.zoneStates.keys()));
    lastHeartbeat = now;
  }

  // 广播 cursors (降频到 100ms 以减轻负担)
  if (now % 100 < 50) {
    broadcast({ type: 'cursors', data: Array.from(state.cursors.values()) });
  }
}, 50);

function checkZoneStateChanges(oldStates, newStates) {
  const changed = [];
  for (const [zoneId, newState] of newStates.entries()) {
    const oldState = oldStates.get(zoneId);
    if (!oldState || oldState.occupied !== newState.occupied) {
      changed.push(zoneId);
    }
  }
  return changed;
}

function sendFramesForZones(zoneIds) {
  // 如果设置了区域过滤，只发送指定区域
  let zonesToSend = zoneIds;
  if (state.outputZoneFilter && state.outputZoneFilter.length > 0) {
    zonesToSend = zoneIds.filter(id => state.outputZoneFilter.includes(id));
    if (zonesToSend.length === 0) {
      // 如果过滤后没有区域，不发送任何数据
      return;
    }
  }

  for (const zoneId of zonesToSend) {
    const zoneState = state.zoneStates.get(zoneId);
    if (!zoneState) continue;

    const frame = protocolEncoder.encode(zoneId, zoneState.occupied);
    const hexFrame = Array.from(frame).map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');

    // 记录要发送的帧（无论TCP是否连接）
    const frameInfo = {
      zoneId,
      occupied: zoneState.occupied,
      frame: hexFrame,
      time: Date.now(),
      tcpConnected: state.tcpConnected,
      sent: false,
      bytesSent: 0,
      error: null
    };

    // 尝试发送，带确认回调
    tcpSender.send(frame, (success, bytesSent, error) => {
      state.sendCount++;

      if (success) {
        state.sendSuccessCount++;
        frameInfo.sent = true;
        frameInfo.bytesSent = bytesSent;
        console.log(`[TCP] ✓ 发送成功: Zone ${zoneId} ${zoneState.occupied ? '有人' : '无人'} - ${hexFrame} (${bytesSent} bytes)`);
      } else {
        state.sendFailCount++;
        frameInfo.sent = false;
        frameInfo.error = error || 'TCP未连接';
        console.log(`[TCP] ✗ 发送失败: Zone ${zoneId} ${zoneState.occupied ? '有人' : '无人'} - ${hexFrame} - ${error || 'TCP未连接'}`);
      }

      // 更新帧信息
      state.lastSentFrame = { ...frameInfo };

      // 更新历史记录中的对应帧
      const frameIndex = state.sentFrames.findIndex(f =>
        f.zoneId === frameInfo.zoneId &&
        f.time === frameInfo.time
      );
      if (frameIndex >= 0) {
        state.sentFrames[frameIndex] = { ...frameInfo };
      }

      // 广播更新
      broadcast({ type: 'frameSent', data: { ...frameInfo } });
      broadcast({
        type: 'sendStats', data: {
          total: state.sendCount,
          success: state.sendSuccessCount,
          failed: state.sendFailCount
        }
      });
    });

    // 立即添加到历史记录（状态为发送中）
    state.lastSentFrame = frameInfo;
    state.sentFrames.push(frameInfo);
    // 只保留最近50条记录
    if (state.sentFrames.length > 50) {
      state.sentFrames.shift();
    }
    broadcast({ type: 'frameSent', data: frameInfo });
  }
}

// WebSocket 广播
const clients = new Set();
wss.on('connection', (ws) => {
  clients.add(ws);

  // 发送初始状态
  ws.send(JSON.stringify({
    type: 'init', data: {
      config: state.config,
      zones: state.zones,
      cursors: Array.from(state.cursors.values()),
      zoneStates: Array.from(state.zoneStates.entries()),
      tcpConnected: state.tcpConnected,
      sendCount: state.sendCount,
      sendSuccessCount: state.sendSuccessCount,
      sendFailCount: state.sendFailCount,
      lastSentFrame: state.lastSentFrame,
      sentFrames: state.sentFrames.slice(-20), // 只发送最近20条
      errors: state.errors.slice(-20),
      outputZoneFilter: state.outputZoneFilter
    }
  }));

  ws.on('close', () => {
    clients.delete(ws);
  });
});

function broadcast(message) {
  const data = JSON.stringify(message);
  clients.forEach(client => {
    if (client.readyState === 1) {
      client.send(data);
    }
  });
}

// API 路由
app.use('/api/config', configRouter(state, broadcast, tuioProcessor, tcpSender, zoneManager));
app.use('/api/zones', zoneRouter(state, zoneManager, broadcast));
app.use('/api/test', testRouter(state, protocolEncoder, tcpSender, broadcast));

app.get('/api/status', (req, res) => {
  res.json({
    cursors: Array.from(state.cursors.values()),
    zoneStates: Array.from(state.zoneStates.entries()),
    tcpConnected: state.tcpConnected,
    sendCount: state.sendCount,
    sendSuccessCount: state.sendSuccessCount,
    sendFailCount: state.sendFailCount,
    lastSentFrame: state.lastSentFrame,
    sentFrames: state.sentFrames.slice(-20),
    errors: state.errors.slice(-20),
    outputZoneFilter: state.outputZoneFilter
  });
});

// 设置输出区域过滤
app.post('/api/monitor/set-output-zone', (req, res) => {
  const { zoneId, zoneIds } = req.body;

  // 处理 zoneIds (支持多选) 或 zoneId (兼容旧版本)
  let newFilters = [];

  if (Array.isArray(zoneIds)) {
    newFilters = zoneIds.map(id => parseInt(id)).filter(id => !isNaN(id) && id >= 1);
  } else if (zoneId !== null && zoneId !== undefined) {
    const zoneIdNum = parseInt(zoneId);
    if (!isNaN(zoneIdNum) && zoneIdNum >= 1) {
      newFilters = [zoneIdNum];
    }
  }

  state.outputZoneFilter = newFilters;

  if (newFilters.length === 0) {
    console.log('[监控] 已设置为输出所有区域');
  } else {
    console.log(`[监控] 已设置为只输出区域: ${newFilters.join(', ')}`);
  }

  // 广播更新
  broadcast({ type: 'outputZoneFilter', data: state.outputZoneFilter });

  res.json({
    success: true,
    outputZoneFilter: state.outputZoneFilter
  });
});

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  tuioProcessor.start();
  tcpSender.start();
});


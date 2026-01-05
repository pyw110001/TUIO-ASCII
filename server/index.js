import express from 'express';
import { WebSocketServer } from 'ws';
import http from 'http';
import cors from 'cors';
import { TUIOProcessor } from './tuio-processor.js';
import { ZoneManager } from './zone-manager.js';
import { ProtocolEncoder } from './protocol-encoder.js';
import { TCPSender } from './tcp-sender.js';
import { configRouter } from './routes/config.js';
import { zoneRouter } from './routes/zones.js';
import { testRouter } from './routes/test.js';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(cors());
app.use(express.json());

// 全局状态
const state = {
  config: {
    udpPort: 3333,
    tcpMode: 'client', // 'client' or 'server'
    tcpHost: '127.0.0.1',
    tcpPort: 8080,
    cursorTimeout: 300,
    sendStrategy: 'onChange', // 'onChange' or 'heartbeat'
    heartbeatInterval: 1000,
    zoneMode: 'grid', // 'grid' or 'custom'
    gridCols: 1,
    gridRows: 4
  },
  zones: {
    grid: { cols: 1, rows: 4, zones: [] },
    custom: []
  },
  cursors: new Map(), // cursorId -> { id, x, y, lastUpdate }
  zoneStates: new Map(), // zoneId -> { occupied: bool, lastChange }
  tcpConnected: false,
  sendCount: 0,
  sendSuccessCount: 0,
  sendFailCount: 0,
  lastSentFrame: null,
  sentFrames: [], // 帧历史记录（最近50条）
  errors: []
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
  
  broadcast({ type: 'cursors', data: Array.from(state.cursors.values()) });
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
  for (const zoneId of zoneIds) {
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
      broadcast({ type: 'sendStats', data: {
        total: state.sendCount,
        success: state.sendSuccessCount,
        failed: state.sendFailCount
      }});
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
  ws.send(JSON.stringify({ type: 'init', data: {
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
    errors: state.errors.slice(-20)
  }}));
  
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
    errors: state.errors.slice(-20)
  });
});

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  tuioProcessor.start();
  tcpSender.start();
});


/**
 * TUIO 消息模拟发送器
 * 用于测试系统，无需实际雷达设备
 * 
 * 使用方法：
 * node test-tuio-sender.js
 */

import dgram from 'dgram';
import readline from 'readline';

const UDP_PORT = 3333;
const TARGET_HOST = '127.0.0.1';

// OSC 消息构建辅助函数
function padTo4Bytes(str) {
  const len = str.length;
  const padLen = (4 - (len % 4)) % 4;
  return str + '\0'.repeat(padLen);
}

function buildOSCMessage(address, typeTag, args) {
  let buffer = Buffer.alloc(0);
  
  // 地址模式
  const addressPadded = padTo4Bytes(address);
  buffer = Buffer.concat([buffer, Buffer.from(addressPadded, 'ascii')]);
  
  // 类型标签
  const typeTagPadded = padTo4Bytes(',' + typeTag);
  buffer = Buffer.concat([buffer, Buffer.from(typeTagPadded, 'ascii')]);
  
  // 参数
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const tag = typeTag[i];
    
    if (tag === 'i') {
      const intBuf = Buffer.alloc(4);
      intBuf.writeInt32BE(arg, 0);
      buffer = Buffer.concat([buffer, intBuf]);
    } else if (tag === 'f') {
      const floatBuf = Buffer.alloc(4);
      floatBuf.writeFloatBE(arg, 0);
      buffer = Buffer.concat([buffer, floatBuf]);
    } else if (tag === 's') {
      const strPadded = padTo4Bytes(arg);
      buffer = Buffer.concat([buffer, Buffer.from(strPadded, 'ascii')]);
    }
  }
  
  return buffer;
}

function sendTUIO2Dcur(socket, command, ...args) {
  let typeTag = 's';
  const oscArgs = [command];
  
  for (const arg of args) {
    if (typeof arg === 'string') {
      typeTag += 's';
      oscArgs.push(arg);
    } else if (Number.isInteger(arg)) {
      typeTag += 'i';
      oscArgs.push(arg);
    } else {
      typeTag += 'f';
      oscArgs.push(arg);
    }
  }
  
  const message = buildOSCMessage('/tuio/2Dcur', typeTag, oscArgs);
  socket.send(message, 0, message.length, UDP_PORT, TARGET_HOST, (err) => {
    if (err) {
      console.error('发送失败:', err);
    } else {
      console.log(`已发送: /tuio/2Dcur ${command}`, ...args);
    }
  });
}

function buildOSCBundle(messages) {
  // Bundle 头: "#bundle\0" (8字节)
  const bundleHeader = Buffer.from('#bundle\0', 'ascii');
  
  // OSC 时间戳: 8字节 (0 = 立即执行)
  const timestamp = Buffer.alloc(8);
  timestamp.writeUInt32BE(0, 0); // 秒
  timestamp.writeUInt32BE(1, 4); // 纳秒（1 = 立即执行）
  
  let bundle = Buffer.concat([bundleHeader, timestamp]);
  
  // 添加每个消息（前面有4字节长度字段）
  for (const message of messages) {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(message.length, 0);
    bundle = Buffer.concat([bundle, length, message]);
  }
  
  return bundle;
}

function sendTUIOBundle(socket, messages) {
  const bundle = buildOSCBundle(messages);
  socket.send(bundle, 0, bundle.length, UDP_PORT, TARGET_HOST, (err) => {
    if (err) {
      console.error('发送 Bundle 失败:', err);
    } else {
      console.log(`已发送 OSC Bundle，包含 ${messages.length} 条消息`);
    }
  });
}

const socket = dgram.createSocket('udp4');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('TUIO 消息模拟发送器');
console.log('目标:', `${TARGET_HOST}:${UDP_PORT}`);
console.log('');
console.log('命令:');
console.log('  set <id> <x> <y>  - 设置 cursor 位置 (x, y 为 0-1 的浮点数)');
console.log('  alive <id1> [id2] ... - 设置活跃的 cursor ID');
console.log('  fseq <frameId> - 发送帧序列号');
console.log('  clear - 清除所有 cursor');
console.log('  quit - 退出');
console.log('');

let cursors = new Map();
let frameId = 0;

function sendFrame() {
  const messages = [];
  
  // 构建 alive 消息
  let typeTag = 's';
  const aliveArgs = ['alive'];
  if (cursors.size > 0) {
    const ids = Array.from(cursors.keys());
    typeTag += 'i'.repeat(ids.length);
    aliveArgs.push(...ids);
  }
  messages.push(buildOSCMessage('/tuio/2Dcur', typeTag, aliveArgs));
  
  // 构建 fseq 消息
  messages.push(buildOSCMessage('/tuio/2Dcur', 'si', ['fseq', frameId++]));
  
  // 使用 Bundle 格式发送（TUIO 标准格式）
  sendTUIOBundle(socket, messages);
}

// 自动发送心跳
setInterval(() => {
  if (cursors.size > 0) {
    sendFrame();
  }
}, 100);

function handleCommand(line) {
  const parts = line.trim().split(/\s+/);
  const cmd = parts[0].toLowerCase();
  
  if (cmd === 'set' && parts.length >= 4) {
    const id = parseInt(parts[1]);
    const x = parseFloat(parts[2]);
    const y = parseFloat(parts[3]);
    
    if (isNaN(id) || isNaN(x) || isNaN(y)) {
      console.log('错误: 无效的参数');
      return;
    }
    
    cursors.set(id, { id, x, y });
    
    // 使用 Bundle 格式发送（TUIO 标准格式）
    const messages = [];
    
    // 构建 set 消息
    messages.push(buildOSCMessage('/tuio/2Dcur', 'siifff', ['set', id, x, y, 0.0, 0.0, 0.0]));
    
    // 构建 alive 消息
    const ids = Array.from(cursors.keys());
    let aliveTypeTag = 's';
    const aliveArgs = ['alive'];
    if (ids.length > 0) {
      aliveTypeTag += 'i'.repeat(ids.length);
      aliveArgs.push(...ids);
    }
    messages.push(buildOSCMessage('/tuio/2Dcur', aliveTypeTag, aliveArgs));
    
    // 构建 fseq 消息
    messages.push(buildOSCMessage('/tuio/2Dcur', 'si', ['fseq', frameId++]));
    
    // 发送 Bundle
    sendTUIOBundle(socket, messages);
  } else if (cmd === 'alive' && parts.length >= 2) {
    const ids = parts.slice(1).map(id => parseInt(id));
    cursors.clear();
    ids.forEach(id => {
      if (!isNaN(id)) {
        // 保留已有的 cursor 数据
        if (cursors.has(id)) {
          cursors.set(id, cursors.get(id));
        }
      }
    });
    sendFrame();
  } else if (cmd === 'fseq' && parts.length >= 2) {
    const frameId = parseInt(parts[1]);
    if (!isNaN(frameId)) {
      const messages = [buildOSCMessage('/tuio/2Dcur', 'si', ['fseq', frameId])];
      sendTUIOBundle(socket, messages);
    }
  } else if (cmd === 'clear') {
    cursors.clear();
    sendFrame();
    console.log('已清除所有 cursor');
  } else if (cmd === 'quit' || cmd === 'exit') {
    console.log('退出...');
    socket.close();
    rl.close();
    process.exit(0);
  } else {
    console.log('未知命令，输入 help 查看帮助');
  }
}

rl.on('line', handleCommand);

// 示例：自动发送一个测试 cursor（使用 Bundle 格式）
console.log('发送测试 cursor (ID=1, 位置 0.5, 0.5)...');
setTimeout(() => {
  cursors.set(1, { id: 1, x: 0.5, y: 0.5 });
  
  const messages = [];
  messages.push(buildOSCMessage('/tuio/2Dcur', 'siifff', ['set', 1, 0.5, 0.5, 0.0, 0.0, 0.0]));
  messages.push(buildOSCMessage('/tuio/2Dcur', 'si', ['alive', 1]));
  messages.push(buildOSCMessage('/tuio/2Dcur', 'si', ['fseq', frameId++]));
  
  sendTUIOBundle(socket, messages);
}, 500);


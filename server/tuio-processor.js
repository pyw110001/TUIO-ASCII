import dgram from 'dgram';

export class TUIOProcessor {
  constructor(port, onCursorsUpdate) {
    this.port = port;
    this.onCursorsUpdate = onCursorsUpdate;
    this.socket = null;
    this.cursors = new Map();
  }

  start() {
    this.socket = dgram.createSocket('udp4');
    
    this.socket.on('message', (msg, rinfo) => {
      try {
        // 检查是否是 OSC Bundle 格式
        if (this.isOSCBundle(msg)) {
          // 解析 Bundle
          const messages = this.parseOSCBundle(msg);
          
          // 调试：记录收到的 Bundle
          if (messages.length > 0) {
            console.log(`[TUIO] 收到 OSC Bundle，包含 ${messages.length} 条消息`);
          }
          
          for (const message of messages) {
            this.handleOSCMessage(message);
          }
        } else {
          // 解析单个 OSC 消息
          const messages = this.parseOSCMessage(msg);
          
          // 调试：记录收到的消息
          if (messages.length > 0) {
            const firstMsg = messages[0];
            if (firstMsg.address === '/tuio/2Dcur' && firstMsg.args.length > 0) {
              const cmd = firstMsg.args[0];
              // 只在收到 set 命令时显示调试信息（避免日志过多）
              if (cmd === 'set' && firstMsg.args.length >= 4) {
                console.log(`[TUIO] 收到 cursor: ID=${firstMsg.args[1]}, X=${firstMsg.args[2].toFixed(3)}, Y=${firstMsg.args[3].toFixed(3)}`);
              }
            }
          }
          
          for (const message of messages) {
            this.handleOSCMessage(message);
          }
        }
        
        this.onCursorsUpdate(this.cursors);
      } catch (error) {
        console.error('Error processing TUIO message:', error);
      }
    });
    
    this.socket.on('error', (err) => {
      console.error('UDP socket error:', err);
    });
    
    this.socket.bind(this.port, () => {
      console.log(`TUIO/UDP listener started on port ${this.port}`);
    });
  }

  /**
   * 检查是否是 OSC Bundle 格式
   * Bundle 格式以 "#bundle" 开头（8字节，对齐到4字节边界）
   */
  isOSCBundle(buffer) {
    if (buffer.length < 8) return false;
    
    const bundleHeader = buffer.toString('ascii', 0, 7);
    return bundleHeader === '#bundle';
  }

  /**
   * 解析 OSC Bundle 格式
   * Bundle 格式：
   * - 8字节: "#bundle\0"
   * - 8字节: OSC 时间戳（可以忽略）
   * - 多个 OSC 消息，每个消息前有4字节的长度字段
   */
  parseOSCBundle(buffer) {
    const messages = [];
    let offset = 0;
    
    try {
      // 跳过 Bundle 头 "#bundle\0" (8字节)
      offset = 8;
      
      // 跳过时间戳 (8字节)
      offset += 8;
      
      // 解析 Bundle 中的消息
      while (offset < buffer.length) {
        // 读取消息长度（4字节，大端序）
        if (offset + 4 > buffer.length) break;
        const messageLength = buffer.readUInt32BE(offset);
        offset += 4;
        
        if (messageLength === 0) break;
        if (offset + messageLength > buffer.length) break;
        
        // 提取消息数据
        const messageBuffer = buffer.slice(offset, offset + messageLength);
        offset += messageLength;
        
        // 检查是否是嵌套的 Bundle
        if (this.isOSCBundle(messageBuffer)) {
          // 递归解析嵌套的 Bundle
          const nestedMessages = this.parseOSCBundle(messageBuffer);
          messages.push(...nestedMessages);
        } else {
          // 解析单个 OSC 消息
          const parsedMessages = this.parseOSCMessage(messageBuffer);
          messages.push(...parsedMessages);
        }
      }
    } catch (error) {
      console.error('OSC Bundle parse error:', error);
    }
    
    return messages;
  }

  parseOSCMessage(buffer) {
    const messages = [];
    let offset = 0;
    
    try {
      // 简单的 OSC 解析（处理 /tuio/2Dcur 消息）
      while (offset < buffer.length) {
        // OSC 地址模式
        const addressEnd = buffer.indexOf(0, offset);
        if (addressEnd === -1) break;
        const address = buffer.toString('ascii', offset, addressEnd);
        offset = addressEnd + 1;
        
        // 对齐到 4 字节边界
        offset = Math.ceil(offset / 4) * 4;
        
        // 类型标签
        if (offset >= buffer.length) break;
        const typeTagEnd = buffer.indexOf(0, offset);
        if (typeTagEnd === -1) break;
        const typeTag = buffer.toString('ascii', offset + 1, typeTagEnd);
        offset = typeTagEnd + 1;
        offset = Math.ceil(offset / 4) * 4;
        
        // 解析参数
        const args = [];
        for (let i = 0; i < typeTag.length && offset < buffer.length; i++) {
          const tag = typeTag[i];
          if (tag === 'i') {
            args.push(buffer.readInt32BE(offset));
            offset += 4;
          } else if (tag === 'f') {
            args.push(buffer.readFloatBE(offset));
            offset += 4;
          } else if (tag === 's') {
            const strEnd = buffer.indexOf(0, offset);
            if (strEnd === -1) break;
            args.push(buffer.toString('ascii', offset, strEnd));
            offset = strEnd + 1;
            offset = Math.ceil(offset / 4) * 4;
          }
        }
        
        messages.push({ address, args });
      }
    } catch (error) {
      console.error('OSC parse error:', error);
    }
    
    return messages;
  }

  handleOSCMessage(message) {
    const { address, args } = message;
    
    if (address === '/tuio/2Dcur') {
      // TUIO 消息格式：第一个参数是命令字符串
      if (args.length === 0) return;
      
      const command = typeof args[0] === 'string' ? args[0] : String(args[0]);
      
      if (command === 'set') {
        // set s_id x_pos y_pos X_vel Y_vel m_accel
        // args: ['set', id(int), x(float), y(float), ...]
        if (args.length < 4) return;
        
        const id = typeof args[1] === 'number' ? args[1] : parseInt(args[1]);
        const x = typeof args[2] === 'number' ? args[2] : parseFloat(args[2]);
        const y = typeof args[3] === 'number' ? args[3] : parseFloat(args[3]);
        
        if (isNaN(id) || isNaN(x) || isNaN(y)) return;
        
        this.cursors.set(id, {
          id,
          x: Math.max(0, Math.min(1, x)),
          y: Math.max(0, Math.min(1, y)),
          lastUpdate: Date.now()
        });
      } else if (command === 'alive') {
        // alive s_id s_id ...
        // args: ['alive', id1(int), id2(int), ...]
        const aliveIds = new Set();
        for (let i = 1; i < args.length; i++) {
          const id = typeof args[i] === 'number' ? args[i] : parseInt(args[i]);
          if (!isNaN(id)) {
            aliveIds.add(id);
          }
        }
        
        // 移除不在 alive 列表中的 cursor
        // 注意：如果 alive 列表为空，表示没有活跃的 cursor，应该清除所有
        // 但为了支持单个触控点，我们采用更宽松的策略：
        // 只有在 alive 列表明确包含其他 ID 时才清除不在列表中的 cursor
        // 如果 alive 为空，我们不清除现有 cursor（让超时机制处理）
        if (aliveIds.size > 0) {
          // 有明确的 alive 列表，清除不在列表中的 cursor
          for (const [id] of this.cursors.entries()) {
            if (!aliveIds.has(id)) {
              this.cursors.delete(id);
            }
          }
        }
        // 如果 alive 为空，不清除 cursor，让超时机制处理
      } else if (command === 'fseq') {
        // fseq frame_id - 帧序列号，可以忽略
      }
    }
  }

  stop() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }

  updatePort(newPort) {
    this.stop();
    this.port = newPort;
    this.start();
  }
}


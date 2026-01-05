import net from 'net';

export class TCPSender {
  constructor(mode, host, port, onStatusChange, onError) {
    this.mode = mode;
    this.host = host;
    this.port = port;
    this.onStatusChange = onStatusChange;
    this.onError = onError;
    this.server = null;
    this.client = null;
    this.connections = [];
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 1000;
    this.reconnectTimer = null;
    this.isReconnecting = false;
  }

  start() {
    if (this.mode === 'client') {
      this.startClient();
    } else {
      this.startServer();
    }
  }

  startClient() {
    this.connect();
  }

  connect() {
    if (this.client) {
      this.client.destroy();
    }

    this.client = new net.Socket();
    
    this.client.on('connect', () => {
      console.log(`TCP Client connected to ${this.host}:${this.port}`);
      this.reconnectAttempts = 0;
      this.isReconnecting = false;
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      this.onStatusChange(true);
    });

    this.client.on('error', (err) => {
      // 完全抑制重复错误输出
      // 只在首次错误时记录，后续错误由重连逻辑处理
      if (this.reconnectAttempts === 0) {
        console.error('TCP Client error:', err.message, '- Will attempt to reconnect');
        this.onStatusChange(false);
        this.onError(`TCP Client error: ${err.message}`);
      }
      // 不在这里调度重连，让 close 事件处理
    });

    this.client.on('close', () => {
      // 只在非主动关闭且未在重连中时处理
      if (!this.isReconnecting && this.mode === 'client') {
        // 只在首次关闭时记录日志
        if (this.reconnectAttempts === 0) {
          console.log('TCP Client connection closed - Will attempt to reconnect');
        }
        this.onStatusChange(false);
        this.scheduleReconnect();
      }
    });

    try {
      this.client.connect(this.port, this.host);
    } catch (err) {
      this.onError(`TCP Client connect failed: ${err.message}`);
      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    // 防止重复调度
    if (this.isReconnecting || this.reconnectTimer) {
      return;
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      if (this.reconnectAttempts === this.maxReconnectAttempts) {
        console.log('TCP Client: Max reconnect attempts reached. Stopping reconnection.');
        this.onError('TCP Client: Max reconnect attempts reached. Stopping reconnection.');
      }
      this.reconnectAttempts++;
      return;
    }

    this.isReconnecting = true;
    const attempt = this.reconnectAttempts + 1;
    const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts = attempt;
    
    // 只在首次重连时显示信息，后续静默重连
    if (attempt === 1) {
      console.log(`TCP Client: Will reconnect in ${delay}ms (attempt ${attempt}/${this.maxReconnectAttempts})`);
    }
    
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.isReconnecting = false;
      if (this.mode === 'client') {
        // 重置重连标志，允许新的连接尝试
        this.connect();
      }
    }, delay);
  }

  startServer() {
    this.server = net.createServer((socket) => {
      console.log(`TCP Server: New connection from ${socket.remoteAddress}:${socket.remotePort}`);
      this.connections.push(socket);
      this.onStatusChange(this.connections.length > 0);

      socket.on('error', (err) => {
        console.error('TCP Server connection error:', err.message);
        this.onError(`TCP Server connection error: ${err.message}`);
      });

      socket.on('close', () => {
        console.log('TCP Server: Connection closed');
        this.connections = this.connections.filter(conn => conn !== socket);
        this.onStatusChange(this.connections.length > 0);
      });
    });

    this.server.on('error', (err) => {
      console.error('TCP Server error:', err.message);
      this.onError(`TCP Server error: ${err.message}`);
    });

    this.server.listen(this.port, () => {
      console.log(`TCP Server listening on port ${this.port}`);
    });
  }

  send(frame, onSent) {
    if (this.mode === 'client') {
      if (this.client && this.client.writable) {
        try {
          const result = this.client.write(frame);
          
          // write() 返回 false 表示缓冲区已满，需要等待 drain 事件
          if (result === false) {
            // 等待缓冲区清空
            this.client.once('drain', () => {
              if (onSent) onSent(true, frame.length);
            });
            // 先返回 true，表示已排队等待发送
            if (onSent) {
              // 延迟确认，确保数据真正发送
              setTimeout(() => onSent(true, frame.length), 10);
            }
            return true;
          } else {
            // 立即发送成功
            if (onSent) {
              setTimeout(() => onSent(true, frame.length), 10);
            }
            return true;
          }
        } catch (err) {
          this.onError(`TCP Client send error: ${err.message}`);
          if (onSent) onSent(false, 0, err.message);
          return false;
        }
      }
      if (onSent) onSent(false, 0, 'Client not connected');
      return false;
    } else {
      // Server mode: 发送给所有连接的客户端
      if (this.connections.length === 0) {
        if (onSent) onSent(false, 0, 'No connections');
        return false;
      }
      
      let sentCount = 0;
      let errorCount = 0;
      const errors = [];
      
      for (const socket of this.connections) {
        if (socket.writable) {
          try {
            const result = socket.write(frame);
            if (result === false) {
              socket.once('drain', () => {
                sentCount++;
                if (sentCount + errorCount === this.connections.length && onSent) {
                  onSent(sentCount > 0, frame.length * sentCount);
                }
              });
            } else {
              sentCount++;
            }
          } catch (err) {
            errorCount++;
            errors.push(err.message);
            this.onError(`TCP Server send error: ${err.message}`);
          }
        } else {
          errorCount++;
        }
      }
      
      // 如果所有连接都立即发送成功，立即回调
      if (sentCount > 0 && errorCount === 0 && this.connections.every(s => s.writable)) {
        if (onSent) {
          setTimeout(() => onSent(true, frame.length * sentCount), 10);
        }
      } else if (sentCount === 0 && errorCount > 0) {
        if (onSent) onSent(false, 0, errors.join('; '));
      }
      
      return sentCount > 0;
    }
  }

  updateConfig(mode, host, port) {
    const changed = this.mode !== mode || this.host !== host || this.port !== port;
    
    if (changed) {
      this.stop();
      this.mode = mode;
      this.host = host;
      this.port = port;
      this.reconnectAttempts = 0; // 重置重连计数
      this.start();
    }
  }

  stop() {
    this.isReconnecting = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    if (this.client) {
      this.client.destroy();
      this.client = null;
    }
    
    if (this.server) {
      this.server.close();
      this.server = null;
    }
    
    this.connections.forEach(socket => socket.destroy());
    this.connections = [];
    this.reconnectAttempts = 0;
    this.onStatusChange(false);
  }
}



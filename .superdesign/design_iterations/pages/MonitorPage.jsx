import React, { useState, useEffect } from 'react';

export default function MonitorPage({ api, wsData }) {
  const [status, setStatus] = useState({
    cursors: [],
    zoneStates: [],
    tcpConnected: false,
    sendCount: 0,
    sendSuccessCount: 0,
    sendFailCount: 0,
    lastSentFrame: null,
    sentFrames: [],
    errors: [],
    outputZoneFilter: null, // null表示输出所有区域，数字表示只输出该区域
  });
  const [selectedOutputZone, setSelectedOutputZone] = useState(null);

  useEffect(() => {
    if (wsData?.type === 'init') {
      const outputZoneFilter = wsData.data.outputZoneFilter ?? null;
      setStatus({
        cursors: wsData.data.cursors || [],
        zoneStates: wsData.data.zoneStates || [],
        tcpConnected: wsData.data.tcpConnected || false,
        sendCount: wsData.data.sendCount || 0,
        sendSuccessCount: wsData.data.sendSuccessCount || 0,
        sendFailCount: wsData.data.sendFailCount || 0,
        lastSentFrame: wsData.data.lastSentFrame,
        sentFrames: wsData.data.sentFrames || [],
        errors: wsData.data.errors || [],
        outputZoneFilter: outputZoneFilter,
      });
      setSelectedOutputZone(outputZoneFilter);
    } else if (wsData?.type === 'sendStats') {
      setStatus((prev) => ({
        ...prev,
        sendCount: wsData.data.total,
        sendSuccessCount: wsData.data.success,
        sendFailCount: wsData.data.failed,
      }));
    } else if (wsData?.type === 'cursors') {
      setStatus((prev) => ({ ...prev, cursors: wsData.data }));
    } else if (wsData?.type === 'zoneStates') {
      setStatus((prev) => ({ ...prev, zoneStates: wsData.data }));
    } else if (wsData?.type === 'tcpStatus') {
      setStatus((prev) => ({ ...prev, tcpConnected: wsData.data.connected }));
    } else if (wsData?.type === 'frameSent') {
      setStatus((prev) => ({
        ...prev,
        lastSentFrame: wsData.data,
        sentFrames: [...prev.sentFrames, wsData.data].slice(-50), // 只保留最近50条
        sendCount: prev.sendCount + 1,
      }));
    } else if (wsData?.type === 'error') {
      setStatus((prev) => ({
        ...prev,
        errors: [...prev.errors, { time: Date.now(), message: wsData.data }],
      }));
    } else if (wsData?.type === 'outputZoneFilter') {
      setStatus((prev) => ({
        ...prev,
        outputZoneFilter: wsData.data,
      }));
      setSelectedOutputZone(wsData.data);
    }
  }, [wsData]);

  const handleTestSend = async () => {
    const zoneId = parseInt(prompt('请输入区域号 (1-255):', '1'));
    if (isNaN(zoneId) || zoneId < 1 || zoneId > 255) {
      alert('无效的区域号');
      return;
    }
    const occupied = confirm('是否有人？\n确定=有人，取消=无人');
    try {
      const result = await api.testSend(zoneId, occupied);
      alert(`发送成功: ${result.hex}`);
    } catch (error) {
      alert('发送失败: ' + error.message);
    }
  };

  const handleSetOutputZone = async (zoneId) => {
    try {
      const result = await fetch('/api/monitor/set-output-zone', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ zoneId }),
      });
      const data = await result.json();
      if (data.success) {
        setSelectedOutputZone(data.outputZoneFilter);
        if (data.outputZoneFilter === null) {
          alert('已设置为输出所有区域');
        } else {
          alert(`已设置为只输出区域 ${data.outputZoneFilter}`);
        }
      } else {
        alert('设置失败: ' + (data.error || '未知错误'));
      }
    } catch (error) {
      alert('设置失败: ' + error.message);
    }
  };

  return (
    <div>
      <div className="grid grid-2">
        <div className="card">
          <h2>TUIO 输入监控</h2>
          <div style={{ marginBottom: '10px' }}>
            <strong>Cursor 数量:</strong> {status.cursors.length}
          </div>
          <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
            {status.cursors.map((cursor) => (
              <div key={cursor.id} style={{ marginBottom: '5px', fontSize: '12px' }}>
                ID: {cursor.id}, X: {cursor.x.toFixed(3)}, Y: {cursor.y.toFixed(3)}
              </div>
            ))}
            {status.cursors.length === 0 && (
              <div style={{ color: 'var(--text-secondary)' }}>暂无 cursor</div>
            )}
          </div>
        </div>

        <div className="card">
          <h2>TCP 连接状态</h2>
          <div style={{ marginBottom: '10px' }}>
            <span
              className={`status-indicator ${
                status.tcpConnected ? 'connected' : 'disconnected'
              }`}
            />
            {status.tcpConnected ? '已连接' : '未连接'}
          </div>
          <div style={{ marginBottom: '10px' }}>
            <strong>发送统计:</strong>
            <div style={{ marginTop: '5px', fontSize: '14px' }}>
              <div>总计: <strong>{status.sendCount}</strong></div>
              <div style={{ color: '#28a745' }}>成功: <strong>{status.sendSuccessCount}</strong></div>
              <div style={{ color: '#dc3545' }}>失败: <strong>{status.sendFailCount}</strong></div>
              {status.sendCount > 0 && (
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '5px' }}>
                  成功率: {((status.sendSuccessCount / status.sendCount) * 100).toFixed(1)}%
                </div>
              )}
            </div>
          </div>
          <button className="btn btn-secondary" onClick={handleTestSend}>
            测试发送
          </button>
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <h2 style={{ margin: 0 }}>区域状态</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <label style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
              输出过滤:
            </label>
            <select
              value={selectedOutputZone === null ? '' : selectedOutputZone}
              onChange={(e) => {
                const value = e.target.value === '' ? null : parseInt(e.target.value);
                handleSetOutputZone(value);
              }}
              style={{
                padding: '6px 12px',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                fontSize: '14px',
                background: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                cursor: 'pointer'
              }}
            >
              <option value="">所有区域</option>
              {status.zoneStates.map(([zoneId]) => (
                <option key={zoneId} value={zoneId}>
                  只输出区域 {zoneId}
                </option>
              ))}
            </select>
            {selectedOutputZone !== null && (
              <span style={{ 
                fontSize: '12px', 
                color: '#ffc107',
                padding: '4px 8px',
                backgroundColor: 'rgba(255, 193, 7, 0.2)',
                borderRadius: '4px'
              }}>
                当前只输出区域 {selectedOutputZone}
              </span>
            )}
          </div>
        </div>
        <div className="zone-list">
          {status.zoneStates.map(([zoneId, state]) => (
            <div
              key={zoneId}
              className={`zone-item ${state.occupied ? 'occupied' : 'unoccupied'}`}
              style={{
                border: selectedOutputZone === zoneId ? '2px solid #ffc107' : undefined,
                backgroundColor: selectedOutputZone === zoneId ? 'rgba(255, 193, 7, 0.1)' : undefined
              }}
            >
              <div>
                <strong>区域 {zoneId}</strong> - {state.occupied ? '有人' : '无人'}
                {selectedOutputZone === zoneId && (
                  <span style={{ 
                    marginLeft: '10px', 
                    fontSize: '12px', 
                    color: '#ffc107',
                    fontWeight: 'bold'
                  }}>
                    [仅输出此区域]
                  </span>
                )}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                {new Date(state.lastChange).toLocaleTimeString()}
              </div>
            </div>
          ))}
          {status.zoneStates.length === 0 && (
            <div style={{ color: 'var(--text-secondary)' }}>暂无区域</div>
          )}
        </div>
      </div>

      <div className="card">
        <h2>发送的帧历史</h2>
        <div style={{ marginBottom: '10px', fontSize: '14px', color: 'var(--text-secondary)' }}>
          总计: {status.sendCount} 条 | 显示: {status.sentFrames.length} 条
        </div>
        {status.sentFrames.length > 0 ? (
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {status.sentFrames.slice().reverse().map((frame, index) => (
              <div
                key={`${frame.time}-${index}`}
                style={{
                  marginBottom: '15px',
                  padding: '12px',
                  border: `1px solid ${frame.sent === true ? '#28a745' : frame.sent === false ? '#dc3545' : '#ffc107'}`,
                  borderRadius: '4px',
                  backgroundColor: frame.sent === true 
                    ? 'rgba(40, 167, 69, 0.15)' 
                    : frame.sent === false 
                    ? 'rgba(220, 53, 69, 0.15)' 
                    : 'rgba(255, 193, 7, 0.15)',
                  color: 'var(--text-primary)',
                }}
              >
                <div style={{ marginBottom: '8px', fontSize: '13px', color: 'var(--text-primary)' }}>
                  <strong>区域 {frame.zoneId}</strong> - {frame.occupied ? '有人' : '无人'} |{' '}
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {new Date(frame.time).toLocaleString()}
                  </span>
                </div>
                <div style={{ marginBottom: '8px', fontSize: '12px' }}>
                  <span style={{ color: frame.tcpConnected ? '#28a745' : '#dc3545', marginRight: '15px' }}>
                    TCP: {frame.tcpConnected ? '已连接' : '未连接'}
                  </span>
                  <span style={{ 
                    color: frame.sent === true ? '#28a745' : frame.sent === false ? '#dc3545' : '#ffc107',
                    marginRight: '15px'
                  }}>
                    状态: {
                      frame.sent === true ? `✓ 已发送 (${frame.bytesSent || 8} bytes)` :
                      frame.sent === false ? `✗ 发送失败${frame.error ? ': ' + frame.error : ''}` :
                      '⏳ 发送中...'
                    }
                  </span>
                </div>
                <div className="hex-frame" style={{ 
                  fontSize: '13px',
                  margin: 0
                }}>
                  {frame.frame}
                </div>
              </div>
            ))}
          </div>
        ) : status.lastSentFrame ? (
          <div>
            <div style={{ marginBottom: '10px' }}>
              <strong>区域:</strong> {status.lastSentFrame.zoneId} |{' '}
              <strong>状态:</strong> {status.lastSentFrame.occupied ? '有人' : '无人'} |{' '}
              <strong>时间:</strong>{' '}
              {new Date(status.lastSentFrame.time).toLocaleString()}
            </div>
            <div style={{ marginBottom: '10px' }}>
              <strong>TCP状态:</strong>{' '}
              <span style={{ color: status.lastSentFrame.tcpConnected ? '#28a745' : '#dc3545' }}>
                {status.lastSentFrame.tcpConnected ? '已连接' : '未连接'}
              </span>
              {' | '}
              <strong>发送状态:</strong>{' '}
              <span style={{ color: status.lastSentFrame.sent !== false ? '#28a745' : '#ffc107' }}>
                {status.lastSentFrame.sent !== false ? '已发送' : '未发送（TCP未连接）'}
              </span>
            </div>
            <div className="hex-frame">
              {status.lastSentFrame.frame}
            </div>
          </div>
        ) : (
          <div style={{ color: 'var(--text-secondary)' }}>暂无发送记录</div>
        )}
      </div>

      <div className="card">
        <h2>错误日志</h2>
        <div className="log">
          {status.errors.map((error, index) => (
            <div key={index} className="log-entry error">
              [{new Date(error.time).toLocaleTimeString()}] {error.message}
            </div>
          ))}
          {status.errors.length === 0 && (
            <div className="log-entry">暂无错误</div>
          )}
        </div>
      </div>
    </div>
  );
}

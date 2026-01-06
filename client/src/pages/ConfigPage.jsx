import React, { useState, useEffect } from 'react';

export default function ConfigPage({ api, wsData }) {
  const [config, setConfig] = useState({
    udpPort: 3333,
    tcpMode: 'client',
    tcpHost: '127.0.0.1',
    tcpPort: 8080,
    cursorTimeout: 300,
    sendStrategy: 'onChange',
    heartbeatInterval: 1000,
    zoneMode: 'grid',
    gridCols: 1,
    gridRows: 4,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (wsData?.type === 'init') {
      setConfig(wsData.data.config);
    } else if (wsData?.type === 'config') {
      setConfig(wsData.data);
    }
  }, [wsData]);

  const handleSave = async () => {
    setSaving(true);
    try {
      console.log('保存配置:', config);
      const result = await api.updateConfig(config);
      console.log('保存结果:', result);
      if (result.success) {
        alert(`配置已保存成功！\nTCP模式: ${config.tcpMode}\n${config.tcpMode === 'client' ? `目标IP: ${config.tcpHost}\n目标端口: ${config.tcpPort}` : `监听端口: ${config.tcpPort}`}`);
      } else {
        alert('保存失败: ' + (result.message || '未知错误'));
      }
    } catch (error) {
      console.error('保存配置错误:', error);
      alert('保存失败: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="card">
        <h2>UDP/TUIO 输入配置</h2>
        <div className="form-group">
          <label>UDP 监听端口</label>
          <input
            type="number"
            value={config.udpPort}
            onChange={(e) => setConfig({ ...config, udpPort: parseInt(e.target.value) })}
          />
        </div>
      </div>

        <div className="card">
          <h2>TCP 输出配置</h2>
          <div className="form-group">
            <label>TCP 模式</label>
            <select
              value={config.tcpMode}
              onChange={(e) => setConfig({ ...config, tcpMode: e.target.value })}
            >
              <option value="client">客户端模式（主动连接）</option>
              <option value="server">服务端模式（等待连接）</option>
            </select>
            <div style={{ marginTop: '5px', fontSize: '12px', color: 'var(--text-secondary)' }}>
              {config.tcpMode === 'client' 
                ? '提示：客户端模式需要目标设备正在运行并监听TCP端口'
                : '提示：服务端模式会监听端口，等待设备连接'}
            </div>
          </div>
          {config.tcpMode === 'client' && (
            <>
              <div className="form-group">
                <label>目标 IP 地址</label>
                <input
                  type="text"
                  value={config.tcpHost || ''}
                  onChange={(e) => {
                    const newHost = e.target.value.trim();
                    setConfig({ ...config, tcpHost: newHost });
                    console.log('TCP Host changed to:', newHost);
                  }}
                  placeholder="例如: 127.0.0.1 或 192.168.1.100"
                  style={{ 
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid var(--border-color)',
                    borderRadius: '4px',
                    fontSize: '14px',
                    background: 'var(--bg-secondary)',
                    color: 'var(--text-primary)'
                  }}
                />
                {config.tcpHost && (
                  <div style={{ marginTop: '5px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                    当前设置: <strong>{config.tcpHost}</strong>
                  </div>
                )}
              </div>
              <div className="form-group">
                <label>目标端口</label>
                <input
                  type="number"
                  value={config.tcpPort}
                  onChange={(e) => setConfig({ ...config, tcpPort: parseInt(e.target.value) })}
                  placeholder="例如: 8080"
                />
              </div>
              <div style={{ 
                padding: '10px', 
                backgroundColor: 'rgba(255, 193, 7, 0.1)', 
                borderRadius: '4px',
                fontSize: '12px',
                color: 'var(--text-secondary)',
                border: '1px solid rgba(255, 193, 7, 0.3)'
              }}>
                <strong>⚠️ 连接提示：</strong>
                <ul style={{ marginTop: '5px', paddingLeft: '20px' }}>
                  <li>确保目标设备已启动并监听 {config.tcpPort} 端口</li>
                  <li>检查防火墙是否允许TCP连接</li>
                  <li>可以使用 telnet {config.tcpHost} {config.tcpPort} 测试连接</li>
                  <li>如果无法连接，可以切换到"服务端模式"等待设备主动连接</li>
                </ul>
              </div>
            </>
          )}
          {config.tcpMode === 'server' && (
            <>
              <div className="form-group">
                <label>监听端口</label>
                <input
                  type="number"
                  value={config.tcpPort}
                  onChange={(e) => setConfig({ ...config, tcpPort: parseInt(e.target.value) })}
                  placeholder="例如: 8080"
                />
              </div>
              <div style={{ 
                padding: '10px', 
                backgroundColor: 'rgba(40, 167, 69, 0.1)', 
                borderRadius: '4px',
                fontSize: '12px',
                color: 'var(--text-secondary)',
                border: '1px solid rgba(40, 167, 69, 0.3)'
              }}>
                <strong>ℹ️ 服务端模式：</strong>
                <ul style={{ marginTop: '5px', paddingLeft: '20px' }}>
                  <li>系统将监听 {config.tcpPort} 端口</li>
                  <li>等待目标设备主动连接到此端口</li>
                  <li>连接成功后即可发送数据</li>
                </ul>
              </div>
            </>
          )}
        </div>

      <div className="card">
        <h2>发送策略</h2>
        <div className="form-group">
          <label>发送方式</label>
          <select
            value={config.sendStrategy}
            onChange={(e) => setConfig({ ...config, sendStrategy: e.target.value })}
          >
            <option value="onChange">状态变化时发送</option>
            <option value="heartbeat">心跳周期发送</option>
          </select>
        </div>
        {config.sendStrategy === 'heartbeat' && (
          <div className="form-group">
            <label>心跳间隔 (毫秒)</label>
            <input
              type="number"
              value={config.heartbeatInterval}
              onChange={(e) => setConfig({ ...config, heartbeatInterval: parseInt(e.target.value) })}
            />
          </div>
        )}
        <div className="form-group">
          <label>Cursor 超时时间 (毫秒)</label>
          <input
            type="number"
            value={config.cursorTimeout}
            onChange={(e) => setConfig({ ...config, cursorTimeout: parseInt(e.target.value) })}
          />
        </div>
      </div>

      <div className="card">
        <h2>区域模式</h2>
        <div className="form-group">
          <label>分区模式</label>
          <select
            value={config.zoneMode}
            onChange={(e) => setConfig({ ...config, zoneMode: e.target.value })}
          >
            <option value="grid">屏幕分区法</option>
            <option value="custom">自定义矩形区域</option>
          </select>
        </div>
        {config.zoneMode === 'grid' && (
          <>
            <div className="form-group">
              <label>列数</label>
              <input
                type="number"
                min="1"
                max="16"
                value={config.gridCols}
                onChange={(e) => setConfig({ ...config, gridCols: parseInt(e.target.value) })}
              />
            </div>
            <div className="form-group">
              <label>行数</label>
              <input
                type="number"
                min="1"
                max="16"
                value={config.gridRows}
                onChange={(e) => setConfig({ ...config, gridRows: parseInt(e.target.value) })}
              />
            </div>
          </>
        )}
      </div>

      <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
        {saving ? '保存中...' : '保存配置'}
      </button>
    </div>
  );
}


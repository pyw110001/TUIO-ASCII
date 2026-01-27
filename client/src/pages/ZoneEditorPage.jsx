import React, { useState, useEffect, useRef } from 'react';

export default function ZoneEditorPage({ api, wsData }) {
  const canvasRef = useRef(null);
  const [zones, setZones] = useState({ grid: { cols: 1, rows: 4, zones: [] }, custom: [] });
  const [cursors, setCursors] = useState([]);
  const [zoneStates, setZoneStates] = useState([]);
  const [config, setConfig] = useState({ zoneMode: 'grid', gridCols: 1, gridRows: 4 });
  const [selectedZone, setSelectedZone] = useState(null);
  const [drawing, setDrawing] = useState(false);
  const [startPos, setStartPos] = useState(null);
  const [drawMode, setDrawMode] = useState(false); // 默认不开启自由绘制以防误选
  const [tempCustomZones, setTempCustomZones] = useState([]); // 临时存储编辑中的区域
  const [sentFrames, setSentFrames] = useState([]); // 帧历史记录
  const [status, setStatus] = useState({
    sendCount: 0,
    sendSuccessCount: 0,
    sendFailCount: 0,
    tcpConnected: false
  });

  // 页面加载时从 API 获取最新状态，防止 Tab 切换导致的状态丢失
  useEffect(() => {
    const loadInitialState = async () => {
      try {
        const [serverConfig, serverZones, serverStatus] = await Promise.all([
          api.getConfig(),
          api.getZones(),
          api.getStatus()
        ]);

        if (serverConfig) setConfig(serverConfig);
        if (serverZones) {
          setZones(serverZones);
          setTempCustomZones(serverZones.custom || []);
        }
        if (serverStatus) {
          setSentFrames(serverStatus.sentFrames || []);
          setStatus({
            sendCount: serverStatus.sendCount || 0,
            sendSuccessCount: serverStatus.sendSuccessCount || 0,
            sendFailCount: serverStatus.sendFailCount || 0,
            tcpConnected: serverStatus.tcpConnected || false
          });
        }
      } catch (error) {
        console.error('加载初始状态失败:', error);
      }
    };
    loadInitialState();
  }, [api]);

  useEffect(() => {
    if (wsData?.type === 'init') {
      setZones(wsData.data.zones || { grid: { cols: 1, rows: 4, zones: [] }, custom: [] });
      setTempCustomZones(wsData.data.zones?.custom || []);
      setCursors(wsData.data.cursors || []);
      setZoneStates(wsData.data.zoneStates || []);
      setConfig(wsData.data.config || { zoneMode: 'grid', gridCols: 1, gridRows: 4 });
      setSentFrames(wsData.data.sentFrames || []);
      setStatus({
        sendCount: wsData.data.sendCount || 0,
        sendSuccessCount: wsData.data.sendSuccessCount || 0,
        sendFailCount: wsData.data.sendFailCount || 0,
        tcpConnected: wsData.data.tcpConnected || false
      });
    } else if (wsData?.type === 'zones') {
      setZones(wsData.data);
      setTempCustomZones(wsData.data.custom || []);
    } else if (wsData?.type === 'cursors') {
      setCursors(wsData.data);
    } else if (wsData?.type === 'zoneStates') {
      setZoneStates(wsData.data);
    } else if (wsData?.type === 'config') {
      setConfig(wsData.data);
    } else if (wsData?.type === 'frameSent') {
      setSentFrames(prev => [...prev, wsData.data].slice(-30));
    } else if (wsData?.type === 'tcpStatus') {
      setStatus(prev => ({ ...prev, tcpConnected: wsData.data.connected }));
    } else if (wsData?.type === 'sendStats') {
      setStatus(prev => ({
        ...prev,
        sendCount: wsData.data.total,
        sendSuccessCount: wsData.data.success,
        sendFailCount: wsData.data.failed
      }));
    }
  }, [wsData]);

  const handleModeChange = async (newMode) => {
    const updatedConfig = { ...config, zoneMode: newMode };
    try {
      const response = await api.updateConfig(updatedConfig);
      if (response && response.success) {
        setConfig(response.config);
        // 如果是从网格切换到自定义，且当前没有自定义区域，自动加载一次区域信息
        if (newMode === 'custom') {
          const serverZones = await api.getZones();
          if (serverZones) {
            setZones(serverZones);
            setTempCustomZones(serverZones.custom || []);
          }
        }
      } else {
        throw new Error(response.message || '服务器返回错误');
      }
    } catch (error) {
      console.error('更新模式失败:', error);
      alert('更新模式失败: ' + error.message);
    }
  };

  const saveCustomZones = async (updatedList = tempCustomZones) => {
    const updatedZones = {
      ...zones,
      custom: updatedList
    };
    try {
      const result = await api.updateZones(updatedZones);
      if (result.success) {
        console.log('区域配置已保存');
      }
    } catch (error) {
      alert('保存失败: ' + error.message);
    }
  };

  const handleSplitLR = () => {
    const newZones = [
      { id: 2, x: 0, y: 0, width: 0.5, height: 1 },
      { id: 3, x: 0.5, y: 0, width: 0.5, height: 1 }
    ];
    setTempCustomZones(newZones);
    saveCustomZones(newZones);
  };

  const handleSplitTB = () => {
    const newZones = [
      { id: 2, x: 0, y: 0, width: 1, height: 0.5 },
      { id: 3, x: 0, y: 0.5, width: 1, height: 0.5 }
    ];
    setTempCustomZones(newZones);
    saveCustomZones(newZones);
  };

  const handleClearZones = () => {
    if (confirm('确定要清除所有自定义区域吗？')) {
      setTempCustomZones([]);
      saveCustomZones([]);
    }
  };

  const handleZoneIdChange = (index, newId) => {
    const newList = [...tempCustomZones];
    newList[index] = { ...newList[index], id: parseInt(newId) || 0 };
    setTempCustomZones(newList);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    function draw() {
      ctx.clearRect(0, 0, width, height);

      // 绘制网格背景
      ctx.strokeStyle = '#e0e0e0';
      ctx.lineWidth = 1;
      for (let i = 0; i <= 10; i++) {
        ctx.beginPath();
        ctx.moveTo((i / 10) * width, 0);
        ctx.lineTo((i / 10) * width, height);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, (i / 10) * height);
        ctx.lineTo(width, (i / 10) * height);
        ctx.stroke();
      }

      // 绘制区域
      const isGrid = config.zoneMode === 'grid';

      if (isGrid) {
        const { gridCols, gridRows } = config;
        const cols = gridCols || 1;
        const rows = gridRows || 4;
        const zoneWidth = width / cols;
        const zoneHeight = height / rows;

        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            const zoneId = row * cols + col + 1;
            const x = col * zoneWidth;
            const y = row * zoneHeight;
            const zoneState = zoneStates.find(([id]) => id === zoneId)?.[1];

            drawZone(ctx, x, y, zoneWidth, zoneHeight, zoneId, zoneState?.occupied);
          }
        }
      } else {
        // 绘制自定义区域
        tempCustomZones.forEach((zone) => {
          const x = zone.x * width;
          const y = zone.y * height;
          const w = zone.width * width;
          const h = zone.height * height;
          const zoneState = zoneStates.find(([id]) => id === zone.id)?.[1];

          drawZone(ctx, x, y, w, h, zone.id, zoneState?.occupied);
        });
      }

      function drawZone(ctx, x, y, w, h, id, isOccupied) {
        // 填充背景
        ctx.fillStyle = isOccupied ? 'rgba(40, 167, 69, 0.3)' : 'rgba(255, 255, 255, 0.05)';
        ctx.fillRect(x, y, w, h);

        // 绘制边框
        ctx.strokeStyle = isOccupied ? '#28a745' : '#00d2ff'; // 使用更亮的颜色
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, w, h);

        // 绘制 ID 标签 (高对比度)
        const labelText = `Zone ${id}`;
        ctx.font = 'bold 20px Inter, Arial';
        const textMetrics = ctx.measureText(labelText);
        const textWidth = textMetrics.width;

        // 标签背景
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(x + w / 2 - textWidth / 2 - 10, y + h / 2 - 15, textWidth + 20, 30);

        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = 4;
        ctx.fillText(labelText, x + w / 2, y + h / 2);
        ctx.shadowBlur = 0; // 重置阴影

        if (isOccupied) {
          ctx.font = '12px Arial';
          ctx.fillText('OCCUPIED', x + w / 2, y + h / 2 + 25);
        }
      }

      // 绘制 cursors
      cursors.forEach((cursor) => {
        const x = cursor.x * width;
        const y = cursor.y * height;

        ctx.fillStyle = '#007bff';
        ctx.beginPath();
        ctx.arc(x, y, 8, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'white';
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(cursor.id, x, y + 3);
      });

      // 绘制正在绘制的矩形
      if (drawing && startPos) {
        const rect = getRectFromMouse(startPos, { x: 0, y: 0 });
        ctx.strokeStyle = '#007bff';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(rect.x * width, rect.y * height, rect.width * width, rect.height * height);
        ctx.setLineDash([]);
      }
    }

    draw();
  }, [zones, tempCustomZones, cursors, zoneStates, config, drawing, startPos]);

  const getRectFromMouse = (start, current) => {
    const x = Math.min(start.x, current.x);
    const y = Math.min(start.y, current.y);
    const width = Math.abs(current.x - start.x);
    const height = Math.abs(current.y - start.y);
    return { x, y, width, height };
  };

  const getMousePos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };
  };

  const handleMouseDown = (e) => {
    if (config.zoneMode === 'custom' && drawMode) {
      const pos = getMousePos(e);
      setDrawing(true);
      setStartPos(pos);
    }
  };

  const handleMouseUp = async (e) => {
    if (drawing && startPos && config.zoneMode === 'custom' && drawMode) {
      const endPos = getMousePos(e);
      const rect = getRectFromMouse(startPos, endPos);

      if (rect.width > 0.01 && rect.height > 0.01) {
        const zoneId = prompt('请输入区域号 (1-255):');
        if (zoneId && !isNaN(zoneId) && parseInt(zoneId) >= 1 && parseInt(zoneId) <= 255) {
          const newZone = {
            id: parseInt(zoneId),
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          };

          const newList = [...tempCustomZones.filter((z) => z.id !== newZone.id), newZone];
          setTempCustomZones(newList);
          saveCustomZones(newList);
        }
      }

      setDrawing(false);
      setStartPos(null);
    }
  };

  const handleDeleteZone = async (zoneId) => {
    if (confirm(`确定要删除区域 ${zoneId} 吗？`)) {
      const newList = tempCustomZones.filter((z) => z.id !== zoneId);
      setTempCustomZones(newList);
      saveCustomZones(newList);
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '20px', alignItems: 'start' }}>
      {/* 左侧编辑区 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <h2 style={{ margin: 0 }}>区域可视化编辑器</h2>
            <div className="btn-group" style={{ display: 'flex', gap: '5px', background: 'var(--bg-secondary)', padding: '4px', borderRadius: '8px' }}>
              <button
                className={`btn ${config.zoneMode === 'grid' ? 'btn-primary' : ''}`}
                style={{ padding: '6px 15px', fontSize: '14px', borderRadius: '6px' }}
                onClick={() => handleModeChange('grid')}
              >
                网格模式
              </button>
              <button
                className={`btn ${config.zoneMode === 'custom' ? 'btn-primary' : ''}`}
                style={{ padding: '6px 15px', fontSize: '14px', borderRadius: '6px' }}
                onClick={() => handleModeChange('custom')}
              >
                自定义模式
              </button>
            </div>
          </div>

          <p style={{ marginBottom: '15px', color: 'var(--text-secondary)', fontSize: '14px' }}>
            {config.zoneMode === 'grid'
              ? `当前显示 ${config.gridCols || 1}x${config.gridRows || 4} 均匀网格。如需修改行列数，请前往配置页面。`
              : '使用下方“区域预设”快速布局，或者开启“自由绘制”手动划定区域。'}
          </p>

          {config.zoneMode === 'custom' && (
            <div style={{ marginBottom: '15px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '14px', fontWeight: 'bold' }}>区域预设:</span>
              <button className="btn btn-secondary" onClick={handleSplitLR} style={{ fontSize: '12px' }}>
                分割左右
              </button>
              <button className="btn btn-secondary" onClick={handleSplitTB} style={{ fontSize: '12px' }}>
                分割上下
              </button>
              <button className="btn btn-secondary" onClick={handleClearZones} style={{ fontSize: '12px', color: '#dc3545' }}>
                清空
              </button>
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <label style={{ fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <input type="checkbox" checked={drawMode} onChange={e => setDrawMode(e.target.checked)} />
                  自由绘制模式
                </label>
              </div>
            </div>
          )}

          <div className="zone-canvas-container">
            <canvas
              ref={canvasRef}
              width={800}
              height={600}
              onMouseDown={handleMouseDown}
              onMouseUp={handleMouseUp}
              style={{ width: '100%', height: 'auto', maxWidth: '800px' }}
            />
          </div>
        </div>

        {config.zoneMode === 'custom' && (
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h2 style={{ margin: 0 }}>自定义区域列表</h2>
              <button className="btn btn-primary" onClick={() => saveCustomZones()} style={{ padding: '6px 15px' }}>
                确认并保存所有 ID
              </button>
            </div>
            <div className="zone-list">
              {tempCustomZones.map((zone, index) => {
                const zoneState = zoneStates.find(([id]) => id === zone.id)?.[1];
                return (
                  <div
                    key={index}
                    className={`zone-item ${zoneState?.occupied ? 'occupied' : 'unoccupied'}`}
                    style={{ display: 'flex', alignItems: 'center', gap: '15px' }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <strong>区域: </strong>
                        <input
                          type="number"
                          value={zone.id}
                          onChange={(e) => handleZoneIdChange(index, e.target.value)}
                          style={{
                            width: '60px',
                            padding: '4px',
                            borderRadius: '4px',
                            border: '1px solid var(--border-color)',
                            background: 'var(--bg-primary)',
                            color: 'var(--text-primary)'
                          }}
                        />
                        <span> - {zoneState?.occupied ? '有人' : '无人'}</span>
                      </div>
                      <small style={{ color: 'var(--text-secondary)' }}>
                        X: {zone.x.toFixed(3)}, Y: {zone.y.toFixed(3)}, W: {zone.width.toFixed(3)}, H:{' '}
                        {zone.height.toFixed(3)}
                      </small>
                    </div>
                    <button
                      className="btn btn-secondary"
                      onClick={() => handleDeleteZone(zone.id)}
                      style={{ fontSize: '12px', padding: '5px 10px', color: '#dc3545' }}
                    >
                      删除
                    </button>
                  </div>
                );
              })}
              {tempCustomZones.length === 0 && (
                <div style={{ color: 'var(--text-secondary)' }}>暂无自定义区域，请点击上方预设或开启自由绘制。</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 右侧发送历史 */}
      <div className="card" style={{ position: 'sticky', top: '20px', margin: 0, height: 'calc(100vh - 100px)', display: 'flex', flexDirection: 'column' }}>
        <h2 style={{ marginBottom: '10px' }}>发送历史 (实时)</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px', fontSize: '13px' }}>
          <span className={`status-indicator ${status.tcpConnected ? 'connected' : 'disconnected'}`} />
          {status.tcpConnected ? 'TCP 已连接' : 'TCP 未连接'}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', paddingRight: '5px' }}>
          {sentFrames.slice().reverse().map((frame, index) => (
            <div
              key={`${frame.time}-${index}`}
              style={{
                marginBottom: '10px',
                padding: '10px',
                border: `1px solid ${frame.sent ? '#28a745' : '#dc3545'}`,
                borderRadius: '4px',
                backgroundColor: frame.sent ? 'rgba(40, 167, 69, 0.1)' : 'rgba(220, 53, 69, 0.1)',
                fontSize: '12px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <strong>Zone {frame.zoneId}</strong>
                <span style={{ color: 'var(--text-secondary)' }}>{new Date(frame.time).toLocaleTimeString()}</span>
              </div>
              <div style={{ marginBottom: '4px' }}>{frame.occupied ? '有人' : '无人'}</div>
              <code style={{ fontSize: '11px', display: 'block', background: 'rgba(0,0,0,0.2)', padding: '2px 4px', borderRadius: '2px' }}>
                {frame.frame}
              </code>
            </div>
          ))}
          {sentFrames.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--text-secondary)', marginTop: '20px' }}>
              暂无发送记录
            </div>
          )}
        </div>

        <div style={{ marginTop: '15px', paddingTop: '10px', borderTop: '1px solid var(--border-color)', fontSize: '13px' }}>
          <div>总计: <strong>{status.sendCount}</strong></div>
          <div style={{ color: '#28a745' }}>成功: <strong>{status.sendSuccessCount}</strong></div>
          <div style={{ color: '#dc3545' }}>失败: <strong>{status.sendFailCount}</strong></div>
        </div>
      </div>
    </div>
  );
}


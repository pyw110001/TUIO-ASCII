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

  useEffect(() => {
    if (wsData?.type === 'init') {
      setZones(wsData.data.zones || { grid: { cols: 1, rows: 4, zones: [] }, custom: [] });
      setCursors(wsData.data.cursors || []);
      setZoneStates(wsData.data.zoneStates || []);
      setConfig(wsData.data.config || { zoneMode: 'grid', gridCols: 1, gridRows: 4 });
    } else if (wsData?.type === 'zones') {
      setZones(wsData.data);
    } else if (wsData?.type === 'cursors') {
      setCursors(wsData.data);
    } else if (wsData?.type === 'zoneStates') {
      setZoneStates(wsData.data);
    } else if (wsData?.type === 'config') {
      setConfig(wsData.data);
    }
  }, [wsData]);

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
      if (config.zoneMode === 'grid') {
        const { cols, rows } = config;
        const zoneWidth = width / cols;
        const zoneHeight = height / rows;

        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            const zoneId = row * cols + col + 1;
            const x = col * zoneWidth;
            const y = row * zoneHeight;
            const zoneState = zoneStates.find(([id]) => id === zoneId)?.[1];

            ctx.strokeStyle = zoneState?.occupied ? '#28a745' : '#6c757d';
            ctx.lineWidth = 2;
            ctx.strokeRect(x, y, zoneWidth, zoneHeight);

            ctx.fillStyle = zoneState?.occupied ? 'rgba(40, 167, 69, 0.2)' : 'rgba(108, 117, 125, 0.1)';
            ctx.fillRect(x, y, zoneWidth, zoneHeight);

            ctx.fillStyle = '#333';
            ctx.font = '16px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(`Zone ${zoneId}`, x + zoneWidth / 2, y + zoneHeight / 2);
          }
        }
      } else {
        // 绘制自定义区域
        zones.custom.forEach((zone) => {
          const x = zone.x * width;
          const y = zone.y * height;
          const w = zone.width * width;
          const h = zone.height * height;
          const zoneState = zoneStates.find(([id]) => id === zone.id)?.[1];

          ctx.strokeStyle = zoneState?.occupied ? '#28a745' : '#6c757d';
          ctx.lineWidth = 2;
          ctx.strokeRect(x, y, w, h);

          ctx.fillStyle = zoneState?.occupied ? 'rgba(40, 167, 69, 0.2)' : 'rgba(108, 117, 125, 0.1)';
          ctx.fillRect(x, y, w, h);

          ctx.fillStyle = '#333';
          ctx.font = '14px Arial';
          ctx.textAlign = 'center';
          ctx.fillText(`Zone ${zone.id}`, x + w / 2, y + h / 2);
        });
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
  }, [zones, cursors, zoneStates, config, drawing, startPos]);

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
    if (config.zoneMode === 'custom') {
      const pos = getMousePos(e);
      setDrawing(true);
      setStartPos(pos);
    }
  };

  const handleMouseUp = async (e) => {
    if (drawing && startPos && config.zoneMode === 'custom') {
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

          const updatedZones = {
            ...zones,
            custom: [...zones.custom.filter((z) => z.id !== newZone.id), newZone],
          };

          try {
            await api.updateZones(updatedZones);
          } catch (error) {
            alert('保存失败: ' + error.message);
          }
        }
      }

      setDrawing(false);
      setStartPos(null);
    }
  };

  const handleDeleteZone = async (zoneId) => {
    if (confirm(`确定要删除区域 ${zoneId} 吗？`)) {
      const updatedZones = {
        ...zones,
        custom: zones.custom.filter((z) => z.id !== zoneId),
      };
      try {
        await api.updateZones(updatedZones);
      } catch (error) {
        alert('删除失败: ' + error.message);
      }
    }
  };

  return (
    <div>
      <div className="card">
        <h2>区域可视化编辑器</h2>
        <p style={{ marginBottom: '15px', color: 'var(--text-secondary)' }}>
          {config.zoneMode === 'grid'
            ? '当前使用屏幕分区模式，区域由配置页面的网格设置决定'
            : '在画布上拖拽绘制矩形区域，每个区域绑定一个区域号'}
        </p>

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
          <h2>自定义区域列表</h2>
          <div className="zone-list">
            {zones.custom.map((zone) => {
              const zoneState = zoneStates.find(([id]) => id === zone.id)?.[1];
              return (
                <div
                  key={zone.id}
                  className={`zone-item ${zoneState?.occupied ? 'occupied' : 'unoccupied'}`}
                >
                  <div>
                    <strong>区域 {zone.id}</strong> - {zoneState?.occupied ? '有人' : '无人'}
                    <br />
                    <small>
                      X: {zone.x.toFixed(3)}, Y: {zone.y.toFixed(3)}, W: {zone.width.toFixed(3)}, H:{' '}
                      {zone.height.toFixed(3)}
                    </small>
                  </div>
                  <button
                    className="btn btn-secondary"
                    onClick={() => handleDeleteZone(zone.id)}
                    style={{ fontSize: '12px', padding: '5px 10px' }}
                  >
                    删除
                  </button>
                </div>
              );
            })}
            {zones.custom.length === 0 && (
              <div style={{ color: 'var(--text-secondary)' }}>暂无自定义区域，请在画布上绘制</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export class ZoneManager {
  constructor(zonesConfig, appConfig) {
    this.zonesConfig = zonesConfig;
    this.appConfig = appConfig;
  }

  updateZoneStates(cursors) {
    const zoneStates = new Map();
    
    if (this.appConfig.zoneMode === 'grid') {
      this.updateGridZones(cursors, zoneStates);
    } else {
      this.updateCustomZones(cursors, zoneStates);
    }
    
    return zoneStates;
  }

  updateGridZones(cursors, zoneStates) {
    const { cols, rows } = this.zonesConfig.grid;
    const zoneWidth = 1 / cols;
    const zoneHeight = 1 / rows;
    
    // 初始化所有区域为无人
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const zoneId = row * cols + col + 1;
        if (!zoneStates.has(zoneId)) {
          zoneStates.set(zoneId, { occupied: false, lastChange: Date.now() });
        }
      }
    }
    
    // 检查每个 cursor 落在哪个区域
    for (const cursor of cursors.values()) {
      const col = Math.floor(cursor.x / zoneWidth);
      const row = Math.floor(cursor.y / zoneHeight);
      const zoneId = row * cols + col + 1;
      
      if (zoneId >= 1 && zoneId <= cols * rows) {
        const state = zoneStates.get(zoneId);
        if (!state.occupied) {
          state.occupied = true;
          state.lastChange = Date.now();
        }
      }
    }
  }

  updateCustomZones(cursors, zoneStates) {
    // 初始化所有自定义区域为无人
    for (const zone of this.zonesConfig.custom) {
      if (!zoneStates.has(zone.id)) {
        zoneStates.set(zone.id, { occupied: false, lastChange: Date.now() });
      }
    }
    
    // 检查每个 cursor 是否在自定义区域内
    for (const cursor of cursors.values()) {
      for (const zone of this.zonesConfig.custom) {
        if (this.isPointInRect(cursor.x, cursor.y, zone)) {
          const state = zoneStates.get(zone.id);
          if (!state.occupied) {
            state.occupied = true;
            state.lastChange = Date.now();
          }
          break; // 一个 cursor 只属于一个区域
        }
      }
    }
  }

  isPointInRect(x, y, rect) {
    return x >= rect.x && x <= rect.x + rect.width &&
           y >= rect.y && y <= rect.y + rect.height;
  }

  updateConfig(zonesConfig, appConfig) {
    this.zonesConfig = zonesConfig;
    this.appConfig = appConfig;
  }
}


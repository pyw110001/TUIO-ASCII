import express from 'express';
import { saveZones } from '../config-manager.js';

export function zoneRouter(state, zoneManager, broadcast) {
  const router = express.Router();
  
  router.get('/', (req, res) => {
    res.json(state.zones);
  });
  
  router.post('/', (req, res) => {
    const { grid, custom } = req.body;
    
    if (grid) {
      state.zones.grid = grid;
    }
    if (custom) {
      state.zones.custom = custom;
    }
    
    // 保存区域配置到文件
    const saveSuccess = saveZones(state.zones);
    if (!saveSuccess) {
      console.warn('[警告] 区域配置保存到文件失败，但已更新内存中的配置');
    }
    
    zoneManager.updateConfig(state.zones, state.config);
    broadcast({ type: 'zones', data: state.zones });
    
    res.json({ 
      success: true, 
      zones: state.zones,
      saved: saveSuccess 
    });
  });
  
  return router;
}


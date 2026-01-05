import express from 'express';

export function configRouter(state, broadcast, tuioProcessor, tcpSender, zoneManager) {
  const router = express.Router();
  
  router.get('/', (req, res) => {
    res.json(state.config);
  });
  
  router.post('/', (req, res) => {
    const newConfig = req.body;
    const oldConfig = { ...state.config };
    Object.assign(state.config, newConfig);
    
    // 更新相关组件
    if (newConfig.udpPort !== undefined && newConfig.udpPort !== oldConfig.udpPort) {
      tuioProcessor.updatePort(newConfig.udpPort);
    }
    
    if (newConfig.tcpMode !== undefined || newConfig.tcpHost !== undefined || newConfig.tcpPort !== undefined) {
      tcpSender.updateConfig(
        state.config.tcpMode,
        state.config.tcpHost,
        state.config.tcpPort
      );
    }
    
    if (newConfig.zoneMode !== undefined || newConfig.gridCols !== undefined || newConfig.gridRows !== undefined) {
      zoneManager.updateConfig(state.zones, state.config);
    }
    
    // 通知前端
    broadcast({ type: 'config', data: state.config });
    
    res.json({ success: true, config: state.config });
  });
  
  return router;
}


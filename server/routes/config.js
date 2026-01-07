import express from 'express';
import { saveConfig } from '../config-manager.js';

export function configRouter(state, broadcast, tuioProcessor, tcpSender, zoneManager) {
  const router = express.Router();
  
  router.get('/', (req, res) => {
    res.json(state.config);
  });
  
  router.post('/', (req, res) => {
    const newConfig = req.body;
    const oldConfig = { ...state.config };
    
    console.log('收到配置更新请求:', newConfig);
    console.log('当前配置:', oldConfig);
    
    // 合并配置
    Object.assign(state.config, newConfig);
    
    console.log('更新后配置:', state.config);
    
    // 保存配置到文件
    const saveSuccess = saveConfig(state.config);
    if (!saveSuccess) {
      console.warn('[警告] 配置保存到文件失败，但已更新内存中的配置');
    }
    
    // 更新相关组件
    if (newConfig.udpPort !== undefined && newConfig.udpPort !== oldConfig.udpPort) {
      console.log('更新UDP端口:', newConfig.udpPort);
      tuioProcessor.updatePort(newConfig.udpPort);
    }
    
    if (newConfig.tcpMode !== undefined || newConfig.tcpHost !== undefined || newConfig.tcpPort !== undefined) {
      console.log('更新TCP配置:', {
        mode: state.config.tcpMode,
        host: state.config.tcpHost,
        port: state.config.tcpPort
      });
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
    
    res.json({ 
      success: true, 
      config: state.config,
      saved: saveSuccess 
    });
  });
  
  return router;
}


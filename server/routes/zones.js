import express from 'express';

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
    
    zoneManager.updateConfig(state.zones, state.config);
    broadcast({ type: 'zones', data: state.zones });
    
    res.json({ success: true, zones: state.zones });
  });
  
  return router;
}


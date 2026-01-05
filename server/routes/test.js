import express from 'express';

export function testRouter(state, protocolEncoder, tcpSender, broadcast) {
  const router = express.Router();
  
  router.post('/send', (req, res) => {
    const { zoneId, occupied } = req.body;
    
    if (!zoneId || typeof occupied !== 'boolean') {
      return res.status(400).json({ error: 'Invalid parameters' });
    }
    
    const frame = protocolEncoder.encode(zoneId, occupied);
    
    if (tcpSender.send(frame)) {
      state.sendCount++;
      state.lastSentFrame = {
        zoneId,
        occupied,
        frame: Array.from(frame).map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' '),
        time: Date.now()
      };
      
      broadcast({ type: 'frameSent', data: state.lastSentFrame });
      
      res.json({ 
        success: true, 
        frame: state.lastSentFrame.frame,
        hex: state.lastSentFrame.frame
      });
    } else {
      res.status(500).json({ error: 'Failed to send frame' });
    }
  });
  
  return router;
}


const API_BASE = '/api';

export function useAPI() {
  const get = async (endpoint) => {
    const response = await fetch(`${API_BASE}${endpoint}`);
    return response.json();
  };

  const post = async (endpoint, data) => {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    return response.json();
  };

  return {
    getConfig: () => get('/config'),
    updateConfig: (config) => post('/config', config),
    getZones: () => get('/zones'),
    updateZones: (zones) => post('/zones', zones),
    getStatus: () => get('/status'),
    testSend: (zoneId, occupied) => post('/test/send', { zoneId, occupied }),
  };
}

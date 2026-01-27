import React, { useState, useEffect } from 'react';
import ConfigPage from './pages/ConfigPage';
import MonitorPage from './pages/MonitorPage';
import ZoneEditorPage from './pages/ZoneEditorPage';
import { useWebSocket } from './hooks/useWebSocket';
import { useAPI } from './hooks/useAPI';

function App() {
  const [activeTab, setActiveTab] = useState('config');
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    return saved ? JSON.parse(saved) : false;
  });
  const { wsData, sendMessage } = useWebSocket('ws://localhost:3001');
  const api = useAPI();

  useEffect(() => {
    localStorage.setItem('darkMode', JSON.stringify(darkMode));
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  return (
    <div className="container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 className="app-title">
          TUIO to TCP Protocol Converter
        </h1>
        <button
          className="theme-toggle"
          onClick={() => setDarkMode(!darkMode)}
          title={darkMode ? '切换到亮色模式' : '切换到暗色模式'}
        >
          {darkMode ? '☀️' : '🌙'}
        </button>
      </div>
      
      <div className="tabs">
        <button
          className={`tab ${activeTab === 'config' ? 'active' : ''}`}
          onClick={() => setActiveTab('config')}
        >
          配置
        </button>
        <button
          className={`tab ${activeTab === 'monitor' ? 'active' : ''}`}
          onClick={() => setActiveTab('monitor')}
        >
          监控
        </button>
        <button
          className={`tab ${activeTab === 'zones' ? 'active' : ''}`}
          onClick={() => setActiveTab('zones')}
        >
          区域编辑
        </button>
      </div>

      {activeTab === 'config' && <ConfigPage api={api} wsData={wsData} />}
      {activeTab === 'monitor' && <MonitorPage api={api} wsData={wsData} />}
      {activeTab === 'zones' && <ZoneEditorPage api={api} wsData={wsData} />}
    </div>
  );
}

export default App;

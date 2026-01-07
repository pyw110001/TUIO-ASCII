import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_FILE = path.join(__dirname, '..', 'config.json');
const ZONES_FILE = path.join(__dirname, '..', 'zones.json');

// 默认配置
const DEFAULT_CONFIG = {
  udpPort: 3333,
  tcpMode: 'client', // 'client' or 'server'
  tcpHost: '127.0.0.1',
  tcpPort: 8080,
  cursorTimeout: 300,
  sendStrategy: 'onChange', // 'onChange' or 'heartbeat'
  heartbeatInterval: 1000,
  zoneMode: 'grid', // 'grid' or 'custom'
  gridCols: 1,
  gridRows: 4
};

/**
 * 加载配置文件
 * @returns {Object} 配置对象
 */
export function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, 'utf8');
      const config = JSON.parse(data);
      console.log('[配置] 从文件加载配置:', CONFIG_FILE);
      // 合并默认配置，确保所有字段都存在
      return { ...DEFAULT_CONFIG, ...config };
    } else {
      console.log('[配置] 配置文件不存在，使用默认配置');
      return { ...DEFAULT_CONFIG };
    }
  } catch (error) {
    console.error('[配置] 加载配置文件失败:', error.message);
    console.log('[配置] 使用默认配置');
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * 保存配置文件
 * @param {Object} config - 配置对象
 * @returns {boolean} 是否保存成功
 */
export function saveConfig(config) {
  try {
    // 确保配置完整（合并默认值）
    const fullConfig = { ...DEFAULT_CONFIG, ...config };
    const data = JSON.stringify(fullConfig, null, 2);
    fs.writeFileSync(CONFIG_FILE, data, 'utf8');
    console.log('[配置] 配置已保存到文件:', CONFIG_FILE);
    console.log('[配置] 保存的配置:', fullConfig);
    return true;
  } catch (error) {
    console.error('[配置] 保存配置文件失败:', error.message);
    return false;
  }
}

// 默认区域配置
const DEFAULT_ZONES = {
  grid: { cols: 1, rows: 4, zones: [] },
  custom: []
};

/**
 * 加载区域配置文件
 * @returns {Object} 区域配置对象
 */
export function loadZones() {
  try {
    if (fs.existsSync(ZONES_FILE)) {
      const data = fs.readFileSync(ZONES_FILE, 'utf8');
      const zones = JSON.parse(data);
      console.log('[配置] 从文件加载区域配置:', ZONES_FILE);
      // 合并默认配置，确保所有字段都存在
      return { ...DEFAULT_ZONES, ...zones };
    } else {
      console.log('[配置] 区域配置文件不存在，使用默认配置');
      return { ...DEFAULT_ZONES };
    }
  } catch (error) {
    console.error('[配置] 加载区域配置文件失败:', error.message);
    console.log('[配置] 使用默认区域配置');
    return { ...DEFAULT_ZONES };
  }
}

/**
 * 保存区域配置文件
 * @param {Object} zones - 区域配置对象
 * @returns {boolean} 是否保存成功
 */
export function saveZones(zones) {
  try {
    // 确保配置完整（合并默认值）
    const fullZones = { ...DEFAULT_ZONES, ...zones };
    const data = JSON.stringify(fullZones, null, 2);
    fs.writeFileSync(ZONES_FILE, data, 'utf8');
    console.log('[配置] 区域配置已保存到文件:', ZONES_FILE);
    return true;
  } catch (error) {
    console.error('[配置] 保存区域配置文件失败:', error.message);
    return false;
  }
}


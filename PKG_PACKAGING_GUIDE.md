# Node.js 项目打包与二进制封装指南 (pkg + esbuild)

本指南总结了在 `BAITR_LEDSYSTEM` 项目中将 ESM 项目封装为 `.exe` 二进制文件时遇到的核心问题及解决方案，旨在为后续项目提供避坑参考。

---

## 1. 核心挑战：ESM 与 CJS 的兼容性

### 问题描述
`pkg` 对原生 ESM (`import/export`) 的支持仍不完善，直接打包 ESM 入口常会导致 `ERR_REQUIRE_ESM` 或 `Invalid host defined options` 错误。

### 解决方案：使用 esbuild 预打包
不要让 `pkg` 直接处理多个 ESM 文件。先使用 `esbuild` 将后端代码及其依赖打包成一个单一的 CommonJS (`.cjs`) 文件。

**推荐配置 (package.json):**
```bash
npx esbuild start.js --bundle --platform=node --format=cjs --outfile=backend.cjs --external:pkg
```

---

## 2. 路径解析的“万能”模板

### 问题描述
在二进制环境下，`__dirname` 指向虚拟快照路径 (`C:\snapshot\...`)，而 `import.meta.url` 在 CJS 格式中不可用。如果不做兼容，程序在本地运行或打包运行必有一个会崩溃。

### 解决方案：Robust Root 模板
在所有涉及文件读取的模块（如静态服务器、日志记录）顶部使用以下代码：

```javascript
import path from 'path';
import { fileURLToPath } from 'url';

// 兼容 ESM 和 CJS (用于 pkg 快照路径解析)
let _rootValue;
try {
  _rootValue = __dirname; // CJS 环境
} catch (e) {
  // ESM 环境 (本地运行)
  _rootValue = path.dirname(fileURLToPath(import.meta.url));
}

const PROJECT_ROOT = _rootValue;
```

> [!IMPORTANT]
> 始终使用 `PROJECT_ROOT` 作为所有 `path.join` 的基准路径，避免使用相对路径。

---

## 3. 静态资源组织：`public` 目录策略

### 问题描述
`pkg` 的虚拟文件系统有时会因为根目录过于杂乱而导致资产定位失效（如 404 错误）。

### 最佳实践
1.  **统一存放**：将所有 HTML, JS, CSS 移入名为 `public` 的子文件夹。
2.  **配置 pkg.assets**：在 `package.json` 中使用通配符包含：
    ```json
    "pkg": {
      "assets": ["public/**/*", "backend.cjs"]
    }
  ```
3.  **静态服务器对齐**：修改静态服务器逻辑，使其默认从 `path.join(PROJECT_ROOT, 'public')` 取值。

---

## 4. 端口与进程管理

### 问题描述
在开发和频繁构建过程中，Node.js 进程或未关闭的 TCP 连接常导致 `EADDRINUSE` 错误，阻止新版本启动。

### 给开发者的建议
1.  **前置清理脚本**：在 `package.json` 的 build 或 start 命令前加入强力清理命令：
    ```powershell
    # Windows 示例
    taskkill /F /IM TuioBridge_Final.exe /T; Get-NetTCPConnection -LocalPort 8001, 8080 | Stop-Process
    ```
2.  **主动资源释放**：在代码中实现 `process.on('SIGINT', ...)` 监听，确保在退出时调用 `server.close()`。

---

## 5. 常见错误速查表

| 错误表现 | 原因 | 解决方法 |
| :--- | :--- | :--- |
| **ReferenceError: __dirname is not defined** | 在项目开启了 `"type": "module"` 的情况下直接使用了 `__dirname` | 使用上文提及的 `try-catch` 模板或 `import.meta.url` 转换 |
| **404 Not Found (Binary Only)** | 资源未正确包含在 `pkg.assets` 或路径映射未考虑 `snapshot` 结构 | 检查 `package.json` 的 `assets` 字段，并确保路径以 `PROJECT_ROOT` 开头 |
| **SyntaxError: import.meta is not available** | 使用 esbuild 转 CJS 时未移除 ESM 特有语法 | 在 esbuild 转换后通过逻辑保护，或直接转为 CJS 后再处理路径 |
| **Animation/Vite build 找不到文件** | 构建输出目录 (`outDir`) 在重构后未对齐 | 确保 Vite 编译结果输出到 `public/` 内部的子目录 |

---

## 6. 最终交付标准检核 (Checklist)
- [ ] 后端已通过 `esbuild` 归一化为 `.cjs`？
- [ ] 所有 `fs` 操作是否基于 `PROJECT_ROOT`？
- [ ] 所有的前端脚本（`.js`）在 HTML 中是否使用相对路径（如 `<script src="app.js">`）？
- [ ] `package.json` 中的 `bin` 和 `main` 是否指向了捆绑后的入口文件？
- [ ] 本地 `pnpm start` 与打包后的 `.exe` 是否都能正常握手 WebSocket？

---
*总结：打包成功的关键在于 **“路径确定性”** 和 **“依赖归一化”**。*

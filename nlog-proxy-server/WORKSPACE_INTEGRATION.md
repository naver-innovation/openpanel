# 🔗 Workspace 集成说明

`nlog-proxy-server` 已经完全集成到 OpenPanel monorepo 中！

## ✅ 已完成的集成

### 1. **Workspace 配置**

已添加到 `pnpm-workspace.yaml`:

```yaml
packages:
  - "apps/*"
  - "packages/**"
  - "tooling/*"
  - "nlog-proxy-server"  # ← 新增
```

### 2. **包配置更新**

`nlog-proxy-server/package.json`:

```json
{
  "name": "@openpanel/nlog-proxy",  // monorepo 命名规范
  "private": true,                   // workspace 包标记
  "packageManager": "pnpm@10.6.2"    // 与项目统一
}
```

### 3. **根目录命令**

已在根目录 `package.json` 添加快捷命令:

```json
{
  "scripts": {
    "dev:proxy": "pnpm --filter @openpanel/nlog-proxy run dev",
    "start:proxy": "pnpm --filter @openpanel/nlog-proxy run start"
  }
}
```

---

## 🚀 使用方式

### 方式 1: 从根目录运行（推荐）

```bash
# 在 OpenPanel 项目根目录

# 1. 安装所有依赖（一次性）
pnpm install

# 2. 启动 proxy 服务器（开发模式，支持热重载）
pnpm dev:proxy

# 或生产模式
pnpm start:proxy
```

### 方式 2: 进入目录运行

```bash
# 1. 安装依赖
cd nlog-proxy-server
pnpm install

# 2. 启动服务器
pnpm start
```

---

## 🎯 优势对比

| 特性 | 独立项目模式 | Workspace 集成模式 |
|------|-------------|-------------------|
| **依赖安装** | 需要单独运行 `npm install` | 根目录 `pnpm install` 统一安装 |
| **包管理器** | npm | pnpm (与项目统一) |
| **依赖共享** | ❌ 独立 node_modules | ✅ 共享 monorepo 依赖 |
| **版本管理** | 独立管理 | 与 OpenPanel 统一 |
| **启动方式** | 必须进入目录 | 可从根目录使用 `pnpm dev:proxy` |
| **开发体验** | 需要多个终端窗口 | 统一工作流 |
| **CI/CD** | 需要单独配置 | 复用项目配置 |

---

## 📁 目录结构

```
openpanel/
├── apps/
│   ├── api/           # OpenPanel API (3000)
│   ├── worker/        # Worker
│   └── start/         # Dashboard
├── packages/
│   └── ...
├── nlog-proxy-server/ # ← Nlog Proxy Server (3002)
│   ├── server.js
│   ├── package.json   # @openpanel/nlog-proxy
│   └── .env
├── pnpm-workspace.yaml
└── package.json       # 包含 dev:proxy, start:proxy 命令
```

---

## 🔧 配置文件

### `.env` (在 nlog-proxy-server 目录内)

```env
# OpenPanel API 配置
OPENPANEL_API_URL=http://localhost:3000
PORT=3002

# OpenPanel 认证信息
OPENPANEL_CLIENT_ID=your_client_id_here
OPENPANEL_CLIENT_SECRET=your_client_secret_here
```

---

## 📊 端口分配

| 服务 | 端口 | 命令 |
|------|------|------|
| OpenPanel API | 3000 | `pnpm dev:api` |
| OpenPanel API (测试) | 3333 | `pnpm --filter api testing` |
| **Nlog Proxy** | **3002** | `pnpm dev:proxy` |
| Dashboard | 3001 | `pnpm dev:start` |

---

## 🛠️ 开发工作流

### 同时运行多个服务

```bash
# 终端 1: OpenPanel API
pnpm dev:api

# 终端 2: Nlog Proxy
pnpm dev:proxy

# 终端 3: Dashboard (可选)
pnpm dev:start
```

### 使用 pnpm 并行运行

```bash
# 创建自定义脚本（可选）
# 在根 package.json 添加:
{
  "scripts": {
    "dev:all": "pnpm -r --parallel dev"
  }
}
```

---

## 🔄 迁移说明

如果你之前使用独立模式，现在迁移到 workspace:

1. **删除旧的 node_modules**:
   ```bash
   rm -rf nlog-proxy-server/node_modules
   rm -f nlog-proxy-server/package-lock.json
   ```

2. **在根目录重新安装**:
   ```bash
   pnpm install
   ```

3. **使用新命令启动**:
   ```bash
   pnpm dev:proxy
   ```

---

## ❓ 常见问题

### Q: 为什么使用 pnpm workspace?

A: 
- ✅ 节省磁盘空间（共享依赖）
- ✅ 统一包管理
- ✅ 更快的安装速度
- ✅ 更好的 monorepo 支持

### Q: 可以单独开发 nlog-proxy-server 吗?

A: 可以！进入 `nlog-proxy-server` 目录，使用 `pnpm start` 即可。但推荐使用根目录命令以获得更好的集成体验。

### Q: 如何更新 nlog-proxy-server 的依赖?

A: 
```bash
# 方式 1: 更新所有 workspace 依赖
pnpm update

# 方式 2: 只更新 nlog-proxy-server
pnpm --filter @openpanel/nlog-proxy update
```

---

## 📚 相关文档

- [README.md](./README.md) - 完整使用说明
- [QUICKSTART.md](./QUICKSTART.md) - 快速上手
- [COMMANDS.md](./COMMANDS.md) - 命令参考
- [NLOG_TO_OPENPANEL_IMPLEMENTATION.md](../NLOG_TO_OPENPANEL_IMPLEMENTATION.md) - Nlog 转换方案

---

**版本**: 1.0.0  
**更新日期**: 2025-11-12  
**状态**: ✅ 已完成集成


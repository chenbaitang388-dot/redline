# 赤刃 · 重铸（REDLINE）

一个使用 HTML、JavaScript 和 Canvas 实现的单机动作游戏项目。当前展示版本为 **v3 实验版**，更新于 2026 年 10 月 11 日。

**REDLINE: Reforged** is a single-player action game built with HTML, JavaScript, and Canvas. The current experimental v3 release features 24 campaign stages, 10 difficulty levels, and three objective types: defend a point, interrupt a ritual, and survive moving hazard zones. Version 3 adds continuous enemy reinforcement during outpost defense; reinforcement stops and the spawn queue clears when the defense timer expires.

To play, download this repository and open `index.html` in a desktop browser. Move with WASD, aim with the mouse, use the left/right mouse buttons for light/heavy attacks, Shift to dash, and Esc to pause. AI-assisted development; full manual campaign completion and final balance validation are still pending.

## 游戏内容

- 24 关主线，分为 6 章；每章第 4 关为 Boss 战。
- 10 档难度，可在开始界面选择。
- 据点守卫、打断仪式、移动危险区限时生存三类关卡目标。
- 轻重攻击、连击、冲刺与关间升级。
- v3 新增据点守卫持续补刷：约每游戏秒检查一次补刷，补刷目标上限为 4，每批最多 3；守卫计时结束后停止补刷并清空刷怪队列。

## 如何试玩

下载仓库后，用桌面浏览器打开 `index.html`。网页包含运行所需的代码，不需要安装 npm 依赖。

仓库也准备了 GitHub Pages 入口。上传后，在仓库 **Settings → Pages** 中选择 **Deploy from a branch → main → / (root)** 并保存，即可获得网页链接。

## 基本操作

| 操作 | 按键 |
| --- | --- |
| 移动 | W / A / S / D |
| 瞄准 | 鼠标 |
| 轻击 / 重击 | 鼠标左键 / 右键 |
| 冲刺 | Shift |
| 暂停 | Esc |

第三版说明见 [v3 操作说明](docs/controls-v3.md)，基础操作与主线规则见 [M3 操作说明](docs/controls-m3.md)。

## 文件说明

- `index.html`：当前发布页面，同时包含游戏源代码。
- `game-v1.1.html`：构建所需的历史基线。
- `src/`：v3 构建器与基础平衡、主线目标及守卫补刷补丁。
- `host/GameHost.cs`：Windows WebView2 宿主源代码，仅作开发参考；网页试玩无需此文件。
- `docs/`：操作与版本说明。

## 重新构建

安装 Node.js 后，在仓库目录执行：

```sh
npm run build
```

构建会应用基础平衡和 v3 主线目标补丁，生成 `game-v3.html` 并更新 `index.html`。不要直接修改历史基线，否则构建器的哈希校验会拒绝构建。

## 当前状态

本版仍在完善手感与平衡。原交付记录中的原生自检、解锁测试及解锁恢复测试通过；尚未完成人工完整通关。Windows 宿主中的存档及解锁行为与普通浏览器可能不同。

本项目使用 AI 辅助开发。

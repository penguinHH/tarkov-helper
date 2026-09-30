# Tarkov Helper

**简体中文** | [English](README.en.md) | [日本語](README.ja.md)

逃离塔科夫（Escape from Tarkov）桌面助手：互动地图、物品价格、任务查询、BTR 路线预测。基于 Electron + Vue 3 + Leaflet，游戏数据来自 [tarkov.dev](https://tarkov.dev) 的开放数据。

## 下载

在 [Releases](https://github.com/penguinHH/tarkov-helper/releases/latest) 下载最新版本：

- `TarkovHelper-Setup-*.exe`：安装版（可选择安装目录，创建桌面快捷方式，自带卸载）
- `TarkovHelper-Portable-*.exe`：便携版，双击即用，无需安装

> 程序没有代码签名，首次运行时 Windows SmartScreen 可能提示「已保护你的电脑」，点「更多信息 → 仍要运行」即可。程序需要联网获取数据。

## 功能

- **仪表盘**：游戏内时间（左/右）、商人刷新倒计时、三狗（Goons）最近上报位置
- **互动地图**（内容对齐 tarkov.dev）
  - 撤离点（PMC / 共用 / Scav，悬停显示撤离区域，开关条件、所需物品）、转移点
  - 出生点：Boss（含刷新概率和头像）、PMC、Scav、狙击 Scav
  - 任务：任务物品可能位置、任务目标区域；已接任务单独成层并高亮
  - 地标：地名、BTR 停靠点
  - 可交互：带锁的门/容器（显示所需钥匙、是否需通电）、开关（联动关系）、固定武器
  - 危险区域：雷区、狙击手区域、迫击炮区域（带范围轮廓）
  - 全部可搜刮容器（按类型）、散落物资（按物品分类，显示物品图标）
  - 楼层切换（不在当前楼层的标记变暗，点击自动切层）、矢量/卫星底图、搜索、鼠标坐标
- **物品价格**：跳蚤市场最低价 / 24h 均价 / 48h 涨跌、单格价值、各商人收购价与出售价（含等级、限购）、出售建议、价格走势图（7/30/90 天/全部，可切换表格）、收藏
- **任务**：按名称/目标搜索，按商人、地图、进度、Kappa 筛选；详情页包含目标、所需钥匙、奖励、前置/后续任务，以及来自 EFT Wiki 的任务对话、目标、奖励与攻略（英文原文）
- **任务进度**：读取游戏日志自动识别任务接取/完成/失败（扫描全部历史日志，按服务器分别记录），也可手动标记；可从任务详情一键跳到地图定位
- **BTR 路线预测**（森林、街区）：战局计时（自动读取开局时间，或手动输入剩余时间），看到 BTR 到站/离站时一键校准，推算当前位置与各站预计到站时间；连续两站校准会自动学习该段行驶时间、识别行驶方向。结果为估算
- **截图定位**：在游戏里截图后，自动在地图上标出自己的位置和朝向
- **战局识别**：读取游戏日志识别当前地图、服务器与开局时间，自动切换
- **三种服务器**：PVP / PVE / 赛季服，可按游戏日志自动切换
- **多语言**：简体中文 / English / 日本語，首次启动按系统语言自动选择；游戏数据使用 tarkov.dev 对应语言的翻译
- 数据源不可用时自动使用上一次的缓存

## 安全说明

- 只读取游戏截图的文件名和日志文本，**不读取游戏内存，也不修改游戏文件**。
- 地图底图、坐标元数据与游戏数据均在运行时从 tarkov.dev 获取，没有打包进本项目。
- Wiki 内容按标签白名单重建后显示，不直接嵌入原网页。

## 开发

需要 [Node.js](https://nodejs.org) 20 以上版本。PowerShell 禁止运行脚本时，把 `npm` 换成 `npm.cmd`。

```bash
npm install
npm run dev      # 开发模式
npm run dist     # 打包，输出到 dist/：安装版与便携版 exe
```

### 目录结构

```
src/main/         Electron 主进程：窗口、设置、截图/日志监听、任务进度
src/preload/      安全桥接（window.desktop）
src/renderer/     Vue 界面
  src/api/          tarkov.dev 数据、地图元数据、Wiki（带缓存）
  src/map/          坐标换算、楼层判断、图层构建、BTR 模型、图标
  src/components/   图层面板、BTR 面板、价格图表
  src/i18n/         界面语言文件（zh / en / ja）
  src/views/        仪表盘 / 互动地图 / 物品价格 / 任务 / 任务详情 / 设置
```

### 打包注意事项

首次打包时 electron-builder 需要解压签名工具包 winCodeSign，其中两个 macOS 符号链接在未开启「开发者模式」的 Windows 上会解压失败。可以手动解压到缓存目录（Windows 打包用不到那两个文件）：

```
7za x -y %LOCALAPPDATA%\electron-builder\Cache\winCodeSign\<数字>.7z -o%LOCALAPPDATA%\electron-builder\Cache\winCodeSign\winCodeSign-2.6.0
```

## 许可证

本项目代码采用 [MIT 许可证](LICENSE)。使用的第三方代码、开源库与数据见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)；其中运行时加载的矢量地图为 CC BY-NC-SA 4.0，**禁止商用**。

本项目为非官方社区工具，与 Battlestate Games 无关。《逃离塔科夫》的游戏名称、图片与内容版权归 Battlestate Games 所有。

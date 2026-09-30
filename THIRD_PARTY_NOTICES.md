# 第三方许可与致谢（Third-Party Notices）

Tarkov Helper 是非官方的社区工具，与 Battlestate Games 无关。《逃离塔科夫》（Escape from Tarkov）的游戏名称、图片与内容版权归 Battlestate Games 所有。

本文件列出本项目使用或参考的第三方代码、开源库与数据来源，以及它们的许可证。

---

## 一、移植自其他项目的代码

以下源文件包含移植或改写自其他开源项目的代码，按其许可证要求附上原版权声明与许可证全文。

### tarkov.dev

- 项目：https://github.com/the-hideout/tarkov-dev
- 许可证：MIT
- 使用位置：
  - `src/renderer/src/map/crs.js` —— 游戏坐标与地图坐标的换算（`getCRS`、`applyRotation`、`pos`、`getBounds`、`getScaledBounds`）
  - `src/renderer/src/map/levels.js` —— 标记所在楼层的判断规则
  - `src/renderer/src/views/MapView.vue` —— SVG 底图按楼层分组显示的做法
  - `src/renderer/src/map/layers.js` —— 出生点分类规则与撤离点配色

```text
MIT License

Copyright (c) 2019 Oskar Risberg

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### tarkov-time

- 项目：https://github.com/adamburgess/tarkov-time
- 许可证：MIT
- 使用位置：`src/renderer/src/utils/tarkovTime.js` —— 游戏内时间换算公式（现实时间 × 7，基准 UTC+3）

```text
Copyright 2020 Adam Burgess

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

---

## 二、打包进程序的开源库

构建时以下库会被打包进程序。

### Vue

- https://github.com/vuejs/core
- 许可证：MIT

```text
The MIT License (MIT)

Copyright (c) 2018-present, Yuxi (Evan) You

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

### Vue Router

- https://github.com/vuejs/router
- 许可证：MIT

```text
The MIT License (MIT)

Copyright (c) 2019-present Eduardo San Martin Morote

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### Leaflet

- https://github.com/Leaflet/Leaflet
- 许可证：BSD 2-Clause

```text
BSD 2-Clause License

Copyright (c) 2010-2023, Volodymyr Agafonkin
Copyright (c) 2010-2011, CloudMade
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

### Electron

- https://github.com/electron/electron
- 许可证：MIT；Electron 内含 Chromium 等组件，其许可证由打包工具随程序一同分发（安装目录下的 `LICENSE.electron.txt` 与 `LICENSES.chromium.html`）。

---

## 三、参考资料（未复制代码）

### TarkovMonitor

- 项目：https://github.com/the-hideout/TarkovMonitor
- 许可证：GPL-3.0
- 参考内容：游戏日志的格式（日志行格式、`TRACE-NetworkGameCreate`、`GameStarting` / `GameStarted`、`Session mode`、`notifications` 日志中任务消息类型 10/11/12 的含义）以及游戏截图文件名中的坐标格式。
- 说明：本项目未复制 TarkovMonitor 的源代码（原项目为 C#），仅参考其记录的日志格式，相关逻辑在 `src/main/watchers.js`、`src/main/tasks.js` 中以 JavaScript 独立实现。

### 枫织梦境

- 网站：https://member.kaedeori.com/
- 参考内容：功能设计思路（仪表盘、互动地图、物价、任务、BTR 预测等功能构成）。
- 说明：未使用其任何代码、数据或素材。

---

## 四、运行时获取的数据与素材

以下内容在程序运行时从网络获取，不包含在本项目的源代码或安装包中。

| 内容 | 来源 | 许可 / 条款 |
|---|---|---|
| 物品、价格、任务、商人、地图标记等游戏数据 | [tarkov.dev](https://tarkov.dev)（json.tarkov.dev） | tarkov.dev 社区免费开放的数据；数据归各贡献者及 Battlestate Games 所有 |
| 地图坐标元数据（`maps.json`）与楼层名称翻译 | [tarkov.dev 仓库](https://github.com/the-hideout/tarkov-dev) | MIT |
| 矢量（SVG）地图 | [tarkov-dev-svg-maps](https://github.com/the-hideout/tarkov-dev-svg-maps)，作者 Shebuka 等 | **CC BY-NC-SA 4.0（禁止商用）** |
| 卫星 / 瓦片地图与物品图片 | assets.tarkov.dev | 地图作者见各地图署名；游戏图片版权归 Battlestate Games |
| 任务介绍（对话、目标、奖励、攻略） | [Escape from Tarkov Wiki](https://escapefromtarkov.fandom.com)（Fandom） | CC BY-SA 3.0 |

> 注意：矢量地图采用 CC BY-NC-SA 4.0 许可，**不得用于商业用途**。如果以收费等商业方式分发本程序，需要移除或替换矢量地图的加载（改用其他许可的底图）。

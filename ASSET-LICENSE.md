# ASSET LICENSE / 资产来源与许可

本文件说明发布包 `dsh-dafeiyu-counter-0.1.2` 中实际包含的美术资产、复用关系与 AI 重绘情况。

## 运行时资产清单

| 文件 | 包含 | 来源与处理 |
|---|---|---|
| `lib/assets/char/states_v3/state_idle.webp` | 是 | 原始基础角色图复用 + V3 统一调色 |
| `lib/assets/char/states_v3/state_thinking.webp` | 是 | AI 重绘：从本项目自己的思考姿势/基础参考图生成；V3 调色 |
| `.../state_tool.webp` | 是 | AI 重绘：从数据板姿势参考图生成；V3 调色 |
| `.../state_approval.webp` | 是 | AI 重绘：从基础站姿参考图生成；V3 调色 |
| `.../state_error.webp` | 是 | AI 重绘：从基础站姿参考图生成；V3 调色 |
| `.../state_laugh.webp` | 是 | AI 重绘：从击掌姿势参考图生成；V3 调色 |
| `.../state_sweat.webp` | 是 | AI 重绘：从思考姿势参考图生成；V3 调色 |
| `.../state_sad.webp` | 是 | AI 重绘：从思考姿势参考图生成；V3 调色 |
| `.../state_surprised.webp` | 是 | AI 重绘：从思考姿势参考图生成；V3 调色 |
| `.../state_clap_done.webp` | 是 | AI 重绘：从击掌姿势参考图生成；V3 调色 |
| `lib/assets/wall_*.webp`、`sign_*.webp`、`table_*.webp` | 是 | 本项目生成/复用的场景资产 |
| `lib/assets/props/*.webp` | 是 | 本项目生成/复用的单个小物 sprite |
| `icon.png` | 是 | 角色图裁切 |
| `lib/assets/char/layered/`、`layered_v2/`、`reactions/`、`states_v2/`、旧动作帧 | 否 | 旧资产，不进入发布包 |

## 复用 + AI 重绘

- **复用**：角色身份/设计、场景布局、状态牌/桌板/小物、图标裁切，以及原始基础角色图；这些是本项目已有的美术资产。
- **AI 重绘**：9 个非 idle 状态（thinking/tool/approval/error/laugh/sweat/sad/surprised/clap_done）使用 Seedream/Ark 图生图，从本项目自己的基础/姿势参考图生成；生成结果只保留整图角色，经统一 V3 调色和蓝度归一。
- **不包含**：旧的分层素材、旧反应图、旧状态图、旧动作帧、生成脚本、提示词记录和密钥文件。

## 上游素材许可

角色原始动作素材来自 [`PC2005-cloud/dsh-pet`](https://github.com/PC2005-cloud/dsh-pet)，Copyright (c) 2026 PC2005-cloud，MIT License：

```text
MIT License

Copyright (c) 2026 PC2005-cloud

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

## AI 生成说明

- 图像生成在本机离线流程中完成，运行时插件不调用任何图像生成 API。
- 发布包不包含 API 密钥、账号信息、生成请求或响应数据；美术文件已剥离 EXIF/XMP/ICC 等元数据。
- 生成服务的使用受对应服务条款约束；本项目不声称与 DeepSeek 存在官方关联。

## 其他

插件只使用 DSH 公开的客户端 slots/hooks 与 harness 提供的 React/ReactDOM；不打包第三方 JavaScript。

# SECURITY / 安全说明

本说明覆盖发布包 `dsh-dafeiyu-counter-0.1.2` 的运行时安全边界和发布内容。

## 运行边界

- **纯客户端 UI 插件**。`index.js` 的 `apply()` 为空；没有 host 侧文件、网络、进程或特权操作。
- 只通过 DSH 公开的客户端 conversation/chat/session/locale slots 读取当前会话并注册第三个视图。
- 只 `require('react')` / `require('react-dom')`（由 harness 提供）；无第三方 npm 依赖、无外部脚本、无动态加载。
- 无 `fetch`、`XMLHttpRequest`、`WebSocket`、`eval`、`new Function`、`child_process`。
- 不调用图像生成 API；美术在发布前已生成并作为静态资产打包。

## 数据与持久化

- 会话内容只用于当前页面渲染；不写回、不上传、不持久化。
- 插件不读取账号名、手机号等账号资料。
- 只保存主题和动效偏好：
  - host-scoped cookie `dafeiyu_theme` / `dafeiyu_motion`；
  - `localStorage` 作为回退。
- 复制动作使用 `navigator.clipboard.writeText`；不读取剪贴板。
- 附件图片/文件通过 host 提供的 `uiConversation` 能力打开；插件不自行访问文件系统。

## 发布包内容

包含：

- `index.js`、`client.js`、`cordis.patch.yml`、`package.json`
- `lib/assets/char/states_v3/` 10 张整图
- `lib/assets/wall_*`、`sign_*`、`table_*`、`props/*`
- `locale/*.json`、`icon.png`
- `README.md`、`ASSET-LICENSE.md`、`SECURITY.md`

不包含：

- 开发目录、生成脚本、提示词记录、旧资产（`layered/`、`layered_v2/`、`reactions/`、`states_v2/`、旧动作帧）
- 密钥文件、环境变量、日志、请求/响应数据
- 本机绝对路径、测试文件、开发截图
- 第三方 JavaScript

## 报告

如发现发布包包含敏感信息或非预期文件，请停止分发并删除该包，重新生成发布目录。

详细脱敏检查与个人标识补查记录保留在项目文档，不随发布包分发。

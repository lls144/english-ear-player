# 听一遍 · 考研英语作文磨耳朵

移动端优先的 Vite + TypeScript 静态播放器。内置英语作文材料与真实 MP3，支持浏览器朗读、本机文件导入、播放进度、切章、循环、倍速、设置恢复及添加到主屏幕。没有后端、账号、数据库、收费 TTS API 或分析埋点。

- 网站：https://lls144.github.io/english-ear-player/
- 源码：https://github.com/lls144/english-ear-player
- V1.0.0：5章、28段、5个MP3。真实手机锁屏、来电和系统挂起尚无物理设备验收证据。

## 一句话维护

以后修改选定的 Obsidian「04 记背」笔记后，对 Codex 说：

> 更新英语作文播放器，按 Obsidian 最新笔记同步并发布。

Codex 按 AGENTS.md 自行执行整个流程；不需要用户运行命令或点击 GitHub 设置。项目内的私有源配置、完整笔记、稳定来源注册表、同步差异、备份和发布工作区均在被忽略的 .local/ 下。公开 Actions 不读取私有笔记，不持有跨仓库密钥。

## 内容与音频

content/materials.json 是人工可编辑的公开材料；sourceIds 为稳定来源ID，sourceLines 为首次映射快照，当前源位置由本机注册表保存。kind 区分原笔记示例、原文英文、模板补全、编辑练习句和用户添加。示例、补全和编辑句均不会冒充逐字原文。

content/audio-manifest.json 登记实际 MP3；content/audio-provenance.json 保存每章英文和 MP3 的 SHA256、语音参数、时长及非静音测量。音频由本机 Windows SAPI / Zira 离线生成，可选已有本地 Piper 模型。GitHub Linux runner 仅校验已提交音频，不合成 SAPI。

## 自动同步规则

npm run sync:notes 在本机使用已授权 gh CLI 读取配置指定文件的最新 master。它只读该文件，从不修改原仓库或复制整个笔记库。

- 用段落、章节上下文和序列锚点匹配稳定ID；中文备注或行号移动不改写已整理英文。
- 明确新增的完整英文自动归入对应章节；一对一的原文变化保留原ID，明确删除有差异记录。
- 模板补全、编辑练习句的原始依赖发生变化，或存在多段歧义、未知章节、占位符、人工编辑冲突时，禁止静默覆盖和发布。
- 完整源文、冲突报告与备份只写 .local/。Codex 可在核对原文后用有理由的本机 resolution 明确保留补全内容；无法可靠判断时保持上个正常版本。
- 新章节需有明确来源映射或经过 Codex 核对的章节规则；已有章节的ID与顺序保持稳定。

## 一键更新、验证和发布

npm run release:content 自动取得发布锁，检查未提交修改与远端状态，在隔离 Git worktree 中完成：

最新笔记 → 差异与备份 → 确定性同步 → 只更新变化章节的 MP3 → 完整解码/非静音/哈希验证 → 类型检查/单元测试 → 生产构建 → 移动端 E2E/PWA 更新回归 → 全历史公开扫描 → 提交 → 非强制推送 → 等待 Actions → 真实 HTTPS 验收。

英文未变时保留 MP3；相同英文与语音参数可命中本机音频缓存。所有待更新音频完成合成和验证后才登记；失败会还原原文件。没有内容变化时不产生提交、推送或部署。工作区有未提交修改时不覆盖它们，候选内容与失败证据保存在隔离工作区。

首次发布使用 --initial；安全演练使用 --dry-run 或独立 rehearsal/ 分支，--source-file 不能发布到 main。每次更新保存前后章节/段落数、重建和复用音频清单，并追加 CHANGELOG.md。

回滚使用 npm run rollback -- v1.0.0：在隔离工作区恢复可信版本标签，重新测试后创建前向回滚提交，不重写或强制推送历史。测试分支只验证与上传候选 artifact，永不部署到正式 Pages。

## GitHub Actions

main 推送自动进行公开扫描、内容/音频检查、类型检查、单元与浏览器测试、生产构建及 PWA 回归；全部成功后通过 GitHub 官方 Pages Actions 发布 dist，再运行真实 HTTPS 验收。rehearsal/ 分支执行相同验证和 artifact 打包，部署和线上步骤被明确跳过。

## PWA 和版本一致性

应用 manifest、PNG 图标和 HTTPS 支持主屏幕使用。MP3、JS、CSS使用内容哈希；文字和当前音频引用在同一JS快照中，version.json标识内容版本。

Service Worker 先验证整个版本每个文件的 SHA256，再完成安装；不调用 skipWaiting。正在播放的页面继续使用旧快照和旧音频缓存，新版本在下一次打开时读取最新HTML。导航采用网络优先，离线只回退当前 worker 的完整缓存；保留上一代资源，支持缓存 MP3 的 Range 请求。安装缺文件或哈希错误时删除不完整缓存，保持原版本可用。不会自动刷新正在播放的页面。本机导入的 blob 文件不上传、不进入公共缓存，刷新后需重选。

## 开发与检查

Node.js 24；本机音频工具使用 Python 3.12 和 FFmpeg。npm run dev 启动本地界面；npm run build 生成静态站点。base 为相对路径，支持 GitHub Pages 项目子路径。

测试入口：typecheck、test、test:content、test:audio、test:e2e:production、test:pwa、test:native。浏览器测试自行启动预览与测试代理。仅测试代理在本机监听，不进入产品或 dist。

浏览器朗读依赖系统英语 voice，不能承诺锁屏稳定，也不会生成 MP3。Windows WebKit 测试端口无法播放 blob MP3；这作为测试环境限制记录，不冒称真实 Safari 导入通过。生产使用优先推荐内置 MP3；物理 iPhone/Android锁屏仍未被桌面模拟代替。

依据：[Vite静态部署](https://vite.dev/guide/static-deploy)、[Service Worker生命周期](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers)、[GitHub Pages API](https://docs.github.com/en/rest/pages/pages)。


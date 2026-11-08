# 听一遍

每天反复听考研英语作文的静态播放器。Vite + TypeScript，无后端、登录、付费 API 或分析埋点。

[正式网站](https://lls144.github.io/english-ear-player/) · [源码](https://github.com/lls144/english-ear-player)

V1.2.0：5 章、68 条严格原文、69 个独立句子/短语单元，3 种预设共 222 个真实 MP3（15 个整章 + 207 个单句）。连接词默认不进入主循环。展示保留原模板；朗读只使用中性占位词，不补写作文事实。原文语法不静默改写。

## 日常使用

选章节、按播放即可。点正文选中一句，切换底部循环按钮至“单句”，即可反复听；也可先开启单句循环，默认锁定正在播放的句子。再点其他句子立即切换，退出单句循环后从该句回到整章。选句和循环模式会保存；三个预设保持同一句。正文随真实音频时间表高亮；底部仅保留切章、进度、循环、速度和紧凑预设。语音选择、浏览器朗读、文件导入收进“更多设置”。添加到手机主屏幕使用 manifest 和 HTTPS；本机导入不上传，刷新后需重新选择。

默认“慢速听”和 0.70×：音频本身已由模型以较慢语速生成，此时实际 HTML 音频倍率为 1，避免默认双重时间拉伸。“连续听”较紧凑，“跟背听”按每条长度增加复述留白。支持 0.55–1.00 的九档；自选 MP3 采用普通倍率语义。V1.2 的完整句、边界处理和局部复合成记录见 [音频记录](docs/AUDIO_V1_2.md)；[V1.1 音色 A/B](docs/AUDIO_V1_1.md) 保留作历史证据。

## 一句话维护

以后修改选定的 Obsidian「04 记背」后，对 Codex 说：

> 更新英语作文播放器，按 Obsidian 最新笔记同步并发布。

Codex 按 AGENTS.md 自行执行。私有源配置、原始笔记、同步注册表、备份和凭据仅在忽略的 .local 下；公开仓库不含完整笔记或私有仓库密钥。原始仓库只读，不改变可见性。

## 严格同步

npm run sync:notes 通过本机已授权 gh 读取指定文件最新 master。仅原文已有英文进入 content/materials.json；source-index.json 保存审核后的文字和朗读计划哈希。sourceIds 稳定，sourceLines 是首次映射快照，最新位置在本机注册表。新增短语保持短语，未填模板保持模板，Markdown/中文解释不进入朗读；displayText 保留原文；speechText 按 reading.mjs 的可审计中性映射保持完整句，未知占位符阻止同步。每个真实句界产生稳定 ID，逗号、分号、插入语不拆句；sth./sb.、小数、缩写受保护。句中不人为插入占位静音。

自动识别明确新增、单项修改与删除；章节编号保持稳定。无法确定的格式、多项歧义、来源冲突或本地英文改写会阻止同步和发布，并保留旧版本与私有差异报告。不存在“保留 AI 补全”的豁免。V1 的改写/编辑句不能通过 V2 校验。纠偏明细见 [内容差异](docs/CONTENT_DIFF_V1_1.md)，可选语法建议见 [独立校验](docs/SOURCE_REVIEW_V1_1.md)。

## 本地离线音频

隔离环境在 .local/ai-venv；Python 3.12，依赖锁在 scripts/requirements-ai.txt。scripts/prepare_kokoro.py 获取固定版本、验哈希并准备本机模型，模型不提交。npm run audio:update 生成增量 MP3；npm run audio:quality 执行本机离线英语 ASR 审核。仓库 content/audio-settings.json 记录模型、音色、速度、停顿及处理版本；任何参数变化使缓存失效，旧 SAPI 文件永不复用。

按章和独立句子、按预设生成；未变的文件保持字节不变。全部候选先完成解码、时长、非静音、时间表和静音检查再登记；失败回滚本地文件。audio-quality.json 绑定实际字节和参数。GitHub Linux runner 只验证提交的素材和质量记录，不安装 AI 模型、不合成、不访问私有源。

## 更新、发布和回滚

npm run release:content 在干净 main 和独立 worktree 执行：最新源 → 备份/严格同步 → 增量音频 → ASR → 类型/单元/音频检查 → 构建 → 移动端浏览器/PWA 回归 → 全历史公开扫描 → 提交 → 非强制推送 → Actions → 真实 HTTPS 验收 → 不可覆盖的版本标签与本机私有映射检查点。

没有变更则不提交、不部署。同步或任一验证失败禁止推送；不覆盖其他未提交修改。--initial 支持首次发布；--dry-run 和 rehearsal/ 分支用于隔离演练，fixture 禁止推送 main，演练分支不部署正式站。

npm run rollback -- <可信 V1.1 或更高版本标签> 创建经过相同验收的前向回滚提交，恢复与内容匹配的播放器、编译器、测试和私有检查点，保留当前发布/安全工具，不强推、不重写历史。旧版含编辑扩写的 V1.0 标签不是合法内容回滚目标。缺少检查点或映射不匹配则拒绝猜测。

main 推送触发官方 GitHub Pages Actions：先验证再部署 dist，随后线上检查。测试失败时保持原线上版本。Node.js 24，npm ci 安装前端开发依赖；npm run dev 启动开发，npm run build 生成生产资源。相对 Vite base 支持 Pages 项目子路径。

## 缓存和版本一致性

JS、CSS、全部 MP3 使用内容哈希；正文与全部音频引用在同一 JS 快照。Service Worker 验证核心资源及默认慢速五轨后原子安装；其余整章轨及单句音频按需校验并缓存，首次切换需要网络。不调用 skipWaiting，不刷新正在播放的页面。新打开或返回前台且暂停时检测新版；导航网络优先，离线只使用完整版本。旧会话保留旧资源，MP3 Range 请求可读缓存；失败安装删除不完整缓存，避免新旧材料混用。

检查入口：typecheck、test、test:content、test:audio、test:e2e:production、test:pwa、test:native。测试自行启动服务。真实 iPhone/安卓锁屏、来电和系统挂起仍需物理设备，桌面移动模拟不等于真机验收。Windows Playwright WebKit 的 blob MP3 后端限制单独记录，不冒称 Safari 本地导入已通过。浏览器 speechSynthesis 只使用英语 voice，不能承诺稳定锁屏，也不生成 MP3。

本机 test:audio-cache 还会隔离注入音色、模型、处理器、语速、停顿五种变更，故意禁用模型后确认旧音频不会错误复用、失败不会修改原文件。此项使用本机 AI 环境，不在公开 Actions 中合成。

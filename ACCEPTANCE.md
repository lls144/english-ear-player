# V1.0.1 验收与证据范围

正式资源由 GitHub Pages 提供，发布状态和每次自动验收结果以 Actions 的 validation-results / online-validation artifacts 为准。站点：https://lls144.github.io/english-ear-player/ 。

当前内容基线：5章、28段、5个真实MP3；英文原文、模板补全与编辑句分别标识。公开材料与音频都有逐章哈希来源记录；原始私有笔记和本机路径不公开。

验证包括 TypeScript、单元/同步回归、FFmpeg完整解码与非静音检查、六种桌面/手机/平板/横屏浏览器配置、生产子路径、PWA缓存更新和真实HTTPS媒体播放。PWA回归实际模拟旧页面继续播放、下一次打开取得新资源、离线重开，以及不完整新版本安装失败后保留原缓存。

已有真实英语合成证据来自系统英语voice、原生语音事件、Windows会话音量和WASAPI输出PCM；浏览器语音不被称为稳定锁屏方案。

范围限制：
- 无物理iPhone/Android连接；真实锁屏、来电、OS挂起和硬件媒体键尚未最终验证。
- Windows WebKit测试端口不支持有效blob/data MP3；该场景验证正确失败处理与内置音频恢复，不冒称真实Safari导入成功。
- Windows WebKit端口缺少Media Session API；支持平台验证了真实元数据与动作处理，但这不等同于移动系统锁屏UI验收。
- 桌面标签切换、协议冻结/恢复及移动设备配置均不能替代物理后台测试。
- 未安装英语ASR模型；语音输出、生成输入与页面文本对应已有证据，但没有独立语音转写结论。

本机详细证据与同步/发布备份保存在忽略的 .local/qa 和 .local/releases 下；公开Actions仅使用选定材料和已提交MP3，不访问私有源仓库。


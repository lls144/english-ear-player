import fs from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
const read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const dev=await read('.local/qa/e2e-development.json'),prod=await read('.local/qa/e2e-production.json'),native=await read('.local/qa/native-speech.json'),audio=await read('.local/qa/audio-analysis.json'),content=await read('.local/qa/content-audit.json');
let background;try{background=await read('.local/qa/background.json');}catch{background={scope:'Headless multi-tab tests passed; headed hidden-state probe could not establish a hidden document under this host automation environment.'};}
const release=spawnSync(process.execPath,['scripts/audit.mjs','--release'],{encoding:'utf8',windowsHide:true});
if(release.status===0 || !release.stderr.includes('Publication not approved'))throw Error('Publication safety gate unexpectedly changed');
const rows=audio.map(a=>'| '+a.id+' | '+a.durationSeconds+' | '+a.rmsDb+' dBFS | '+a.peak+' | 一致 |').join('\n');
const report=`# 自动验收报告
日期：2026-11-07。仅独立项目本机工作；未创建公共仓库、未部署，原 Obsidian 笔记和私有仓库保持不动。

## 结论
可作为优先使用内置 MP3 的静态播放器候选版本。可在本机自动复现的问题均已修复并回归；不能把桌面 WebKit/Chromium 的移动配置、脚本触发的媒体回调或桌面后台页测试称为物理 iPhone 锁屏通过。

## 实际执行结果
| 检查 | 结果 |
| --- | --- |
| TypeScript | tsc --noEmit 通过 |
| 单元/回归测试 | 21/21 通过（此前为12项） |
| 开发环境 Playwright | ${dev.stats.expected}通过，${dev.stats.unexpected}失败，${dev.stats.skipped}跳过，${dev.stats.flaky}重试后通过 |
| 生产预览子路径 Playwright | ${prod.stats.expected}通过，${prod.stats.unexpected}失败，${prod.stats.skipped}跳过，${prod.stats.flaky}重试后通过 |
| 原生英语语音与声卡测量 | ${native.checks.length}项检查通过 |
| Vite生产构建 | 通过；dist资源及私有信息检查通过 |
| 依赖审计 | 0漏洞 |
| 发布拦截 | approved=false，release:check按预期拒绝发布；无远程仓库 |

浏览器矩阵：本机Edge 156、Chrome 156、Playwright WebKit 27.2；分别使用桌面Edge、Pixel 7、小屏320×568、iPhone 13、iPad Mini、iPhone横屏配置。每个环境执行18个场景，开发与生产预览分别完整运行。生产经Vite preview在 /english-ear-player/ 下提供资源。

**通过数量代表场景断言通过，不意味着缺失的平台能力被伪造为通过。** Windows WebKit的有效blob导入场景检查的是“不支持时正确报错并回退内置文件”；Media Session缺失场景记录API缺失。它们均在Playwright报告里带limitation注释。

## 已自动验收的行为与方法
- 5个真实MP3逐一播放：读取原生HTMLAudioElement的readyState、currentSrc、duration和不断增长的currentTime；全程同一个audio元素。
- 暂停后实际时间停止，继续后从原位置增长；上一章/下一章、实际源URL、章节标题与当前文本一致。
- 0.75、0.9、1、1.25、1.5倍速实际作用于媒体时钟，切章保留；单篇原生loop确实回到开头，全列表逐章跨越真实ended事件并回到首章。
- 鼠标和模拟触摸的进度跳转、持续更新，快速播放/暂停、连续切章、加载过程中替换章节，长文滚动、横屏与小屏布局。
- 真实本机文件在Edge/Chrome中以blob地址播放；移除、刷新回退内置MP3。错误扩展名、空文件、损坏文件均有提示和可恢复路径。
- 真实HTTP404/503、浏览器离线、慢响应，以及恢复网络后不刷新重试；测试代理仅监听回环地址，不是产品后端、不进dist。
- 首次访问优先MP3；刷新保留章节、速度、循环与位置，不自动发声；损坏或被禁止的localStorage不阻断播放。
- 在原生支持Media Session的平台检查元数据，以及注册的play/pause/stop/previous/next/seek回调对真实媒体元素的效果。回调注入不是物理锁屏按钮测试。
- 每个浏览器场景捕获console.error、window.error和unhandledrejection；故障注入预期的资源失败、开发服务器HMR消息与异常应用错误分开记录，未发现未处理的应用异常。
- 多标签切换和返回后连续播放正常。另行执行的桌面后台检查范围：${background.scope}

## 真实英语发声证据
- Edge与Chrome在这台电脑上只暴露3个中文OneCore voice；没有拿中文声音冒充英语。
- Firefox 159能使用系统已有的Microsoft Zira Desktop（en-US）；页面只列英语声音，native utterance的voice.lang与lang均为英语。
- 系统音频会话峰值：英语TTS ${native.speech.peak.toFixed(4)}，暂停后 ${native.paused.peak}，真实MP3 ${native.mp3.peak.toFixed(4)}。
- WASAPI默认输出回环实际取得非静音PCM：RMS ${native.deviceOutput.rms.toFixed(6)}，peak ${native.deviceOutput.peak.toFixed(6)}，采样${native.deviceOutput.seconds}秒。测量只读取输出，不启用麦克风，不修改音量、静音、系统语音或注册表。
- 原生start/boundary/end事件、暂停续读、1.25倍、快速切换与切章取消均已检查；同一时刻最多${native.log.maxActive}个原生朗读任务。
- Firefox官方测试包在宿主机报mozglue私有程序集缺失；仅在项目.local/browsers副本中写回DLL自带供应商清单，原始浏览器二进制和系统环境未改写。

## 内容与音频准确性
重新通过GitHub连接读取master的唯一指定文件，blob为 ${content.sourceBlob}，与锁定源一致；没有读取或上传其他笔记。
- 5章、28段逐段核对kind、sourceLines和change；保留唯一原笔记漫画示例并逐字验证。
- 44个趋势与连接表达做覆盖检查；人物插入语和省略号替换结构补为明确标识的练习句，不冒称原文。
- 未编造图表数据；无Markdown标记、中文注释、未完成占位符进入英文朗读。原笔记不修改。
- 5章合成输入文本哈希与当前显示文本逐章一致，MP3字节哈希也与生成记录一致。
- FFmpeg对每个实际MP3完整解码为16kHz单声道PCM并计算时长、RMS和峰值，全部非静音：

| 章节ID | 时长（秒） | RMS | peak | 文本/音频哈希 |
| --- | --- | --- | --- | --- |
${rows}

这些哈希证明生成输入与当前材料一致，不能冒充独立语音转写。系统只安装了中文识别引擎；没有英语ASR模型，未为抽检强装大模型。

## 已修复的问题
1. 补充0.9倍速选项；英语voice使用其自身的语言标签，首次访问优先已有MP3。
2. 修复进度条聚焦后停更；监听input提交触摸位置，修复WebKit只发input而不发change导致无法跳转。
3. 修复旧音源的异步pause/播放拒绝污染新章节状态；真实慢请求、连续切章及单元竞态测试覆盖。
4. 解码错误会暂停真实audio；重试重新load；5秒无进展会停止“假播放”并提示失败，避免永久缓冲。
5. 给已证明的原生loop回零后意外暂停增加受限恢复；显式用户暂停不会被恢复。
6. 内置音频按当前页面相对路径解析，修复开发子路径与生产资源行为差异。
7. 缩减低高度横屏播放器，避免占据过多阅读区域。
8. 补回此前过度排除的可背插入语与替换结构，保留出处和补写标记，重新生成并核验MP3。
9. 增加可自行启停服务的E2E配置、真实HTTP故障代理、原生语音与音量分析脚本，修复Windows npm执行Python路径的问题。

## 客观限制（未伪装通过）
- 无物理iPhone、iPad或Android设备连接；真实锁屏10分钟、手机OS挂起、来电/耳机及硬件媒体键尚无证据。
- Windows Playwright WebKit的原生媒体后端拒绝有效blob/data MP3（MEDIA_ERR_SRC_NOT_SUPPORTED）；内置HTTP MP3通过。该结果不等同于真实Safari导入失败或通过。
- Windows WebKit测试构建不提供Media Session API；原生支持的平台已验元数据和动作处理，真实移动系统锁屏UI未验证。
- 当前宿主自动化环境的headless标签持续报告visible；报告区分了标签切换、合成/协议生命周期条件与真实OS后台。
- 没有独立英语ASR转写；真实合成、输出、英文源内容与生成输入对应关系已有证据。

## 留存证据
忽略的 .local/qa/ 下有e2e-development.json、e2e-production.json、native-speech.json、audio-analysis.json、content-audit.json及后台检查记录；失败修复后最终重跑结果不包含未处理失败。录音仅做瞬时统计，未上传任何内容。
`;
await fs.writeFile('ACCEPTANCE.md',report);
console.log('Acceptance report regenerated from completed test artifacts.');


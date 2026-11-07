# V1.1 本地语音与验证记录

生产音频采用 Kokoro-82M v1.0 / af_heart。模型与权重为 Apache-2.0；kokoro-onnx 包装器为 MIT。模型来自固定版本的 ONNX 导出，原始权重 SHA256、转换后模型、音色包 SHA256 均登记在 audio-settings.json。仅增加已有音素时长张量的输出，不改变训练参数。模型、推理环境、完整 ASR 转写均保留在忽略的 .local 下。

## 实测选择

本机已实际合成 af_heart、af_bella 两种英语音色，并以旧 Zira 作对照，样本为笔记中的 2022 漫画长句、原因分析句及原文连接词。使用离线 base.en ASR，无参考提示词。最终 A/B 的两种 Kokoro 音色原始词错误率均约 4.48%，主要来自 Thereupon 的同音分词；Zira 在这些样本上为 0%。因此不能把音色更丰富等同于识别准确率更高，也不将 ASR 或音高范围当作主观自然度评分。

af_heart 的长句音高变化范围约 7.76 半音，af_bella 约 6.77，Zira 约 5.78；原因句对应约 6.78、6.39、5.22。选用上游推荐的 af_heart，统一整套音频。CPU ONNX 实际长句推理耗时约音频时长的 0.2–0.45 倍，无需占用 GPU，也未安装 CUDA 大环境。RTX 4060 已检测，但不声称已使用或测量 CUDA 显存。

短语直接独立合成曾出现单词起音异常。现在对不超过六词的片段仅用同一原文重复三次构成推理上下文，按模型真实音素时长取中间一次，丢弃其余两次；保留两侧最多 80ms 保护。绝不添加示例句。三词以内保持至少 0.85 的模型语速，避免拖慢单个音节；记忆节奏由静音控制。

## 阅读和停顿

| 预设 | 模型语速 | 完整项间停顿 | 短语间停顿 |
|---|---:|---:|---:|
| 连续听 | 0.70 | 650ms | 850ms |
| 慢速听 | 0.60 | 1200ms | 1400ms |
| 跟背听 | 0.65 | 至少 2400ms，按本条语音长度增加，最多 12 秒 | 同左 |

逗号、句号保留给模型产生语调；模板空位按独立静音处理。片段保留呼吸余量，5ms 淡入淡出，逐段 RMS 归一并限制峰值，防止音量跳变和句尾截断。实际各条 start/speechEnd/end 在 audio-timings.json，页面高亮直接使用该时间表。

页面 0.70× 为本套音频的基准设置，内置 MP3 此时真实 playbackRate 为 1，不二次拉伸；其余速度相对该基准调整并开启 preservesPitch。导入的普通文件按原始倍率解释。不能把 UI 倍率等同于每个模型的绝对词速。

## 发布门槛

15 个 MP3 均完整解码、测量时长/RMS/峰值，并按时间表检查真实静音。离线 faster-whisper-base.en 对全部 MP3 无提示转写。跟背长静音容易让 ASR 漏段或幻觉，因此同时保存整轨误差与基于实际时间表缩短项间留白后的转写误差，启用 VAD。仅缩短已知项间静音，不删语音或改公开 MP3。Thereupon/they're up on、Altogether/all together 等同音拼写处理公开记录，原始错误率不隐藏。

audio-quality.json 的结果绑定 MP3、原文朗读计划和全部声音参数哈希。它是自动检测证据，不是“人耳自然度已通过”的声明。任何内容、音色、模型、处理策略或停顿变更均需重新生成并复审受影响音频；Actions 只验证提交的音频和报告，不下载模型、不读取私有源、不执行生成。

上游：[Kokoro 模型及许可](https://huggingface.co/hexgrad/Kokoro-82M)、[音色说明](https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md)、[kokoro-onnx](https://github.com/thewh1teagle/kokoro-onnx)、[ONNX 导出](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX)、[faster-whisper](https://github.com/SYSTRAN/faster-whisper)。已调研 IndexTTS、F5-TTS 的上游许可；Kokoro 已得到可用结果，未额外安装这些更大的模型。没有付费或非官方云端 TTS。

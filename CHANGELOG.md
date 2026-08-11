# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 的基本格式。

## [Unreleased]

### Planned

- Windows 安装包与真实设备回归测试
- 更完整的多页图片/PPT 演示流程
- Apple 签名与公证发布

## [0.2.0] - 2026-08-11

### Added

- `ABAO Presenter` 品牌、应用图标和专业暗色控制台
- 隐私优先的人像开关，首次启动不会自动打开摄像头
- 本地动态 HTML、图片和轻量白板演示
- 摄像头浮窗、鼠标效果、提词器与 3:4 演示画面
- 设置持久化和白板草稿恢复
- GitHub CI、自动 Release 构建及开源项目文档

### Changed

- macOS 优先使用 Electron 原生 MP4 录制能力，不支持时回退 WebM
- 录制数据按块直接写入最终文件，减少长录制的内存压力
- 移除不可再分发的 FFmpeg 二进制及相关转换流程

### Security

- Electron 渲染进程启用沙箱、上下文隔离和受限 preload API
- 增加内容安全策略与依赖审计

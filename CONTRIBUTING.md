# Contributing

感谢你帮助改进 ABAO Presenter。

## 开始之前

1. 先搜索现有 Issue，避免重复工作。
2. 对较大的功能或界面改动，建议先提交 Issue 说明使用场景和方案。
3. 不要在 Issue、日志、截图或样例素材中提交真实人脸、口播稿、账号信息和私有路径。

## 本地开发

```bash
npm ci
npm start
```

提交前必须通过：

```bash
npm run check
npm audit --omit=dev
```

涉及录制的改动还应手工验证：白板、动态 HTML、图片、摄像头开关、麦克风、提词器以及至少一段可播放的样片。

## Pull Request

- 保持改动单一、说明清楚，并写明验证方式。
- UI 改动请提供截图；截图前关闭摄像头，避免公开个人画面。
- 不提交 `node_modules/`、`dist/`、`release/`、`recordings/`、日志、证书或密钥。
- 新增依赖时说明用途、体积和许可证。

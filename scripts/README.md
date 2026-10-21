# 开发脚本

- `smoke-bundle.mjs`：测试最终 main.js、KaTeX 与实际嵌入的 worker；宿主 API 为模拟实现。
- `check-local-notebooks.mjs`：只读检查自己的 Notebook，并验证读取前后的哈希。
- `package.mjs`：将源码和构建产物复制到 dist；不部署至 Obsidian 库。

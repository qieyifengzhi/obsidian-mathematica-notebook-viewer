# 源码导航

- `main.ts`：只读视图、文件事件、命令及扩展名注册。
- `parser.ts`、`notebook.ts`、`strings.ts`：Notebook 结构、box 转换、字符串解码。
- `code-math.ts`：受限的代码公式排版，不执行 Wolfram 计算。
- `renderer.ts`、`styles.css`：安全 DOM、公式、分组与分页。
- `worker.ts`、`parse-client.ts`：后台解析、取消、超时和资源释放。
- `types.ts`：数据模型和保护上限。

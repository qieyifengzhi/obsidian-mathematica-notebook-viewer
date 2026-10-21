# 验证与复现

版本：1.0.2。最近本地验证日期：2026-10-21。环境：Windows、Node.js 24.19.0、npm 11.17.0；Obsidian 官方 API 类型 1.14.4；KaTeX 0.19.0。

## 自动验证

| 检查 | 结果 | 范围 |
| --- | --- | --- |
| TypeScript 类型检查与生产构建 | 通过 | npm run build，obsidian 外置，CommonJS 成品 |
| 自动测试 | 74 / 74 通过 | 29 项解析/预算/编码；7 项 DOM/安全；16 项代码公式；12 项集合模板回归；6 项生命周期/冲突/刷新；4 项 worker |
| 最终构建冒烟 | 通过 | 实际 main.js、嵌入式 worker、JSDOM、KaTeX、中文注释、Reduce 分式、Reals 模板、源码切换和修改刷新 |
| worker 资源释放 | 通过 | 创建和终止各 3 个 worker，剩余 Blob URL 为 0 |
| 离线字体 | 通过 | 内置 WOFF2；CSS 字体名称使用 MNB_ 前缀；无外部字体 URL |
| 真实 Obsidian 桌面完整验收 | 尚未完成 | 安装后按 README 手动验收 |

只读生命周期测试把模拟宿主中的 modify/create/delete/rename/process/adapter.write 设为调用即报错，验证打开、切换、刷新、关闭和卸载均未调用这些写接口。它不能证明其他插件或 Obsidian 本身也不会修改文件。

安全与边界覆盖：嵌套注释、中文字符及 Wolfram 编码、长字符串和续行、Cell 分组、错误坐标和源片段位置、常见 box、未知/动态/图形回退、节点/深度/大小/显示预算、HTML/链接/TeX 文字注入、无可编辑控件、源码分页、扩展名冲突、防抖、过期读取、worker 超时和取消。

公式回归覆盖：前置中文注释分离、Reduce 分式与逻辑算符、优先级、模式或内联注释回退、公式开关、四种标准数集模板、成员关系，以及自定义模板的源码回退。用户提供的表达式不会被直接当作 TeX 执行。

## 本地复现

```powershell
npm ci
npm test
npm run test:bundle
```

`test:bundle` 用 Node worker_threads 桥接浏览器消息，运行成品中实际嵌入的解析器。宿主 API 由 tests/obsidian-mock.ts 模拟；DOM 使用 JSDOM。它验证成品模块的连接关系，不能验证真实 Obsidian 的文件关联、工作区恢复、主题、弹出窗口和不同版本兼容性。

最低声明版本 Obsidian 1.5.0 未真机测试，移动端也未测试；当前 isDesktopOnly:true。项目不包含私人 Notebook、笔记内容或本机校验记录，仅附独立编写的 tests/fixtures/demo.nb。

## 可选：自己的 Notebook

```powershell
npm run test:local -- "你的库\Reference_code"
```

脚本只读访问指定目录的 .nb，输出解析统计与读取前后的 SHA-256 一致性。输出可能包含自己的文件名、时间和校验值，应自行保存在本地。它不会上传文件或写入 Notebook；外部应用在检查期间保存文件也可能导致哈希不一致。

实际桌面验收步骤见 [README](README.md#7-验证状态与手动验收)。
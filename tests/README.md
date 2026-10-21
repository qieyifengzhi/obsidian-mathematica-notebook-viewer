# 测试

在仓库根目录执行 `npm test`。测试覆盖 Notebook 解析、常见 box、公式、只读生命周期、安全文本、分组与分页、文件刷新、线程回收和标准集合模板。

`fixtures/demo.nb` 为独立编写的演示文件，不包含私人笔记本。Obsidian API 由 `obsidian-mock.ts` 模拟；真实桌面验收边界见根目录 `TESTING.md`。

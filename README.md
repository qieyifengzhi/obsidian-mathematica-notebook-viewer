# Mathematica Notebook Viewer：Obsidian 只读插件

在 Obsidian 内点击文本形式的 Wolfram Mathematica `.nb` 文件，直接阅读单元、中文教学注释、常见公式和原始源码。支持库内任意目录的 `.nb` 文件，命令选择器优先列出 `Reference_code/` 目录。

**版本 1.0.2；桌面端；最低声明版本 Obsidian 1.5.0。** 使用 1.14.4 官方 API 类型构建。最低版本依据所用 API 的可用性设定，尚未在 1.5.0 真机运行验证。无需安装 Mathematica、Wolfram Engine 或 Node.js 即可安装成品。

## 1. 安装成品（推荐）

1. 从本仓库的 [Releases](https://github.com/qieyifengzhi/obsidian-mathematica-notebook-viewer/releases) 下载 `mathematica-notebook-viewer-1.0.2-install.zip`，解压后找到 `mathematica-notebook-viewer` 文件夹。
2. 在 **Obsidian 当前打开的库的根目录** 下找到 `.obsidian/plugins/`。如果没有 `plugins`，手动新建。
3. 将整个文件夹放入其中，确认结构如下。避免多套一层同名目录。

   ```text
   你的库/
     .obsidian/
       plugins/
         mathematica-notebook-viewer/
           manifest.json
           main.js
           styles.css
           README.md
           TESTING.md
           LICENSE
           THIRD_PARTY_NOTICES.md
     Reference_code/
       example.nb
       example_Annotated.nb   （如有）
   ```

4. 在 Obsidian 的「设置 → 第三方插件」允许使用第三方插件，刷新插件列表，启用 **Mathematica Notebook Viewer**。必要时重启 Obsidian。
5. 点击 `.nb` 文件。若文件列表没有显示它，在「设置 → 文件与链接」中开启「显示所有文件类型」，再刷新或重新打开库。
6. 第一次可先把源码项目中的 `tests/fixtures/demo.nb` 复制到**测试库**试用。安装插件本身不需要复制任何研究文件。

Windows 安装路径示例：

```text
C:\你的库\.obsidian\plugins\mathematica-notebook-viewer\
```

请以你在 Obsidian 实际打开的库为准。安装时若目标已有同 ID 插件，请先备份旧插件目录，再明确选择是否升级，不要直接合并未知文件。本仓库提供手动安装包，尚未收录于 Obsidian 官方社区插件目录。

## 2. 使用方法

- **渲染视图**：按 Notebook 顺序显示单元、样式名称、`CellLabel` 和分组。保存为 `Closed` 的组默认折叠；可逐组或全部展开。
- **原始源码**：显示磁盘读取的原始文本，保留注释、选项和换行。每页 60,000 个 UTF-16 代码单元，可能在一行中间断开。切页可查看全部内容；本界面没有编辑器或保存按钮。
- **中文注释**：`Text`/`Section` 等按文本显示；嵌在 `Input` 的 `RowBox` 字符串中的 `(* 中文教学注释 *)` 也会保留并换行。
- **数学预览**：文本中的内联 `Cell[BoxData[…]]` 自动排版。1.0.1 起，受支持的 `Input`/`Output`/`Code` 表达式也直接显示公式；开头的多行 `(* 中文注释 *)` 单独保留为文本。可展开「查看代码文本」，或关闭数学预览恢复全部代码。其他可转换的 box 仍提供展开式预览。
- **本单元源码**：每个单元底部可展开精确源片段；复杂对象或很长的单元可在这里继续分页阅读。
- **刷新**：外部程序修改当前 `.nb` 后，收到 Obsidian `vault.modify` 事件会自动重新读取。连续事件合并为 250 ms。也可从命令面板执行「刷新当前 Notebook」。
- **命令打开**：命令面板搜索「Mathematica Notebook Viewer: 打开 Notebook（只读）」，选择库内文件。选择器优先排列根目录 `Reference_code/` 中的文件；插件本身可查看库内其他目录的 `.nb`。
- **右键打开**：在 Obsidian 文件菜单选择「只读查看 Notebook」。

注释只存在于 `_Annotated.nb` 时，应打开该副本。插件不会从另一文件迁移、生成或补写注释。

## 3. 支持范围

| 表达式 / 内容 | 处理方式 |
| --- | --- |
| `Notebook[{…}, options…]` | 读取单元列表，忽略前端窗口/样式选项 |
| `Cell`、`CellGroupData` | 显示单元、标签、顺序、嵌套及开/合状态 |
| `TextData`、内联 `Cell`、`BoxData`、`RowBox` | 文本组合；内联数学；代码重建 |
| `FractionBox` | 分式 |
| `SuperscriptBox`、`SubscriptBox`、`SubsuperscriptBox` | 上下标 |
| `SqrtBox`、`RadicalBox` | 平方根 / 根式 |
| `StyleBox`、`FormBox` | 读取显示内容，忽略任意样式和格式选项 |
| `TagBox`、`InterpretationBox` | 仅显示第一参数；不运行标签或解释表达式 |
| `PaneBox`、`FrameBox`、`ItemBox`、`TooltipBox` | 显示第一参数，忽略布局/动作选项 |
| `GridBox` | 最多 20 × 20 的文本矩阵；完整选项仍见源码 |
| `TemplateBox[{}, "Reals"/"Integers"/"Rationals"/"Complexes"]` | 无自定义选项的标准数集显示为 ℝ / ℤ / ℚ / ℂ；支持整条成员关系条件公式 |
| `Title`、`Section`、`Subsection` 等 | 标题层级 |
| `Text`、`Item` 等其他文本样式 | 安全文本；不会完整复刻 Mathematica 样式表 |
| `Input`、`Output`、`Code` | 常见表达式直接显示公式，前置教学注释保持文本；代码可展开；不支持的表达式保留代码 |
| `Print`、`Message` | 代码文本 |
| 字符串编码 | 中文原文、`\:XXXX`、`\|XXXXXX`、`\.XX`、八进制、常见 `\[Gamma]` 等命名字符、长字符串、行续接 |

`GraphicsBox`、`Graphics3DBox`、`RasterBox`、未识别或自定义的 `TemplateBox`、`DynamicBox`、`ButtonBox`、未知 box 等采用**可见源码回退**，不会执行、不解压 `CompressedData`，也不会重算图形。1.0.2 仅对白名单中的无参数、无自定义选项数集模板进行转换，不执行 `DisplayFunction` 或 `InterpretationFunction`。未知命名字符保持 `\[Name]` 文字，避免猜测。不支持二进制 Notebook、UTF-16 文件和任意包裹执行表达式（例如 `Get[…]`）。

1.0.1 新增代码公式排版：支持 `Reduce[…]`、`Simplify[…]`、`Solve[…]`、`D[…]` 等函数调用，以及括号、列表、分式、幂、隐式乘法、比较、`&&`/`||`、赋值和规则等常见记法。`&&` 排成 `∧`、`||` 排成 `∨`，`==` 排成数学等号；多字母变量如 `qba` 保持原符号，不擅自改成带下标的变量。这里只排版函数调用，不求出 Reduce 的结果。单个代码公式最多 4,000 字符、1,500 个排版节点、64 层解析递归；表达式内部含注释、模式、复杂 Wolfram 语法或超限时回退为文本。前置教学注释保持顺序并从公式中分离。

这是结构化只读查看器，并非 Wolfram 语言编译器。Notebook 解析器识别字符串、嵌套注释、列表、函数调用和分隔符；代码公式排版是有界的常见语法子集。不尝试证明 Notebook 的 Wolfram 语法或数学正确性。

## 4. 保真与只读约定

1. **原始源码是依据。** 渲染代码由 box 结构转换而来，例如 `FractionBox` 的文本会显示成 `(a)/(b)`；公式预览也可能改变视觉间距。需要精确语法、选项、样式或复制运行代码时，请查看单元原始源码。
2. **已有 Output 是文件保存的历史结果。** 插件没有 Wolfram 内核，不运行 `Solve`、`Reduce`、`Dynamic` 等表达式，不能确认输出与当前 Input 一致。
3. `FileView` 负责文件绑定和工作区状态。本插件仅用 `vault.read` 读取，订阅修改事件；没有 Notebook 写入、删除、重命名或导出功能，不读取网络资源。
4. 没有使用 `TextFileView`：官方 API 明确其关闭流程会尝试保存未保存内容。选择 `FileView` 可直接避开该文本编辑器保存流程和可编辑文件标题，不需要覆盖、替换 Obsidian 的保存接口。
5. 全部 Notebook 文字使用 `textContent` 创建 DOM；不交给 Markdown 渲染器，也不作为 HTML、JS 或原始 TeX 执行。任意颜色、URL、样式、按钮事件和 Interpretation 的计算参数都不启用。
6. KaTeX 仅接收由白名单 box 和转义后的字符生成的 TeX，设 `trust:false`、`maxExpand:200`、`maxSize:10`。字体及解析 worker 内置于安装文件，离线可用。
7. `.nb` 全局关联通过官方 `registerExtensions(['nb'], VIEW_TYPE)` 注册。如果已有其他插件占用而注册失败，只显示提示，保留命令和右键入口；不访问私有 `viewRegistry`，不撤销或接管其他插件的关联。
8. 自动关联使用小写 `nb`。大写 `.NB` 若未自动打开，可用命令或右键。另一插件若在之后主动抢占关联，其行为需在该插件设置中处理。
9. 本插件的只读约定针对自身行为；Obsidian 文件管理器及其他应用仍有各自的修改/重命名功能。

## 5. 大文件与错误处理

| 限制 | 数值 / 行为 |
| --- | --- |
| 文件读取前大小检查 | 超过 12 MiB 不读取；改用外部查看器 |
| 解析源字符数 | 最多 12 × 1024 × 1024 个 UTF-16 代码单元 |
| 结构树 | 最多 400,000 个节点；嵌套最多 192 层 |
| 文档单元 / 分组 | 各最多 10,000；单元组嵌套最多 96 层 |
| 后台任务 | 解析器约 5 秒检查时间预算；主线程 7 秒强制终止 worker |
| 单元显示 | 最多 32,000 字符、12,000 个转换节点；超限有提示和完整源码入口 |
| 文本与 TeX 汇总预算 | 2,000,000 字符；超过则停止渲染并提供原始源码 |
| 单个公式 | 最多 4,000 个 TeX 字符；否则保留文本 |
| 页面 DOM | 每页最多 40 项（单元和组标题合计） |

解析在 Blob Worker 中进行，不占用界面线程解析整棵结构树。换文件、重载、关闭视图或禁用插件时终止旧 worker 并撤销 Blob URL；过期读取和任务返回值不会覆盖新文件。单元源码和代码公式按展开操作惰性创建，源码分页显示。

这些是保护性上限，不是所有接近上限的文件均能完整渲染的承诺。当前文件仍需整体读入内存；多个大型文件会增加内存占用。解析失败不会展示误拼接的半本 Notebook；错误提示会给出可用的行列位置，仍可切到源码。超过读取大小限制的文件不会提供内置源码页。

如果环境不允许 Blob Worker，显示错误并保留原始源码。可先关闭其他插件，在测试库中检查；本插件不会为了绕过限制切回界面线程执行大文件解析。

## 6. 从源码构建与测试

需要 Node.js 22 或更新版本及 npm；首次安装依赖需要联网。运行插件成品不需要这些工具。

```powershell
cd "源码项目目录"
npm ci
npm test
npm run build
npm run test:bundle
```

`npm run build` 先进行 TypeScript 类型检查，然后生成根目录 `main.js`、`styles.css`，并将可安装文件放在 `dist/mathematica-notebook-viewer/`。该目录可以直接复制到 `.obsidian/plugins/`。

```powershell
# 可选：只读检查自己的笔记本；不修改文件、不上传内容
npm run test:local -- "C:\你的库\Reference_code"
```

本地检查输出每个 `.nb` 的单元数、注释数、解析耗时及读取前后 SHA-256 一致性；带 `_Annotated` 名称的文件会检查可见的教学注释数量与源中标记数量一致。不会把笔记本复制进安装包。

```powershell
# 开发：监听 src/，自动重新构建；不会自动部署到你的库
npm run dev

# 生成含源代码的 dist/source-project/ 和安装目录
npm run package
```

源码结构：

```text
src/main.ts           插件注册、FileView、只读读取、自动刷新、命令
src/parser.ts         Wolfram 文本结构解析及错误坐标
src/strings.ts        Wolfram 字符串解码与 TeX 字符转义
src/code-math.ts      前置注释分离与安全的代码表达式公式排版
src/notebook.ts       Cell/box 白名单转换、原始源码位置、显示预算
src/parse-client.ts   worker 创建、取消、超时及 URL 回收
src/worker.ts         后台解析入口
src/renderer.ts       安全 DOM、分组、分页、KaTeX、源码切换
src/types.ts          模型类型及固定保护上限
src/styles.css        插件样式，构建时合入离线 KaTeX 字体
tests/                解析、安全、只读、刷新、线程测试与独立 demo.nb
scripts/              最终 bundle 冒烟、本地笔记本只读检查、打包
esbuild.config.mjs    构建 CommonJS、内置 worker 及字体
```

依赖已用 `package-lock.json` 固定。开发时仍通过 Obsidian 提供的 `obsidian` 模块运行，不能将 `main.js` 当作 Node.js 命令执行。

## 7. 验证状态与手动验收

自动测试见 [TESTING.md](TESTING.md)。最终构建的冒烟测试在模拟 Obsidian API 下运行真实 `main.js`、DOM、KaTeX 及嵌入式 worker，**不能替代真实 Obsidian 桌面验收**。当前发布没有完成桌面端完整验收，不将其宣称为已通过真机验收。

安装后可按以下顺序验收：

1. 打开 `demo.nb`，确认中文标题、Input 多行注释、Text 内分式可读，关闭的组可展开。
2. 打开自己的 `.nb` 或带注释副本，确认相应教学注释显示；切换渲染/源码，再打开单元源码。
3. 在**测试副本**用外部文本编辑器改一处 Text，保存后确认 Obsidian 自动刷新。打开另一个文件，确认旧结果不会覆盖它。
4. 比较测试 `.nb` 打开前后哈希，关闭标签、重启 Obsidian 后再次比较。
5. 若同时装有 `.nb` 查看插件，在测试库启用它，确认本插件提示关联冲突，命令和右键仍可显式打开。

## 8. 排错、更新与卸载

- **插件不出现在列表**：检查目录 ID 是 `mathematica-notebook-viewer`，`manifest.json` 与 `main.js` 在同一层；刷新列表或重启。
- **点击仍用其他应用打开**：先用插件命令或右键；检查是否有其他 `.nb` 关联插件。手动解决关联后重载本插件。
- **公式没有排版**：确认启用数学预览；1.0.1 会自动排版支持的代码表达式，并分开前置注释。表达式内部含注释、不支持的语法、复杂 box 或超长公式会保留代码；部分 box 的备用公式预览仍需展开。
- **中文显示为转义字符**：已覆盖常见 Wolfram 编码；未知命名字符原样保留。若文件为 UTF-16，可在其他应用另存为 UTF-8 副本，再打开副本。
- **源码提示分隔符不匹配**：可能文件被截断、尚未保存完成，或不是受支持的文本 Notebook。先核对源码或用原软件另存文本副本；不要为了让插件通过而删改原始研究文件。
- **更新**：先禁用插件，备份已有插件文件夹，再替换安装文件并启用。不需要修改 Notebook。
- **卸载**：先关闭该查看器标签，禁用插件，删除其插件文件夹。Notebook 保留原位；视图关联由 Obsidian 的插件注册清理流程释放。

## 9. 接口依据与许可证

2026-10-21 核对的官方资料：

- [Obsidian 官方 API 类型](https://github.com/obsidianmd/obsidian-api/blob/master/obsidian.d.ts)：`registerView`、`registerExtensions`、`FileView`、`TextFileView`、`Vault.on`。
- [Obsidian 官方示例插件](https://github.com/obsidianmd/obsidian-sample-plugin)：插件目录、manifest 和 CommonJS 构建方式。
- [Obsidian 开发文档](https://docs.obsidian.md/)。
- [KaTeX 安全说明](https://katex.org/docs/security.html) 与 [安全/大小/展开选项](https://katex.org/docs/options.html)。

项目采用 MIT；内置 KaTeX 采用 MIT。分发时请保留 `LICENSE` 与 `THIRD_PARTY_NOTICES.md`。本插件不是 Obsidian 或 Wolfram 的官方产品。

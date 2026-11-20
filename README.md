# 循证 · 药物安全性助手

面向 GLP-1、PD-1/PD-L1、ADC 的文献问答演示。

- GitHub Pages 托管界面、文献片段和 PDF；浏览器运行 BM25 与中英文药物/不良事件别名检索。
- DeepSeek 通过 Cloudflare Workers Free 代理组织回答。密钥仅保存在 Worker Secret，不进入 GitHub 或浏览器。
- 有文献依据的结论附引用，可查看对应片段与 PDF 页码。无匹配证据或未覆盖部分可显示明确标注的模型知识补充。
- 等待区显示实际检索、生成阶段，不是模型内部推理。

## 当前部署状态

公开页面：https://fdd77931-arch.github.io/drug-safety-assistant/

静态检索与 DeepSeek 免费代理已连接。访问者无需提供密钥；代理故障或额度用尽时仍可查看文献检索结果。

## 文献范围与许可

公开版包含 38 篇已核验 CC BY 文献、768 个提取片段，不代表全部最新证据。PDF 保持原样；文本为自动解析结果，可能存在表格、断行及元数据错误。作者、DOI、来源、许可原文见 [署名清单](corpus/ATTRIBUTIONS.json)。第三方材料例外以每篇原文声明为准。

检索为轻量关键词方案，没有运行原项目的 BGE-M3 或 Reranker。中英文别名增强不等于通用跨语言语义检索。

## 本地查看

在此目录运行 `python3 -m http.server 8770`，打开 http://localhost:8770 。必须通过 HTTP 打开，不能直接双击 HTML。

## 成本和限制

静态页面使用 GitHub Pages；接口使用 Cloudflare Free，DeepSeek 按实际调用量收费。代理每日最多接受 100 次生成请求，每次最多调用模型 2 次，每个 IP 每分钟最多 6 次。该限制不是人民币金额上限，也不能防止所有滥用。达到额度后仍可检索文献。任何付费升级须由账户持有人决定。

引文校验仅验证引用 ID 和逐字原文，不保证医学结论必然由该原文支持。回答供研究和技术演示，不替代诊疗意见。

## Drug Intelligence AI 研究工作台

根页面为药物安全 RAG 问答，五药研究目录与安全知识库位于 `workspace.html`。目录来自 ClinicalTrials.gov API v2 和 PubMed 书目响应。页面显示取回日期，单项研究显示自己的登记更新时间。收藏、最近研究和报告草稿保存在当前浏览器。

运行 `python3 research/tools/build_catalog.py --db /tmp/drug-research.sqlite --output research/catalog.json` 更新试验与书目快照。调试时可用 `--sources` 指定已下载的原始 JSON 目录。SQLite 数据库用于本地核对结构化实体与关联，公开网页读取导出的 JSON。报告是可编辑的来源摘要草稿。监管查询目前通过官方链接打开。

首页的药物安全知识库可浏览已收录文献，或按领域、药名、不良事件和 DOI 检索片段。浏览和检索复用公开语料与原有浏览器 BM25，问答继续使用服务端生成与逐字引文校验。

### 可选百炼推理服务

Worker 默认使用已配置的 DeepSeek。切换百炼时，在服务端设置 `MODEL_PROVIDER=bailian`、`BAILIAN_BASE_URL`（百炼工作空间的 OpenAI 兼容 HTTPS Base URL）和 `BAILIAN_MODEL`（该空间可用并支持 JSON 对象输出的模型 ID）。在 Worker 的 Secret 管理入口设置 `BAILIAN_API_KEY`，再测试已配置额度、有效引文和上游错误。百炼模式仍使用站内语料检索、原始引文校验和同一调用额度。

公开安全知识库由 38 篇开放文献与 2 份美国药品说明书节选组成。新增来源为 DailyMed 的 TAGRISSO（5.1）和 RINVOQ / RINVOQ LQ（黑框警告），仅展示已核对的片段，原标签链接随来源显示。

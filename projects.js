// 项目数据：后续新增项目，在这里加一条即可。
// link 可留空（内部项目），留空则不渲染成可点击链接。
const PROJECTS = [
  {
    name: "PersonaCore",
    tagline: "多模态性格测评多智能体系统",
    description:
      "通过结构化面试识别候选人的大五人格特质（责任心、团队性、抗压、正向情绪等），量化打分 + 筛选建议。支持文字 + 语音双模态，多智能体协作（面试官 / 维度分析师 / 裁决 / 报告）。",
    tech: ["Python", "FastAPI", "DeepSeek", "emotion2vec", "多智能体", "SQLite"],
    link: "https://github.com/China-sty/PersonaCore",
    status: "v2.0.0 已上线",
  },
  {
    name: "centerBrain",
    tagline: "代码责任归属 / 缺陷归因分析 Agent",
    description:
      "基于 Agentic RAG 架构，将开发者自然语言对话与代码提交日志作为知识源，实现「业务意图 → 责任人反推」（如「胶囊是谁负责」）。三段式架构：意图提取 → 向量检索 → 综合推理，并支持缺陷归因分析（根因 / 责任提交 / 证据链）。",
    tech: ["Python", "FastAPI", "LangChain", "Milvus", "Agentic RAG", "向量检索"],
    link: "",
    status: "内部已上线",
  },
  {
    name: "LeadForge",
    tagline: "面向 ToB 制造企业的 AI 获客引擎",
    description:
      "通用 AI 获客平台，覆盖「找客户 → 触达 → 承接转化」全链路：潜客挖掘 + 线索评分 + 智能触达话术 + 询盘报价 + 老板看板。多租户配置化，企业按自身行业画像配置即可使用。",
    tech: ["Python", "FastAPI", "DeepSeek", "多智能体", "结构化输出", "SaaS"],
    link: "https://github.com/China-sty/LeadForge",
    status: "已上线",
  },
  // 下一个项目在这里继续加
];

function renderProjects() {
  const grid = document.getElementById("projects");
  grid.innerHTML = PROJECTS.map((p) => {
    const inner = `
      <div class="card-head">
        <h3>${p.name}</h3>
        <span class="status">${p.status}</span>
      </div>
      <p class="tagline">${p.tagline}</p>
      <p class="desc">${p.description}</p>
      <div class="tech">${p.tech.map((t) => `<span class="tag">${t}</span>`).join("")}</div>
    `;
    if (p.link) {
      return `<a class="card" href="${p.link}" target="_blank" rel="noopener">${inner}</a>`;
    }
    return `<div class="card">${inner}</div>`;
  }).join("");
}

document.addEventListener("DOMContentLoaded", renderProjects);

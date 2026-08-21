// 项目数据：后续新增项目，在这里加一条即可。
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
  // 下一个项目在这里继续加
];

function renderProjects() {
  const grid = document.getElementById("projects");
  grid.innerHTML = PROJECTS.map(
    (p) => `
      <a class="card" href="${p.link}" target="_blank" rel="noopener">
        <div class="card-head">
          <h3>${p.name}</h3>
          <span class="status">${p.status}</span>
        </div>
        <p class="tagline">${p.tagline}</p>
        <p class="desc">${p.description}</p>
        <div class="tech">${p.tech.map((t) => `<span class="tag">${t}</span>`).join("")}</div>
      </a>
    `
  ).join("");
}

document.addEventListener("DOMContentLoaded", renderProjects);

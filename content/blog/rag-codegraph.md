---
title: 让 Agent 读懂整个仓库：CodeGraph 的构建、查询与上下文编排
subtitle: 从 AST 到调用图，从图查询到 token 预算 —— 仓库级代码理解的工程实践
tags: Agent, CodeGraph, 代码理解, tree-sitter, 上下文工程
series: RAG 前沿实践
order: 6
icon: graph
excerpt: 把 OrderService.create() 的返回类型改掉，得先找全调用点。grep 出两百多处，二十几个是别的类的同名方法；embedding 返回的是一堆文档。代码的结构本来是显式的，没必要让模型猜。
---

把 `OrderService.create()` 的返回类型从 `Order` 改成 `OrderResult`，得先找全调用点。

grep 搜 `create(`，两百多处，其中二十几个是别的类的同名方法。用 embedding 检索「订单创建」，返回一堆文档、注释和 README，真正要改的调用点排在后面。

两个工具卡在同一件事上：它们看到的是文本，而这个问题是结构问题。

## 漏在哪

最严重的三类漏检。

接口和实现。调用方写的是 `PaymentGateway.pay(...)`，实际实现是 `AlipayGateway`。grep 能找到接口方法，找不到哪些类实现了它。

动态分发。Spring 的 `@Autowired`、反射、SPI 加载，调用点在源码里根本没有显式的 new。

跨模块重导出。工具库 re-export 了另一个包的符号，grep 到的名字和定义处的名字对不上。

这些信息编译器每天都在算，只是没有以 Agent 能用的形式暴露出来。

## 建一张图

我们把仓库建模成有向属性图。节点是代码实体，边是关系。

| 节点 | 来源 | 用途 |
|---|---|---|
| Module | 目录、构建文件 | 跨模块影响 |
| Class / Interface | AST | 类型层次、实现查找 |
| Function | AST 加符号表 | 调用关系的最小单位 |
| Field | AST | 配置与常量追踪 |
| Test | 命名约定、注解 | 改了它要跑哪些测试 |
| Endpoint | 路由注解 | 代码改动映射到接口 |

边只有五类：calls、inherits、implements、references、tests。每个节点带文件和行号，另外挂了两个工程属性：近半年改动频率和 CODEOWNERS。这两个不影响正确性，但排序很有用。

建图精度分三档。语法级用 tree-sitter，快但解不了重载；类型级用 LSP 或 SCIP 索引，准但慢；编译期插件最准，只能给核心模块用。

我们最后选类型级为主、语法级兜底。80 万行的仓库，LSP 全量要二十多分钟，tree-sitter 四十秒，用一个快的铺覆盖，用慢的保精度。

```scheme
; tree-sitter-java：抓方法调用
(method_invocation
  name: (identifier) @callee
  arguments: (argument_list) @args) @call
```

存储用的嵌入式图库，schema 大概这样：

```cypher
CREATE NODE TABLE Symbol(
  id STRING, name STRING, kind STRING,
  file STRING, line INT64, signature STRING,
  PRIMARY KEY (id)
);
CREATE REL TABLE CALLS(FROM Symbol TO Symbol, line INT64);
CREATE REL TABLE IMPLEMENTS(FROM Symbol TO Symbol);
```

80 万行下来约 240 万个节点、810 万条边，图文件 1.9GB。全量建图 22 分钟，增量 1.4 秒，查询 P95 38ms。

## 只给五个工具

这是整个项目里最重要的决定。

一开始我们把 Cypher 直接暴露给模型，效果很差。生成的语句一半语法不对，另一半虽然能跑但扫全图，一次几十秒。更麻烦的是没法对 `MATCH (n) RETURN n` 做权限控制。

后来改成参数化工具，只留五个：找符号、找调用方、找被调用方、算影响面、找调用路径。

```json
{
  "name": "impact",
  "description": "返回修改某个符号会影响到的调用点，含文件位置",
  "parameters": {
    "type": "object",
    "properties": {
      "symbol": { "type": "string", "description": "全限定名，如 com.shop.OrderService.create" },
      "depth":  { "type": "integer", "minimum": 1, "maximum": 4 }
    },
    "required": ["symbol"]
  }
}
```

`impact` 就是反向 BFS，加了深度上限和结果截断，按图距离排序：

```python
def impact(graph, symbol, depth=3, limit=50):
    seen, frontier, out = {symbol}, [symbol], []
    for d in range(depth):
        nxt = []
        for s in frontier:
            for caller in graph.predecessors(s):
                if caller in seen:
                    continue
                seen.add(caller)
                out.append({"symbol": caller, "distance": d + 1})
                nxt.append(caller)
                if len(out) >= limit:
                    return out
        frontier = nxt
    return out
```

这五个工具用 MCP 暴露出去之后，Claude Code、Cursor 这类客户端能直接接，不用给每个 Agent 重写适配。我们内部的 code review 机器人就是这么接的。

## 上下文装箱

拿到结构之后的问题是给模型看多少。全给爆预算，给少了它还是猜。

我们的规则叫最小充分上下文：定义本身、直接调用者（最多十个）、接口的所有实现、相关测试。四类按图距离排序，再按 token 预算贪心装。

```python
def pack_context(graph, symbol, budget=3000):
    blocks = [graph.node(symbol)]
    blocks += [graph.node(c) for c in graph.predecessors(symbol)][:10]
    blocks += [graph.node(i) for i in graph.implementations(symbol)]
    blocks += [graph.node(t) for t in graph.tests_of(symbol)]

    blocks = dedupe(blocks)
    blocks.sort(key=lambda b: (b.distance, -b.churn))

    out, used = [], 0
    for b in blocks:
        if used + b.token_cost() > budget:
            break
        out.append(b)
        used += b.token_cost()
    return out
```

每个 block 带 `file:line`，模型引用时能落到位置。没有位置信息的上下文，等于没有引用的答案。

同任务下，grep agent 平均要喂 14.2k token，图只要 3.2k，准确率还更高，因为给的是结构相关的，不是字面相似的。

## 和 grep、embedding 怎么配合

没有取代，是按问题类型路由。

「谁调用了 X」「改 X 影响谁」走图，字面检索必漏。「哪里处理了退款逻辑」走图加 BM25，先定位符号再用关键词收敛。「这段代码为什么这么写」走 embedding 加 git log。报错解释走 embedding 就够。

图还兼做 rerank 的先验：embedding 召回二十个文件后，如果某个文件和目标符号在图上距离为一，直接提到第一位。这个简单规则把 top-3 命中率抬了六个点。

## 实测

同一个 80 万行仓库，60 个真实开发任务：

| 方案 | 定位准确率 | 上下文 token | 成功率 |
|---|---|---|---|
| grep agent | 68.4% | 14.2k | 61.5% |
| embedding RAG | 74.1% | 9.8k | 68.2% |
| codegraph | 91.7% | 3.2k | 86.9% |

延迟反而更低，因为少了「翻文件」的轮次。

失败的 13% 集中在三处：Spring 动态代理，运行时链和静态图对不上；protobuf 生成的代码没有源码位置；同名重载消歧要靠类型级索引。

## 最后

这套东西最反直觉的一点是：图不用追求 100% 完整。

动态语言和 DI 框架注定有缺口，覆盖率到九成左右收益就饱和了，剩下的靠回退到 grep。我们一开始想把所有边都补全，做了两个月，收益很小。

倒是「增量更新」比想象中重要。每次提交重建全图的话，没人会用它。做到 1.4 秒增量，才敢挂进 CI。

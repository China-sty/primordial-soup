---
title: Agent 的 Android 之眼：把无障碍树变成可推理的界面语义图
subtitle: 从 AccessibilityNodeInfo 到多模态 Grounding，一套真正给 LLM 用的页面表示方案
tags: Android, Agent, AccessibilityService, Grounding, 多模态
series: Agent × Android Framework
order: 1
icon: eye
excerpt: 第一版是截图加多模态模型，让它输出坐标。第三天开始出问题：缩过的截图里一个按钮只有四十来像素宽，模型偏十几个像素就点到隔壁。日志里一切正常，它确实点在我们给的那个点上。
---

第一版是截图加多模态模型，输出坐标。

前三天很惊艳。第四天开始出问题。

1080×2400 的截图缩给模型，一个按钮在图上只有四十来像素宽。模型输出的点只要偏十几个像素，就落到隔壁的「取消」上。而日志里看起来完全正常，它确实点在了我们给的那个坐标上。

问题的本质不是模型不准，是表示给错了。坐标丢掉了控件的身份、语义和层级，只留下一个位置。

## 试试无障碍树

Android 本来就有一棵树，无障碍服务能拿到每个节点的文本、描述、类名、resource id、屏幕坐标。

但直接把这棵树丢给模型也不行。我们试过，一个中等页面能有一百多个节点，其中大半是不可见的容器和装饰性 View，token 比截图还多。

要做的不是二选一，是把它压小，再补上它的盲区。

## 压成语义节点

先改配置。默认配置下拿不到 `viewIdResourceName`，也看不到被标记为不重要的视图，而这两样恰好是稳定 ID 和完整语义的来源。

```xml
<accessibility-service xmlns:android="http://schemas.android.com/apk/res/android"
    android:accessibilityEventTypes="typeWindowStateChanged|typeWindowContentChanged"
    android:accessibilityFlags="flagReportViewIds|flagRetrieveInteractiveWindows|flagIncludeNotImportantViews"
    android:canRetrieveWindowContent="true"
    android:canPerformGestures="true"
    android:notificationTimeout="80" />
```

然后深度优先遍历，边遍历边剪枝，直接产出扁平数组，节点之间用 `path` 保留层级。

只保留「可见 + 有语义或可交互」的节点：可点击、可输入、可滚动，或者有文本、有 content description。容器一律折叠，同文本去重，和视口交集面积小于一定值的丢掉。

排序也有讲究。按「可点击、可输入、可滚动、纯文本」的优先级排，同优先级按屏幕从上到下、从左到右。模型读到的是阅读顺序，不是 View 树的插入顺序。

一个页面从 1450 token 压到 500 左右。

## ID 要稳定

这是整个感知层最值钱的一步。如果每次采样 ID 都在变，「记住这个按钮」就无从谈起，日志也没法对账。

规则三条。有 resource id 就用它；没有就用层级路径加文本哈希；永远不要把 bounds 放进主键，键盘弹出、列表滚动、动画都会让它变，而我们恰恰需要在这些变化之后认出同一个元素。

```kotlin
fun stableId(node: AccessibilityNodeInfo, path: String): String {
    val resId = node.viewIdResourceName?.substringAfterLast('/').orEmpty()
    val label = (node.text ?: node.contentDescription)?.toString()?.trim()?.take(12).orEmpty()
    val suffix = "$resId|${node.className}|$label".hashCode().toString(16).takeLast(4)
    return if (resId.isNotEmpty()) "r-$resId-$suffix" else "n-$path-$suffix"
}
```

坐标归一化到 0–1000。同一套 prompt 可以在 1080p、2K、折叠屏之间复用，模型不用重新学分辨率。

## 盲区

无障碍树解决不了三类页面：自绘 UI（Compose、Flutter、游戏引擎），整块屏可能只有一个可点击节点；WebView，节点存在但粒度和文本对不上；`FLAG_SECURE` 窗口，直接拒绝读取。

前两类用截图加 OCR 或视觉模型补。核心思路是把两次观测对齐到同一套坐标：语义节点给身份和结构，视觉候选框给位置和缺的文本。

两条实用规则。OCR 框和某个语义节点 IoU 超过 0.5 时，把文本合并进该节点，不要新增节点，否则同一个按钮会出现两个候选。点击前必须回溯可点击祖先，OCR 识别出的是文字，不是可点击区域，真正能点的往往是它外面的容器。

第三类没辙，只能靠系统级权限，那是另一篇文章的事。

## 什么时候采样

这是最容易翻车的地方。

`TYPE_WINDOW_CONTENT_CHANGED` 在列表滚动或输入时每秒能触发几十次。每次事件都抓一遍树，你会在动画中间态采样，拿到半透明、位移、文本还没填完的界面。

现在的做法是静默窗口加双帧确认：事件来了先等 80ms，然后连续抓两帧，哈希一致才算稳定。哈希里刻意不放时间戳和倒计时文本，秒杀页面的数字每秒都在跳，放进去永远等不到稳定。

```kotlin
suspend fun awaitStable(timeoutMs: Long = 3000, settle: Int = 2): UiSnapshot {
    val deadline = SystemClock.uptimeMillis() + timeoutMs
    var last = 0L; var same = 0; var snap = snapshot()
    while (SystemClock.uptimeMillis() < deadline) {
        delay(80)
        snap = snapshot()
        val h = signature(snap)
        if (h == last) same++ else same = 0
        last = h
        if (same >= settle) return snap
    }
    return snap
}
```

别用固定 sleep。500ms 在旗舰机上看着能用，千元机上随机失败；调到 1500ms 又把整体耗时翻倍。

## 数据

62 个页面、320 个目标元素，覆盖三台机器：

| 指标 | 纯截图 | 语义树 | 树加补盲 |
|---|---|---|---|
| 定位命中率 | 78.4% | 86.1% | 94.7% |
| 观测 token | 1100 | 1450 | 520 |
| 单步耗时 | 640ms | 120ms | 380ms |

剩下的 5% 失败集中在三处：Compose 没开 `testTagsAsResourceId`，拿不到 resource id；分屏下 `displayId` 混用，点到了另一块屏；转场动画期间 bounds 每帧都在变。

最后一条只能靠动作层的后置校验兜，那是下一篇。

## 最后

把表示做对的收益，比换一个更强的模型大得多。

我们现在看一个页面的第一反应，是「模型能从这堆字段里看出该点什么吗」，而不是「模型够不够聪明」。

这个顺序反过来之后，很多问题就变成工程问题了。

---
title: Agent 的 Android 之手：动作原语、时序控制与可恢复的执行引擎
subtitle: 「点到了」和「点对了」是两件事 —— 用后置断言与失败分类把误触率压到 1% 以下
tags: Android, Agent, 手势注入, 状态机, 可靠性
series: Agent × Android Framework
order: 2
icon: hand
excerpt: 点击这件事，我们从一行代码改到了七版。点到了不代表点对了，执行成功不代表页面变了，页面变了也不代表变对了。这篇写执行层怎么把这三个「不代表」逐个补上。
---

`performAction(ACTION_CLICK)` 这一行，我们改了七版。

第一版就一行：找到节点，点下去，结束。上线第一天开始出问题。

## 七个问题

现在回头看，一次点击背后至少有七件事：

节点还在不在，页面可能已经变了；节点可点击吗，`clickable=false` 的容器很常见；点击点被别的窗口盖住了吗，弹窗、输入法、悬浮球都算；该用语义点击还是真实触摸，两者行为不一样；点完之后页面真的变了吗；变了就是变对了吗，可能只是弹了个 toast；失败了该重试、该回退、还是该放弃。

把七个问题逐个答完，就是执行层。

## 只给七个原语

最早让模型直接输出坐标，问题很多。坐标是开放集合，模型可以输出任何数字，你没法校验，也没法重放。

现在只暴露七个：tap、long_press、set_text、swipe、scroll、press、wait。

参数是 `element_id` 或文本，不是坐标。坐标由执行层解析。

| 原语 | 参数 | 备注 |
|---|---|---|
| tap | element_id / text | 坐标由执行层算 |
| long_press | element_id、时长 | 默认 600ms |
| set_text | element_id、文本 | 先试 ACTION_SET_TEXT |
| swipe | 方向、距离比例 | 不暴露绝对坐标 |
| scroll | element_id、方向 | 容器不支持才用手势 |
| press | back / home / enter | 系统级 |
| wait | 条件、超时 | 等元素出现或消失 |

模型输出的 ID 会在执行前校验，不在快照里的直接判非法，让它重新规划。这一步拦掉了大约 12% 的幻觉点击。

## 两条路都要有

语义点击直接调节点的点击回调，快，不需要坐标，元素被盖住也能生效。缺点是有些页面不吃这套：Compose 的部分节点、WebView 内部元素、自己拦截了 `onTouchEvent` 的控件，调完没反应。

坐标手势注入真实的触摸事件，走完整分发链路，兼容性好。代价是需要准确坐标，还要自己处理遮挡和边缘。

策略是语义优先，无效果回退：

```kotlin
suspend fun tap(node: SemanticNode): TapResult = withContext(Dispatchers.Main) {
    val before = snapshot.signature()

    if (node.clickable) {
        val hit = findNode(node.id)?.performAction(AccessibilityNodeInfo.ACTION_CLICK) == true
        if (hit && pageChanged(before, 400)) return@withContext TapResult.Ok("semantic")
    }

    val p = node.center(shrink = 0.15f)          // 内缩，避开边缘热区
    if (!isTopWindowAt(p)) return@withContext TapResult.Fail(Failure.COVERED)

    val ok = dispatchGesture(
        GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(Path().apply { moveTo(p.x, p.y) }, 0, 60))
            .build(), null, null)
    if (!ok) TapResult.Fail(Failure.INJECTION_REFUSED) else TapResult.Ok("gesture")
}
```

没用 `adb shell input`，原因很实际：要开 USB 调试，单次调用起一个 `app_process` 一百多毫秒，还是盲目注入，注入完就退出，跟页面状态没法同步。

`dispatchGesture` 是同一个输入子系统的合法入口，要求无障碍服务声明 `canPerformGestures`，没有进程启动开销。

## 等待

动作发出去只是开始，成败取决于等什么。

只看无障碍事件不够，动画期间事件会连续触发，到了不代表稳了。只看固定 sleep 更糟，慢设备必挂。

我们等两个东西：事件到达，以及快照签名变化。变了之后再调一层 `awaitStable` 拿稳定快照。

三个高频坑。转场动画时 `TYPE_WINDOW_STATE_CHANGED` 在动画开始就发了，新页面的 bounds 还是旧值；输入法弹起会推起布局，下半屏坐标全部失效；toast 和 Snackbar 不改窗口树，但会盖住底部按钮一两秒。

## 断言

这是把「能跑」变成「可靠」的分水岭。

一次点击成功，只代表 `performAction` 返回了 true。它可能点中了一个禁用按钮、一个纯展示卡片，或者一个只弹 toast 的入口。

所以每个动作都带一个可选 expect，动作后强制校验：某个元素出现了、消失了、页面签名变了、文本匹配了。没写 expect 的点击，等于没有校验的写操作。

有了断言，失败才能分类：

| 失败 | 判定 | 恢复 |
|---|---|---|
| NOT_FOUND | 快照里没有目标 ID | 重新采样、滚动查找、放弃 |
| NOT_CLICKABLE | `clickable=false` | 回溯可点击祖先、坐标兜底 |
| COVERED | 命中点不在目标窗口 | 关弹窗、收键盘、重试一次 |
| NO_EFFECT | 动作后签名没变 | 语义点击与手势互换 |
| DISABLED | `enabled=false` | 不重试，回规划层 |
| BLOCKED | 登录、验证码、权限弹窗 | 立即停，转人工 |

单步最多重两次，总耗时不超过三秒。重试前必须重新采样，用旧快照重试等于重复同一次失败。

## 数据

同一批 320 个元素：

| 策略 | 首次成功率 | 单步耗时 | 误触率 |
|---|---|---|---|
| 纯坐标 | 78.9% | 210ms | 9.4% |
| 纯语义 | 84.2% | 90ms | 3.1% |
| 语义优先加兜底加断言 | 96.8% | 240ms | 0.9% |

多花的一百五十毫秒，花在注入前的窗口命中检测和动作后的稳定等待上。误触率降一个数量级，用户感知不到这点延迟。

剩下 0.9% 基本都发生在快速转场期间的坐标兜底。最后的兜底是任务级的二次确认：支付、删除这类不可逆操作，执行前对比两次快照，目标元素位置一致才允许点。

## 最后

执行层做久了会有个感觉：模型聪明不聪明，在这里影响没那么大。

真正决定成败的是那些琐碎的东西，元素可不可点、窗口有没有被盖、点完等多久、失败了怎么分类。

这些都不性感，但它们决定了 Demo 和产品之间的距离。

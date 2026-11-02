---
title: 越过沙盒：用 Shizuku 与 Binder 把 Agent 接到 system_server 上
subtitle: 不 root 的前提下，一个普通 App 如何获得接近 adb shell 的系统能力 —— 以及为什么先加约束再加能力
tags: Android, Agent, Shizuku, Binder, system_server, 系统权限
series: Agent × Android Framework
order: 3
icon: key
excerpt: 前两篇把眼睛和手做完了，但有一堵墙：想读前台 Activity、想进设置页、想看被 FLAG_SECURE 保护的窗口，无障碍都做不到。墙的另一边是系统服务，挡在门口的是 Binder 里的那行 uid 检查。
---

前两篇把眼睛和手做完了，看起来能操作手机了。但任务稍微越界，就会撞墙。

想知道前台是哪个 Activity、任务栈里压着什么，无障碍只能看到窗口标题。想打开一个未导出的 Activity，或者跳到系统设置的深层页面，点不进去就是点不进去。想读安装列表、包签名、权限授予状态，Android 11 之后 `QUERY_ALL_PACKAGES` 收得很紧。想看 `FLAG_SECURE` 窗口，树是空的，截图是黑的。

这些能力都属于系统服务，而系统服务在 Binder 入口检查调用者的 uid。

## Binder 门口的那行检查

App 通过 `ServiceManager.getService("activity")` 拿到一个句柄，`asInterface()` 之后就能像调本地方法一样调 `ActivityManagerService`。

真正决定你有没有权限的，是服务端这行：

```java
final int callingUid = Binder.getCallingUid();
if (callingUid != Process.SYSTEM_UID && !hasPermission(...)) {
    throw new SecurityException("Permission Denial");
}
```

普通 App 是 10000 以上，system_server 是 1000，shell 是 2000。绝大多数检查对 2000 是放行的，因为 adb 就是 shell。

所以问题变成：能不能让我的调用以 2000 的身份到达服务端。

## Shizuku 做的事

Shizuku 本身是一个跑在 system_server 之外的进程，启动方式有两种：连一次 `adb shell` 执行脚本，或者 Android 11 以上通过无线调试配对直接起。它的 uid 是 2000。

起来之后做两件事：通过 `ServiceManager.getService()` 拿到各个系统服务的句柄；对外暴露自己的 Binder，接受普通 App 的代发请求。

App 侧拿到的是 `ShizukuBinderWrapper`。它实现了 `IBinder`，但每次 `transact()` 不直接发往目标服务，而是把「目标是谁 + 原始数据」打包交给 Shizuku 进程，由后者用自己的 uid 重新发起。

Binder 的 calling uid 是内核在 transaction 时写进去的。Shizuku 重新发起，内核写的就是 2000，服务端无从分辨这次调用是 adb 发的还是某个 App 借道发的。

```text
[ App, uid 10xxx ] --proxy--> [ Shizuku, uid 2000 ] --binder--> [ system_server ]
```

这不是提权漏洞。用户要手动开 USB 调试或无线调试，手动执行启动脚本，再在 App 里授权。它复用的是开发者本来就有的调试通道。

## 接上

初始化只关心三件事：Binder 活没活、版本够不够、权限有没有。

```kotlin
override fun onCreate() {
    super.onCreate()
    if (!Shizuku.pingBinder()) return                 // 服务没起来，引导用户
    if (Shizuku.isPreV11()) { onReady(); return }     // 老版本没有权限模型
    if (Shizuku.checkSelfPermission() == PackageManager.PERMISSION_GRANTED) {
        onReady()
    } else {
        Shizuku.requestPermission(REQ_SHIZUKU)
    }
    Shizuku.addRequestPermissionResultListener { code, result ->
        if (code == REQ_SHIZUKU && result == PackageManager.PERMISSION_GRANTED) onReady()
    }
}
```

权限一次授予长期有效，但 Binder 可能随时断，所以每次跨进程调用前都要 `pingBinder()`，并注册 `addBinderReceivedListener` 做重连。

## 读任务栈

最实用的一组能力。Agent 做规划时，最需要知道「我现在在哪个 App 的哪个页面」。

Android 10 之后，任务栈接口从 `IActivityManager` 拆到了 `IActivityTaskManager`，服务名 `activity_task`。为了兼容老版本做个降级链：

```kotlin
private fun atm(): IActivityTaskManager {
    val binder = runCatching { SystemServiceHelper.getSystemService("activity_task") }
        .getOrElse { SystemServiceHelper.getSystemService("activity") }
    return IActivityTaskManager.Stub.asInterface(ShizukuBinderWrapper(binder))
}

fun topTask(): TaskInfo? = runCatching {
    atm().getTasks(10).firstOrNull { it.isVisible }?.let {
        TaskInfo(it.topActivity?.packageName, it.topActivity?.className, it.taskId)
    }
}.getOrNull()
```

从 ATMS 拿到的 `ComponentName` 比无障碍事件里的 className 准，Dialog 和 PopupWindow 不会把它覆盖掉，多窗口下也能区分不同任务。

## 隐藏 API

`IActivityTaskManager` 这些类在公开 SDK 里没有。三条路：从 AOSP 拷 aidl 自己生成 stub，用 refine 注解生成包装类，或者反射加手写 transact。

我们走第一条。把 aidl 放进 `src/main/aidl/android/app/`，编译期就能拿到 `Stub.asInterface()`。运行时这个类会被框架里的同名类顶替，所以不需要任何反射，也就绕开了 hidden API 黑名单。

网上流传的 `VMRuntime.setHiddenApiExemptions(arrayOf("L"))` 能让所有隐藏 API 变回可反射，但它在 Android 12 之后逐步收紧，属于下个版本就失效的写法。能用静态 stub 解决的问题不要赌。

有些系统操作没必要硬调接口，走 shell 更省事：

```kotlin
fun sh(cmd: String): String? = runCatching {
    val p = Shizuku.newProcess(arrayOf("sh", "-c", cmd), null, null)
    p.inputStream.bufferedReader().readText()
}.getOrNull()
```

`pm`、`am`、`dumpsys`、`settings`、`screencap` 全都能用了。代价是同时打开了命令注入的门 —— 如果命令里拼了模型生成的参数，那就是个货真价实的 RCE。我们的做法是只允许固定模板，参数走数组而不是 `sh -c` 拼接，包名和数字类参数做白名单校验。

## 安全边界

拿到 shell 身份之后，最容易犯的错是什么工具都做。我们画了三条线。

能力分级。读前台 Activity、读包列表是只读，直接执行；改设置、注入输入要确认；静默安装卸载、清数据二次确认，默认关闭。

白名单而不是黑名单。暴露给 Agent 的 tool 是写死的几个，每个内部只允许一种命令模板，模型无法拼出新命令。

全程可审计。每次调用记 tool、参数、调用者 uid、结果、耗时、当时的前台页面。

还有个诚实的事：`FLAG_SECURE` 即使拿到 shell 也读不到。`screencap` 拿到的对应图层依然是黑的，因为 SurfaceFlinger 在合成阶段就排除了 secure layer。想读只能 root，或者走 MediaProjection 的用户显式授权。

把这条写进文档，比吹能力有用。

## 最后

三篇下来，整套东西的全貌是：无障碍树给眼睛，手势和断言给手，Shizuku 把权限抬到接近 adb。

而让它可靠的，从来不是某一层的能力，是三层之间那条边界 —— 每层都知道自己该做什么、不该做什么。

尤其是最后一层。能力越大，越要先写清楚「什么情况下不许动」。

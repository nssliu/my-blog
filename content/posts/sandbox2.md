---
title: "沙箱（Sandbox）、二，Java 实现沙箱（Linux + macOS）"
date: "2026-05-24"
excerpt: "让 AI 能执行代码，但永远碰不到宿主机。"
---
# Java 实现沙箱（Linux + macOS）

如果你想用 Java 使用 Agent Sandbox，核心目标其实就一句话：

> “让 AI 能执行代码，但永远碰不到宿主机。”

重点不是“运行代码”。

而是：

```text
怎么安全地运行代码
```

---

# 一、整体架构

我比较推荐这种结构：

```text
                ┌─────────────────┐
                │   Agent / LLM   │
                └────────┬────────┘
                         │
                  Tool Call
                         │
                ┌────────▼────────┐
                │ SandboxManager  │
                └────────┬────────┘
                         │
        ┌────────────────┼────────────────┐
        │                │                │
 ┌──────▼──────┐ ┌──────▼──────┐ ┌──────▼──────┐
 │Filesystem   │ │ Network     │ │ Process     │
 │Isolation    │ │Isolation    │ │Isolation    │
 └──────┬──────┘ └──────┬──────┘ └──────┬──────┘
        │               │               │
   Linux/macOS     Proxy Layer      Namespace
```

Java 本身不负责隔离。

Java 更像：

```text
控制层（Runtime Orchestrator）
```

真正隔离还是靠：

* Linux namespace
* seccomp
* bubblewrap
* macOS sandbox-exec / seatbelt

---

# 二、推荐模块划分

建议拆成：

```text
sandbox-runtime/
├── sandbox-core
├── sandbox-linux
├── sandbox-macos
├── sandbox-network
├── sandbox-process
├── sandbox-policy
└── sandbox-api
```

---

# 三、核心对象设计

# 1. SandboxConfig

这是整个沙箱配置核心。

```java
public class SandboxConfig {

    private List<String> writablePaths;

    private List<String> readablePaths;

    private List<String> allowedDomains;

    private boolean networkEnabled;

    private int cpuLimit;

    private int memoryLimitMb;

    private int timeoutSeconds;

}
```

这个设计很重要。

因为未来：

```text
Agent Runtime
    ↓
生成 Capability
    ↓
动态创建 Sandbox
```

---

# 四、Linux 沙箱方案（重点）

Linux 建议：

# 直接使用 bubblewrap（bwrap）

因为：

* 非 root 可运行
* 成熟
* OCI 之外最轻量
* Firefox Flatpak 也在用
* 启动速度非常快

Anthropic 本质也是类似路线。

---

# 五、Java 调用 bwrap

例如：

```java
public class LinuxSandboxRunner {

    public Process start(Path workspace) throws IOException {

        List<String> cmd = List.of(
                "bwrap",
                "--ro-bind", "/usr", "/usr",
                "--ro-bind", "/lib", "/lib",
                "--ro-bind", "/lib64", "/lib64",
                "--bind", workspace.toString(), "/workspace",
                "--tmpfs", "/tmp",
                "--chdir", "/workspace",
                "--unshare-net",
                "--unshare-pid",
                "--die-with-parent",
                "bash"
        );

        return new ProcessBuilder(cmd)
                .directory(workspace.toFile())
                .start();
    }
}
```

这里其实已经完成：

* 文件系统隔离
* PID 隔离
* 网络隔离
* 临时目录隔离

---

# 六、文件系统隔离原理

核心其实是：

```bash
--ro-bind
--bind
```

比如：

```bash
--ro-bind /usr /usr
```

意思：

```text
只读映射系统目录
```

而：

```bash
--bind workspace /workspace
```

意味着：

```text
只有 workspace 可写
```

所以 AI：

```bash
rm -rf /
```

其实删不掉宿主机。

因为：

它看到的是“映射后的世界”。

---

# 七、网络隔离（关键）

不要直接让 Agent 联网。

建议：

# 双层设计

---

# 第一层

直接：

```bash
--unshare-net
```

彻底禁网。

---

# 第二层（推荐）

给 AI 提供：

# Proxy Gateway

架构：

```text
Sandbox
   ↓
HTTP Proxy
   ↓
Domain Allow List
   ↓
Internet
```

例如：

```yaml
allowedDomains:
  - github.com
  - pypi.org
  - npmjs.org
```

Java 可以直接做：

```text
Netty Proxy
```

或者：

```text
LittleProxy
```

---

# 八、为什么不用 iptables

因为 AI Agent 的行为是：

```text
“我要访问 github”
```

而不是：

```text
“我要访问 140.82.112.3”
```

所以：

# 域名级控制

更适合 Agent Runtime。

这也是 Anthropic 的思路。

---

# 九、macOS 沙箱方案

macOS 没有 namespace。

所以：

# 只能依赖 seatbelt

也就是：

```bash
sandbox-exec
```

虽然 Apple 标记 deprecated。

但现在很多工具还在用。

---

# 十、macOS Policy

比如：

```scheme
(version 1)

(deny default)

(allow file-read*)

(allow file-write*
    (subpath "/tmp")
    (subpath "/workspace"))

(deny network*)
```

Java：

```java
ProcessBuilder pb = new ProcessBuilder(
        "sandbox-exec",
        "-p",
        policy,
        "bash"
);
```

---

# 十一、统一抽象（重点）

不要：

```java
if linux...
if mac...
```

到处判断。

应该：

```java
public interface SandboxProvider {

    SandboxSession create(SandboxConfig config);

}
```

实现：

```text
LinuxSandboxProvider
MacSandboxProvider
```

然后：

```java
SandboxProvider provider =
        SandboxProviderFactory.detect();
```

这样以后：

* Docker
* Firecracker
* gVisor

都能扩展。

---

# 十二、进程控制（很关键）

AI 很容易：

```python
while True:
    pass
```

或者：

```python
os.fork()
```

所以必须：

# 资源限制

Linux：

建议：

```text
cgroup v2
```

控制：

* CPU
* Memory
* Process Count

Java 可以：

```text
直接操作 /sys/fs/cgroup
```

或者调用：

```bash
systemd-run
```

---

# 十三、超时控制

一定要有：

```java
process.waitFor(timeout, TimeUnit.SECONDS)
```

超时：

```java
process.destroyForcibly();
```

否则 Agent 非常容易跑飞。

---

# 十四、stdout/stderr 流式返回

Claude Code 那种体验。

本质：

```text
PTY + 流式 IO
```

Java 推荐：

# pty4j

JetBrains 同款。

---

# 十五、真正高级的地方

如果你想做成：

```text
Claude Code / Cursor / Devin
```

级别。

重点已经不是“执行”。

而是：

# Runtime 管理

例如：

---

# 1. Workspace 生命周期

```text
Task
  ↓
Workspace
  ↓
Sandbox
  ↓
Destroy
```

---

# 2. Snapshot

Agent 执行失败：

```text
恢复到某个状态
```

---

# 3. Event Log

记录：

```text
bash
stdout
stderr
tool call
file change
```

用于：

* Replay
* Debug
* Audit

---

# 4. Capability 权限模型

例如：

```json
{
  "filesystem": ["workspace"],
  "network": ["github.com"],
  "tools": ["bash", "python"]
}
```

不要让 Agent 拥有：

```text
无限 bash 权限
```

---

# 十六、推荐最终方案（生产可用）

如果你真准备做。

我建议：

| 层               | 技术                   |
| --------------- | -------------------- |
| Runtime         | Java                 |
| Linux Sandbox   | bubblewrap           |
| macOS Sandbox   | sandbox-exec         |
| Resource Limit  | cgroup v2            |
| Terminal        | pty4j                |
| Network Control | HTTP Proxy           |
| File Isolation  | bind mount           |
| Event Stream    | WebSocket            |
| Workspace       | task-based directory |

---

# 十七、未来升级路线

后面还能继续升级：

| 阶段 | 技术                 |
| -- | ------------------ |
| V1 | bwrap              |
| V2 | Rootless Docker    |
| V3 | gVisor             |
| V4 | Firecracker        |
| V5 | MicroVM + Snapshot |

---

你会发现：

Anthropic sandbox-runtime 真正重要的，不是某个技术。

而是：

# “AI Runtime 的安全边界”

因为 Agent 最大的问题，从来不是：

```text
会不会写代码
```

而是：

```text
写出来的代码，敢不敢执行
```

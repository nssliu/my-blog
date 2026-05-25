---
title: "沙箱（Sandbox）、一"
date: "2026-05-24"
excerpt: "给程序关进一个受限制的小黑屋里运行。"
---
沙箱（Sandbox），你可以理解成：

> “给程序关进一个受限制的小黑屋里运行。”

这个概念其实很早就有了，只是现在 AI Agent 火了以后，又重新变成核心技术。

比如现在很多 AI 已经不只是聊天了，它会：

* 执行 bash
* 写代码
* 改文件
* 跑 python
* git clone
* npm install
* 调接口

那问题就来了：

如果模型哪天抽风了，执行：

```bash
rm -rf /
```

或者偷偷：

```bash
cat ~/.ssh/id_rsa
```

怎么办？

所以必须有一个“隔离环境”。

---

Anthropic 的 sandbox-runtime，本质上就是：

> 专门给 AI Agent 准备的“安全执行环境”。

它的思路其实挺有代表性的。

很多人第一反应会觉得：

```text
沙箱 = Docker
```

但 Anthropic 并不是完全走 Docker 那套。

它更偏：

> “直接利用操作系统底层能力做隔离”

这样会更轻、更快。

因为 AI Agent 的任务有个特点：

* 创建频率特别高
* 生命周期很短
* 一个任务跑完马上销毁
* 非常强调启动速度

如果每次都起完整 Docker，其实成本挺高。

所以他们大量用了：

Linux：

* namespace
* seccomp
* bubblewrap（bwrap）

macOS：

* seatbelt

这些其实都是操作系统原生能力。

---

最核心的其实有三层。

# 1. 文件系统隔离

这是最重要的。

Agent 运行时，并不是直接看到你的真实机器。

它看到的是：

```text
/workspace
/tmp
```

这种“假的文件系统视图”。

有点像：

你给它搭了一个样板房。

它以为自己在整个系统里。

其实只能在指定目录活动。

比如：

```bash
echo hi > test.txt
```

可能允许。

但：

```bash
cat ~/.ssh/id_rsa
```

直接拒绝。

因为真实 home 目录根本没映射进去。

这背后本质就是：

```text
mount namespace + 文件系统映射
```

---

# 2. 网络隔离

Anthropic 这里有个挺有意思的设计。

很多人以为禁网就是：

```text
iptables
```

但他们更偏向：

```text
代理层控制
```

也就是：

Agent 发出的网络请求，先经过一个代理。

代理再判断：

* 这个域名允不允许
* 这个端口能不能访问
* 是不是 HTTPS
* 是否在白名单

比如：

允许：

```text
github.com
pypi.org
npmjs.org
```

那：

```bash
pip install
npm install
git clone
```

都没问题。

但如果模型突然：

```bash
curl evil.com
```

代理直接拦截。

这个思路其实很适合 AI Agent。

因为 AI 的联网行为，很多时候是“语义级”的。

按域名控制，比按 IP 更合理。

---

# 3. 进程隔离

这个就是防止“逃逸”。

比如：

Agent 能不能看到宿主机进程？

能不能 kill 别的进程？

能不能 fork 炸机器？

所以会用：

* PID namespace
* User namespace
* seccomp

限制系统调用。

比如：

* 禁止 mount
* 禁止 ptrace
* 禁止提权
* 禁止访问内核能力

本质上：

> Agent 拿到的是一个“阉割版 Linux”。

---

Anthropic 这个项目里，我觉得最有意思的地方其实不是隔离本身。

而是：

# 它是专门按 AI 的特点设计的。

传统沙箱：

```text
非法行为 -> 直接 kill
```

但 AI Agent 不一样。

Anthropic 的思路更像：

```text
非法行为
    ↓
返回结构化错误
    ↓
让模型自己重新规划
```

比如：

Agent 想读：

```bash
~/.ssh/id_rsa
```

系统返回：

```json
{
  "type": "sandbox_violation",
  "reason": "permission denied"
}
```

然后模型会意识到：

```text
这个路径不能访问
```

接着改方案。

这个其实特别关键。

因为：

> AI Agent 不是“固定程序”，而是“会调整策略的执行者”。

所以现代 Agent Runtime 的设计，已经不是传统“安全防护”思维了。

而是：

# “安全 + 可反馈 + 可自修正”

---

如果把整个 Agent 系统拆开。

其实会变成：

```text
用户
  ↓
LLM
  ↓
Agent Runtime
  ↓
Sandbox
  ↓
真实执行环境
```

这里：

# Sandbox 更像 AI 世界里的“操作系统内核”。

它负责：

* 权限
* 隔离
* 资源控制
* 安全
* 生命周期

而 Agent 只是“用户态程序”。

这也是为什么现在：

* Anthropic
* OpenAI
* Cursor
* Devin
* Claude Code

都在疯狂搞 Runtime。

因为真正难的已经不是“模型会不会说”。

而是：

# “模型敢不敢安全地执行”。

# luci-app-srun 设计规范文档

| 项目 | 内容 |
| --- | --- |
| 文档名称 | `luci-app-srun` 设计与实现规范（Design & Implementation Specification） |
| 目标程序 | [`zu1k/srun`](https://github.com/zu1k/srun)（SRun/深澜 Portal 认证命令行工具） |
| 交付物 | OpenWrt/LuCI 应用包 `luci-app-srun`（源码仓库建议名 `openwrt-luci-app-srun`） |
| 上游约定来源 | [LuCI Wiki](https://github.com/openwrt/luci/wiki)、[LuCI JS API](https://openwrt.github.io/luci/jsapi/)、`openwrt/luci` 的 `applications/luci-app-example` |
| 版本 | v1.0 |
| 日期 | 2026-10-09 |
| 许可证 | 本应用（包装层）Apache-2.0；被包装的 `srun` 二进制为 GPL-3.0 |

---

## 1. 范围

本规范定义 `luci-app-srun` 这一 LuCI 应用包的设计目标、包元数据、目录布局、UCI 配置模型、
运行时配置生成、procd 服务生命周期、状态接口、Web UI、ACL 安全模型、国际化、构建打包、
兼容性、错误处理与验收标准。

目标是让路由器在 LuCI 中即可完成 SRun 校园网 Portal 的登录/注销、多拨账号管理、服务启停与
状态查看，而**不修改上游 `srun` 二进制的命令行与配置语义**。

本规范**不**定义 `srun` 二进制自身的编译（由上游仓库与构建流水线负责），只约定对它的调用契约。

---

## 2. 引用与术语

### 2.1 引用

- LuCI 仓库与示例：`https://github.com/openwrt/luci`，`applications/luci-app-example`
- LuCI 客户端 JS API：`https://openwrt.github.io/luci/jsapi/`（`view`、`form`、`uci`、`rpc`、`fs`、`poll`、`ui`）
- OpenWrt 包与 UCI 约定：`procd` 服务、`uci-defaults`、`rpcd` ACL（`/usr/share/rpcd/acl.d/*.json`）、
  `menu.d`（`/usr/share/luci/menu.d/*.json`）
- 上游 CLI：`srun login|logout`，全局配置模板见上游 `config.json`

### 2.2 术语

| 术语 | 含义 |
| --- | --- |
| `srun` | 上游认证二进制，`/usr/bin/srun` |
| UCI | OpenWrt 统一配置接口，配置文件位于 `/etc/config/*` |
| ACL | `rpcd` 权限声明，决定 Web UI 可读写的 ubus/UCI/file 资源 |
| section | UCI 配置节，本节中 `main` 为全局节，`login` 为账号节 |
| sid | UCI section 标识符 |
| portal | SRun 认证服务器（`server`，形如 `http://10.0.0.1`） |

### 2.3 一致性关键字

- **必须 / MUST**：必须遵守，否则视为不合规。
- **应该 / SHOULD**：推荐遵守，偏离需说明理由。
- **可以 / MAY**：可选。

---

## 3. 总体架构

```
┌─────────────────────────────────────────────────────────────┐
│ LuCI Web UI (htdocs/luci-static/resources/view/srun/*.js)     │
│   overview.js ─ status/动作      config.js ─ UCI 表单         │
│   log.js      ─ 日志            共用: rpc(luci.srun)、uci     │
└───────────────┬─────────────────────────────────────────────┘
                │ ubus / uci / fs（经 rpcd ACL 授权）
┌───────────────▼─────────────────────────────────────────────┐
│ rpcd 插件 /usr/libexec/rpcd/luci.srun（ubus: luci.srun） │
│   status / netif / login / logout / tail_log / service 控制转发  │
└───────────────┬─────────────────────────────────────────────┘
                │ 读写运行时状态、调用 init 脚本
┌───────────────▼─────────────────────────────────────────────┐
│ procd 服务 /etc/init.d/srun  → /usr/libexec/srun-daemon      │
│   srun-generate-config (UCI → /var/run/srun/user-<sid>.json) │
│   循环调用 /usr/bin/srun login -c <json> / logout            │
│   成功判定后写 /var/run/srun/state.tsv                       │
└─────────────────────────────────────────────────────────────┘
```

设计原则：

1. **薄包装**：Web UI 与 init 脚本只编排 `srun` 已有的 `login`/`logout`/`-c config.json` 能力。
2. **配置单一真源**：唯一可编辑真源是 `/etc/config/srun`；运行时 JSON 由它派生，PROHIBITED 手工维护。
3. **失败可观察**：所有结果落到 `state.tsv` 与 syslog（tag `srun`），UI 只读取状态而不猜测。
4. **最小权限**：ACL 仅授予 `srun` 相关 UCI/ubus/file。

---

## 4. 包与元数据规范

`luci-app-srun/Makefile` **必须**遵循 LuCI 应用模板：

```makefile
# SPDX-License-Identifier: Apache-2.0
include $(TOPDIR)/rules.mk

LUCI_TITLE:=LuCI support for SRun/深澜 portal authentication
LUCI_DEPENDS:=+luci-base +srun
LUCI_PKGARCH:=all
PKG_LICENSE:=Apache-2.0
PKG_MAINTAINER:=<maintainer>
PKG_VERSION:=$(shell ...)   # 可选，默认继承 feed

include ../../luci.mk

# call BuildPackage - OpenWrt buildroot signature
```

规范要求：

- `LUCI_NAME` **必须**由目录名推导为 `luci-app-srun`（目录即 `luci-app-srun`）。
- `LUCI_DEPENDS` **必须**至少包含 `+luci-base`、`+srun`；`srun` 作为独立包由上游/入口 feed 提供。
  - ubus 对象 `luci.srun` 由 `/usr/libexec/rpcd/luci.srun` 提供，属于 rpcd **内置**的 shell 插件机制（无需 `rpcd-mod-ucode`，兼容性优于 ucode 插件）；rpcd 仅在启动时扫描该目录，安装后 **必须** 重启 `rpcd`。
- 包 **必须**提供 postinst：安装时重启 `rpcd`（使插件立即生效）、执行 `uci-defaults`、`enable` 服务；**不**强制拉取登录（待用户在网页填写配置后由 `config.change` 触发）。
- `LUCI_PKGARCH:=all` **必须**存在（纯脚本包）。
- 若 `srun` 需 TLS/HTTPS portal，**应该**通过构建变体或 `srun` 的 `tls` feature 提供，并在 README 说明。
- **禁止**在本包内重新编译 `srun` 二进制。

---

## 5. 目录结构规范

**必须**严格采用 `openwrt/luci` 约定的布局：

```
luci-app-srun/
├── Makefile
├── README.md
├── po/
│   ├── templates/srun.pot
│   └── zh_Hans/srun.po
├── htdocs/
│   └── luci-static/resources/view/srun/
│       ├── overview.js
│       ├── config.js
│       └── log.js
└── root/
    ├── etc/
    │   ├── uci-defaults/80_srun
    │   └── init.d/srun
    └── usr/
        ├── libexec/
        │   ├── srun-daemon
        │   ├── srun-generate-config
        │   └── rpcd/luci.srun
        └── share/
            ├── luci/menu.d/luci-app-srun.json
            └── rpcd/acl.d/luci-app-srun.json
```

- 视图目录名 **必须**为去掉 `luci-app-` 前缀的应用名（`srun`），与 `menu.d` 的 `path` 对应。
- `/etc/config/srun` **应该**由 `uci-defaults` 创建（与 `luci-app-example` 一致），避免 conffiles 冲突。
- **禁止**在 `root/` 下放置与登录无关的二进制。

---

## 6. UCI 配置规范

配置文件：`/etc/config/srun`。

### 6.1 全局节（type `srun`，name `main`）

| 选项 | 类型 | 默认 | 对应 `srun` | 说明 |
| --- | --- | --- | --- | --- |
| `enabled` | bool | `1` | — | 服务是否随开机/触发启动 |
| `server` | string | 编译期 `AUTH_SERVER_IP` 对应值 | `-s/--server`、`server` | portal 基址，必须含 scheme |
| `binary` | string | `/usr/bin/srun` | — | 允许覆盖二进制路径 |
| `detect_ip` | bool | `0` | `detect_ip` / `-d` | 由 portal 自动推断授权 IP |
| `strict_bind` | bool | `0` | `strict_bind` | 严格绑定源 IP |
| `double_stack` | bool | `0` | `double_stack` | 双栈 |
| `retry_delay` | int(ms) | `1000` | `retry_delay` | 单次登录重试间隔 |
| `retry_times` | int | `3` | `retry_times` | 单轮重试次数 |
| `n` | int | `200` | `-n`/`n` | 参数 n |
| `type` | int | `1` | `--type`/`type` | 认证类型 |
| `acid` | int | `12` | `--acid`/`acid` | AC ID，按校区不同 |
| `os` | string | `Windows 10` | `--os`/`os` | 上报 OS |
| `name` | string | `Windows` | `--name`/`name` | 上报设备名 |
| `interval` | int(s) | `30` | — | 守护循环间隔（重新登录巡检） |
| `trigger_iface` | string | `wan` | — | 该逻辑接口 up 时触发 reload |
| `check_interval` | int(s) | `60` | — | 在线探测间隔，0 表示随 `interval` |
| `log_level` | enum | `info` | — | `error|warn|info|debug` |

### 6.2 账号节（type `login`，name 建议为逻辑接口名）

| 选项 | 类型 | 必填 | 对应 `srun` | 说明 |
| --- | --- | --- | --- | --- |
| `enabled` | bool | 否，默认 `1` | — | 是否启用该账号 |
| `username` | string | 是 | `username` | 支持运营商后缀，如 `@cmcc` |
| `password` | string | 是 | `password` | 明文存储（见 §12.3） |
| `ip` | string | 二选一 | `ip` | 指定授权 IP |
| `if_name` | string | 二选一 | `if_name` | 指定网卡，运行时解析其 IPv4 |
| `detect_ip` | bool | 否 | `detect_ip` | 覆盖全局 |
| `comment` | string | 否 | — | 备注 |

约束：

- `ip` 与 `if_name` **应该**至少提供一个；两者都缺省且全局 `detect_ip=0` 时，**必须**在启动时记录
  warning 并按 `detect_ip=1` 处理。
- `username`/`password` 缺失时该账号 **必须**被跳过并记 warning，不得使整个服务失败。
- UCI 选项名 `type` 合法（与 section type 概念不同）。

### 6.3 默认文件（`root/etc/uci-defaults/80_srun`）

**必须**幂等创建：

```sh
#!/bin/sh
[ -f /etc/config/srun ] || touch /etc/config/srun
uci -q get srun.main >/dev/null || uci set srun.main=srun
uci -q set srun.main.enabled='1'
uci -q set srun.main.detect_ip='1'
uci -q set srun.main.interval='30'
uci -q commit srun
exit 0
```

---

## 7. 运行时配置生成

`srun-generate-config`（ucode）**必须**：

1. 读取 `main` 全局节与被启用的 `login` 账号节。
2. 为每个账号生成独立文件 `/var/run/srun/user-<sid>.json`，schema 与上游 `config.json` 一致：

```json
{
  "server": "http://10.0.0.1",
  "detect_ip": false,
  "strict_bind": false,
  "double_stack": false,
  "retry_delay": 1000,
  "retry_times": 3,
  "n": 200,
  "type": 1,
  "acid": 12,
  "os": "Windows 10",
  "name": "Windows",
  "users": [ { "username": "u@cmcc", "password": "p", "ip": "10.1.2.3" } ]
}
```

3. 将 `if_name` 解析为当前 IPv4 后写入 `ip`；解析不到时保留 `if_name`，由 `srun` 自行处理。
4. 目录 `/var/run/srun` **必须**权限 `0700`，生成文件 **必须** `0600`（含明文口令）。
5. 生成 **必须**原子化：先写临时文件再 `rename`；生成失败时 **必须**保留旧的 JSON。
6. 用户名以 `-` 或特殊字符开头时 JSON 转义 **必须**正确（由 ucode 序列化保证，禁止 shell 拼接）。

> 说明：使用 `-c` 而非命令行参数，避免口令出现在 `ps`；每账号独立进程，互不阻断。

---

## 8. 守护与生命周期（procd）

`/etc/init.d/srun` **必须**基于 procd：

```sh
#!/bin/sh /etc/rc.common
USE_PROCD=1
START=95
STOP=10

start_service() {
	. /lib/functions.sh
	config_load srun
	config_get_bool enabled main enabled 1
	[ "$enabled" = "1" ] || return 0

	/usr/libexec/srun-generate-config || { logger -t srun "config generation failed"; }

	procd_open_instance
	procd_set_param command /usr/libexec/srun-daemon
	procd_set_param respawn 3600 5 0
	procd_set_param stdout 1
	procd_set_param stderr 1
	procd_set_param file /etc/config/srun
	procd_close_instance
}

reload_service() { stop; start; }
service_triggers() {
	procd_add_reload_trigger srun
	procd_add_interface_trigger "interface.*" "wan" /etc/init.d/srun reload
}
```

要求：

- 守护脚本 `/usr/libexec/srun-daemon` **必须**：

```
for each user-<sid>.json:
    out=$(binary login -c file)
    根据 access_token 判定成功/失败 → 记录 state
    logger -t srun "..."
sleep interval
```

- 成功判定 **必须**基于可观察输出：匹配 `access_token:` 后非空字符串；**禁止**仅以进程退出码判定
  （上游在登录失败时仍返回 0）。应同时保留完整输出到 syslog（tag `srun`）。
- 收到 `SIGTERM` **应该**立即结束当前 `sleep`（用 `trap`），保证 stop 及时。
- 支持动作：`start`、`stop`、`restart`、`reload`、`enable`、`disable`。
- 当全局 `enabled=0` 时 `start_service` **必须**直接返回且不启动进程。
- **必须**避免重复实例：`procd` 单实例 + `respawn`，不得在多个触发点并发启动。

### 8.1 账号注销

- 每个账号节提供 `logout` 能力：调用 `srun logout -s <server> -u <username> -i <ip> --acid <acid>`。
- 注销时 IP **必须**取运行时解析值（`if_name` 先解析为 IPv4）。

---

## 9. 状态与可观测性

### 9.1 状态文件

守护进程 **必须**维护 `/var/run/srun/state.tsv`，每行制表符分隔：

```
sid<TAB>username<TAB>ip<TAB>ok(0|1)<TAB>epoch<TAB>message
```

- 写入 **必须**原子（写临时文件 + `mv`）。
- `ok=1` 表示最近一次登录成功（探测到 access_token）；`ok=0` 表示失败/离线。
- 该文件是 UI 状态**唯一**真源，避免解析上游 `{:#?}` 调试输出。

### 9.2 日志

- 统一使用 `logger -t srun`，级别映射到 syslog。
- 日志 **必须**通过 `ubus call log read` 或 `logread` 读取，UI 侧按 tag 过滤。
- 日志 **禁止**输出明文口令（上游会打印 `login user: {:#?}`，通常含明文；UI 展示时按需裁剪）。

### 9.3 在线探测（可选增强）

当 `check_interval>0` 且需要独立于登录动作判断在线时，**可以**请求
`{server}/cgi-bin/get_challenge?callback=sdu&username=<u>&ip=<ip>&_=<epoch>`，
以响应中的 `online_ip` 是否非空作为在线依据。该语义随校区实现而异，**必须**可关闭。

---

## 10. RPC（ubus）接口

rpcd 插件 `/usr/libexec/rpcd/luci.srun` **必须**导出 ubus 对象 `luci.srun`：

| 方法 | 入参 | 返回 | 权限 |
| --- | --- | --- | --- |
| `status` | `{}` | `{ enabled, running, uptime, users:[{sid,username,ip,ok,ts,msg}], interfaces:[...] }` | read |
| `netif` | `{}` | `{ devices:[string], interfaces:[string] }` | read |
| `tail_log` | `{lines?:int}` | `{ lines:[string] }` | read |
| `action` | `{action:"start"\|"stop"\|"restart"\|"reload"}` | `{code,stdout,stderr}` | write |
| `login` | `{sid?:string}` | `{code,stdout,stderr}` | write |
| `logout` | `{sid?:string}` | `{code,stdout,stderr}` | write |

要求：

- `running` **必须**由 `ubus call service list '{"name":"srun"}'` 判定，而非 `pgrep`。
- `action` **必须**调用 `/etc/init.d/srun <action>`。
- `login`/`logout` 未给 `sid` 时对全部启用账号执行。
- `tail_log` 取行数 **不得**使用 shell 保留变量名 `LINES`/`ROWS`（终端尺寸变量，可能被置为 `0`/空导致 `tail -n` 返回空）；必须做纯数字校验并夹在 `[1,5000]`。优先 `logread -e srun`，不得依赖 GNU-only 的 `grep -a`。
- `netif` 必须自行从 `/sys/class/net`（真实网卡，排除 `lo`）与 `uci show network` 中 `=interface` 的节名取值；前端 **不得**依赖 `network.getDevices()` 的返回形状（部分分支返回数组，导致下拉只有 0..9）。
- 前端 `E()` **不会**展平嵌套数组：多行 `<tr>` 必须作为兄弟节点逐个 `push` 进 children 数组，不能把数组当单个 child 传入（否则渲染成 `[object HTMLTableRowElement]`）。
- 返回结构 **必须**为 JSON 对象，字段缺失用 `null`，不得返回裸字符串。
- 命令执行 **必须**有超时（建议 20s），超时返回 `code=-1` 与说明。
- 状态读取与命令执行不得阻塞超过 1s（`status` 不做网络请求，探测在守护侧）。

---

## 11. Web UI 规范

### 11.1 菜单（`root/usr/share/luci/menu.d/luci-app-srun.json`）

```json
{
  "admin/services/srun":        { "title": "SRun", "order": 40,
    "action": { "type": "firstchild" },
    "depends": { "acl": [ "luci-app-srun" ] } },
  "admin/services/srun/overview": { "title": "Overview", "order": 1,
    "action": { "type": "view", "path": "srun/overview" } },
  "admin/services/srun/config":   { "title": "Configuration", "order": 2,
    "action": { "type": "view", "path": "srun/config" } },
  "admin/services/srun/log":      { "title": "Log", "order": 3,
    "action": { "type": "view", "path": "srun/log" } }
}
```

- 一级入口 **必须**在 `admin/services/` 下。
- `depends.acl` **必须**指向本应用 ACL 名 `luci-app-srun`，实现按权限隐藏。

### 11.2 视图实现约定

所有视图 **必须**为 ES5 风格 LuCI 视图（`'require view'` 等），使用 Tab 缩进，遵循
`luci-app-example` 模式：

- `config.js`：使用 `form.Map('srun', …)` + `form.TypedSection`（全局）+ `form.TableSection`（账号），
  字段校验：
  - `server`：非空、`^https?://`。
  - `ip`：`form.Value` + `datatype:'ip4addr'`，`depends` 于 `!if_name`。
  - `if_name`：提供从 `network.getDevices()`/`L.network` 枚举的下拉（`form.ListValue`/`Combobox`）。
  - `password`：`o.password = true`。
  - 数值项：`datatype:'uinteger'`。
- `overview.js`：`load()` 通过 `rpc.declare({object:'luci.srun', method:'status'})` 取状态，
  `render()` 用 `E()` 渲染卡片与按钮；按钮调用 `action`/`login`/`logout`，完成后 `ui.addNotification`。
  服务状态 **必须**区分 running/stopped，并显示每账号 `ok` 与时间。
- `log.js`：`poll.add()` 周期拉取 `tail_log`，用 `<pre>` 展示；提供暂停与自动滚动。
- 所有面向用户字符串 **必须**用 `_()` 包裹。
- **禁止**直接拼接 HTML 注入动态值（注意 `srun` 输出转义，避免 XSS）。

### 11.3 与保存/应用的集成

- `config.js` 使用 `form.Map` 默认的 Save/Apply 行为；Apply 触发 `uci.apply()`，
  **应该**在 apply 后调用 `luci.srun.action {action:"reload"}` 使运行时配置重生成。
- `overview.js` 的日志/状态刷新 **禁止**在保存流程中阻塞。

---

## 12. ACL 与安全

`root/usr/share/rpcd/acl.d/luci-app-srun.json` **必须**为：

```json
{
  "luci-app-srun": {
    "description": "Grant access to the SRun LuCI application",
    "read": {
      "uci": [ "srun" ],
      "ubus": {
        "service": [ "list" ],
        "log": [ "read" ],
        "network.interface": [ "dump", "status" ],
        "network.device": [ "status" ],
        "luci.srun": [ "status", "netif", "tail_log" ]
      },
      "file": {
        "/etc/init.d/srun": [ "exec" ],
        "/usr/bin/srun": [ "exec" ],
        "/var/run/srun/state.tsv": [ "read" ]
      }
    },
    "write": {
      "uci": [ "srun" ],
      "ubus": { "luci.srun": [ "action", "login", "logout" ] },
      "file": {
        "/etc/init.d/srun": [ "exec" ],
        "/usr/bin/srun": [ "exec" ]
      }
    }
  }
}
```

安全要求：

1. **最小权限**：不得授予通用 `uci`/`file.exec` 之外的无关资源。
2. **口令**：明文存于 `/etc/config/srun`，由 ACL `uci:[srun]` 限定；运行时 JSON `0600`。
   UI 展示 **应该**提供“显示/隐藏”，默认脱敏。
3. `server` 与 `username` 若来自外部，渲染时 **必须**转义，防止存储型 XSS（参考 `https-dns-proxy` 教训）。
4. rpcd 插件执行外部命令时 **必须**使用固定路径，不得经由 shell 拼接未引用的值。
5. 当 `server` 为 `https://` 时，README **必须**提示需启用 TLS 的 `srun` 构建。

---

## 13. 国际化

- 所有 UI/菜单/校验字符串 **必须**用 `_()`；菜单 `title` 为默认英文。
- `po/templates/srun.pot` **应该**由 `./build/i18n-scan.pl applications/luci-app-srun` 生成。
- 至少提供 `po/zh_Hans/srun.po`。
- 翻译可在构建后由 i18n-scan 重建，**禁止**手工编辑 `.pot` 的 msgid。

---

## 14. 构建与打包

标准 OpenWrt 流程（适用于本地 feed）：

```sh
# 将本包放入 feeds（或 src-link 指向本地）
make menuconfig            # 选 LuCI → Applications → luci-app-srun（模块化 'm'）
make tools/install
make toolchain/install
make package/luci-app-srun/compile
# 产物：bin/packages/<arch>/luci/luci-app-srun_*.ipk
```

- 以 `src-link` 方式接入自定义 feed 时，**禁止**改动上游 `src-git luci`。
- 发布 **应该**同时提供 SDK 构建产物与版本校验值。
- `LUCI_MINIFY_JS` 默认开启；源码 **应该**保持可读并以 Tab 缩进。

---

## 15. 兼容性

- 目标 LuCI：client-side JS 架构（OpenWrt 21.02+，建议 23.05+）。
- 目标 `srun`：≥ 0.6.x；配置 JSON 字段以 §7 为准。
- 上游 `srun` 未实现 `--version`，版本探测 **应该**通过包版本（`opkg status srun`）而非二进制。
- 上游 `srun` 无状态输出接口，故本规范以“守护侧成功判定 + state.tsv”为准；
  若上游新增 JSON 输出，**可以**在守护脚本中优先采用。
- `type`/`n`/`acid`/`os`/`name` 默认值随校区不同，UI **必须**允许覆盖。

---

## 16. 错误处理

| 情形 | 行为 |
| --- | --- |
| `binary` 不存在 | 启动失败并记 `error`；UI 状态卡显示明确原因 |
| `server` 为空/非法 | `config.js` 校验拦截；守护端生成失败保留旧配置 |
| 账号缺 `username`/`password` | 跳过该账号并 warning，其余继续 |
| 账号缺 `ip`/`if_name` 且非 detect | 视为 detect，记 warning |
| portal 不可达 | 按 `retry_times`/`retry_delay` 重试，失败写 `ok=0` |
| 登录失败（无 access_token） | 记 `ok=0`，日志含原始输出，不崩溃 |
| 配置生成失败 | 保留上一次运行时 JSON，记录 error，继续使用 |
| ubus 调用超时 | 返回 `code=-1`，UI 通知，不改变服务状态 |

---

## 17. 验收测试

**必须**逐项可复现验证：

1. 构建：`make package/luci-app-srun/compile` 成功，产出 ipk。
2. 安装后 `/etc/config/srun` 存在，`/etc/init.d/srun enabled` 可执行。
3. `uci set` 全局与账号项后，`/usr/libexec/srun-generate-config` 生成的 JSON 与 UCI 一致，
   权限 `0600`，字段与上游 `config.json` 完全匹配（用 `jq`/`python` 校验）。
4. 账号禁用/启用时，运行时 JSON 中对应 `users` 项随之增删。
5. 启动服务后 `ubus call luci.srun status` 返回 `running=true` 及每账号状态；
   stop 后为 `false`。
6. 在真实校园网环境登录成功，`state.tsv` 对应 `ok=1`；错误口令时 `ok=0` 且不崩溃。
7. `logout` 后 portal 侧断线。
8. ACL：创建仅具 `luci-app-srun` 权限的用户，可完成配置与启停；无权限资源报 Access denied。
9. `po/` 可被 i18n 扫描；`zh_Hans` 翻译生效。
10. 弱网/断网重启后，服务自动恢复巡检。

测试脚本 **应该**存放于 `temp/<task>/`（本仓库约定）或包内 `tests/`，结果以命令输出为准。

---

## 18. 附录 A：关键文件参考实现

见同目录 `luci-app-srun/`：

```
luci-app-srun/
├── Makefile
├── README.md
├── po/{templates/srun.pot, zh_Hans/srun.po}
├── htdocs/luci-static/resources/view/srun/{overview,config,log}.js
└── root/
    ├── etc/uci-defaults/80_srun
    ├── etc/init.d/srun
    ├── usr/libexec/srun-daemon
    ├── usr/libexec/srun-generate-config
    ├── usr/share/luci/menu.d/luci-app-srun.json
    ├── usr/libexec/rpcd/luci.srun
    └── usr/share/rpcd/acl.d/luci-app-srun.json
```

参考实现是**规范性示例**；与本文冲突时以本文为准。

## 19. 附录 B：与上游 `srun` 的字段映射

| UCI | `config.json` / CLI | 备注 |
| --- | --- | --- |
| `main.server` | `server` / `-s` | 含 scheme |
| `main.detect_ip` | `detect_ip` / `-d` | bool |
| `main.strict_bind` | `strict_bind` / `--strict-bind` | bool |
| `main.double_stack` | `double_stack` / `--double-stack` | bool |
| `main.retry_delay` | `retry_delay` / `--retry-delay` | ms |
| `main.retry_times` | `retry_times` / `--retry-times` | 次 |
| `main.n` | `n` / `-n` | int |
| `main.type` | `type` / `--type` | int |
| `main.acid` | `acid` / `--acid` | int |
| `main.os` | `os` / `--os` | string |
| `main.name` | `name` / `--name` | string |
| `login.username` | `users[].username` / `-u` | 支持 `@cmcc` 等后缀 |
| `login.password` | `users[].password` / `-p` | 明文 |
| `login.ip` | `users[].ip` / `-i` | IPv4 |
| `login.if_name` | `users[].if_name` | 网卡名，运行时解析 |

---

## 20. 交付产物与 armv8 APK 打包

除 feed 构建（§14）外，本设计提供一个不经 OpenWrt SDK 的交叉构建/打包路径：

- **二进制**：`cargo build --release --target aarch64-unknown-linux-musl`（Rust 自带 self-contained musl + `rust-lld`，无需外部交叉工具链），产出静态 aarch64 ELF。
- **APK 打包**：用 apk-tools 3 的 `apk mkpkg` 生成 v3 格式 `.apk`；`srun` 包 arch 为 `aarch64_cortex-a53`，`luci-app-srun` 为 `noarch`；文件属主固定 root（等价 fakeroot）。
- **索引**：`apk mkndx` 生成 `APKINDEX.tar.gz`。
- 脚本：`scripts/build-apk.sh`；产物：`dist/`；安装说明：`INSTALL.md`。

`apk add` 安装需 `--allow-untrusted`（包未签名）。

---

*文档结束。*

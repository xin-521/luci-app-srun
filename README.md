# openwrt-luci-app-srun

`luci-app-srun` 的**设计规范**与**可编译实现**。用于把 [`zu1k/srun`](https://github.com/zu1k/srun)
（SRun/深澜校园网 Portal 认证 CLI）集成进 OpenWrt 的现代 LuCI（客户端 JS 架构）。

## 文件

- [`SPEC.md`](./SPEC.md) —— 规范文档（评审/实现依据）。
- [`luci-app-srun/`](./luci-app-srun/) —— 实现包，可直接放入 OpenWrt 构建 feed 编译。
- [`dist/`](./dist/) —— 预编译 armv8 APK 产物（见 [`INSTALL.md`](./INSTALL.md)）。
- [`scripts/`](./scripts/) —— 打包脚本与宿主机工具构建说明。

## 预编译产物（armv8 / OpenWrt 25.12+ APK）

| 文件（`dist/`） | 架构 | 说明 |
| --- | --- | --- |
| `srun-0.6.2-r3.apk` | `aarch64_cortex-a53` | armv8 静态 musl 二进制 |
| `luci-app-srun-1.0.8-r2.apk` | `noarch` | LuCI 应用 |
| `APKINDEX.tar.gz` | — | 本地 feed 索引 |

设备上安装（详见 [`INSTALL.md`](./INSTALL.md)）：

```sh
apk add --allow-untrusted ./srun-0.6.2-r3.apk ./luci-app-srun-1.0.8-r2.apk
```

重新构建：

```sh
# 先交叉编译 armv8 二进制
AUTH_SERVER_IP=10.0.0.1 cargo build --release --target aarch64-unknown-linux-musl
sh scripts/build-apk.sh
```

## 构建

```sh
cd openwrt
# 把本仓库目录（含 luci-app-srun/）加入自定义 feed，无需改动上游 src-git luci
echo "src-link custom /path/to/openwrt-luci-app-srun" >> feeds.conf.default
./scripts/feeds update custom && ./scripts/feeds install -a -p custom

make menuconfig            # LuCI -> Applications -> luci-app-srun
make package/luci-app-srun/compile
```

安装后登录 LuCI：菜单 **服务 → SRun**（概览 / 配置 / 日志）。

## 关键设计

- 唯一可编辑真源为 `/etc/config/srun`；运行时 JSON 由 `srun-generate-config` 派生到 `/var/run/srun/`。
- `procd` 守护 `srun-daemon` 周期调用 `srun login -c <per-user.json>`，成功判定写 `state.tsv`。
- Web UI 经 `rpcd` ubus 对象 `luci.srun`（ucode 插件）读取状态、触发动作；ACL 最小授权。
- 支持多拨（多 `login` 账号节）、按网卡/IP 绑定、开机自启与断线巡检。

详见 `SPEC.md`。

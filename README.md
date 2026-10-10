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
| `luci-app-srun-1.0.9-r1.apk` | `noarch` | LuCI 应用 |
| `APKINDEX.tar.gz` | — | 本地 feed 索引 |

> `dist/` 只含本机默认的 armv8 产物；其他架构由 CI 产出（见下节）。

设备上安装（详见 [`INSTALL.md`](./INSTALL.md)）：

```sh
apk add --allow-untrusted ./srun-0.6.2-r3.apk ./luci-app-srun-1.0.9-r1.apk
```

## 多架构构建（GitHub Actions，无需本机工具链）

[`.github/workflows/build-apk.yml`](./.github/workflows/build-apk.yml) 在 Linux runner 上交叉
编译、打包并校验，矩阵覆盖下列 CPU 家族：

| Rust target | OpenWrt 架构 |
| --- | --- |
| `aarch64-unknown-linux-musl` | `aarch64_cortex-a53` |
| `armv7-unknown-linux-musleabihf` | `arm_cortex-a7_neon-vfpv4` |
| `arm-unknown-linux-musleabi` | `arm_arm926ej-s` |
| `mipsel-unknown-linux-musl` | `mipsel_24kc` |
| `mips-unknown-linux-musl` | `mips_24kc` |
| `x86_64-unknown-linux-musl` | `x86_64` |
| `i686-unknown-linux-musl` | `i386_pentium4` |
| `riscv64gc-unknown-linux-musl` | `riscv64_generic` |

- 推 `v*` tag（`git push origin v1.0.9`）会建 Release，附上**全部架构**的 `.apk`、
  裸二进制（文件名带架构后缀）与 `sha256sums`；
- PR 或手动触发（`workflow_dispatch`，可传 `auth_server_ip` / `srun_ref`）只产出 Artifacts。

`AUTH_SERVER_IP` 是**编译期**默认 Portal 地址（`build.rs` 要求），默认 `10.0.0.1`；
设备上仍可用 `/etc/config/srun` 的 `server` 覆盖。

> Rust 对 5 个目标（aarch64/armv7/arm/x86_64/i686）自带 musl 自包含链接；mips/mipsel
> 没有发布 std（用 `-Z build-std`），这三个连同 riscv64 用 musl.cc 工具链做 linker。
>
> 所有目标统一用工具链自带的 `rust-lld` 链接：Ubuntu 的 `/usr/bin/ld` 只支持宿主目标，
> 会拒绝 `--fix-cortex-a53-843419` 这类目标专属选项（这正是 x86_64/i686 能过、其余
> 架构全挂的原因）。
>
> 另有 [`.github/workflows/openwrt-build.yml`](./.github/workflows/openwrt-build.yml)：把本包放进
> 真实 OpenWrt 构建树做编译冒烟测试（慢，约 40 分钟/目标）。

重新构建（本机单架构）：

```sh
# 先在上游 srun 源码目录交叉编译二进制。
# 两个平台都需显式指定 rust-lld：mingw 的 ld 是 PE 链接器，Ubuntu 的 ld 只支持宿主目标。
AUTH_SERVER_IP=10.0.0.1 \
  CARGO_TARGET_AARCH64_UNKNOWN_LINUX_MUSL_LINKER=rust-lld \
  cargo build --release --target aarch64-unknown-linux-musl
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

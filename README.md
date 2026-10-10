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

| Rust target | OpenWrt 架构 | 链接方式 |
| --- | --- | --- |
| `aarch64-unknown-linux-musl` | `aarch64_cortex-a53` | 静态 musl |
| `armv7-unknown-linux-musleabihf` | `arm_cortex-a7_neon-vfpv4` | 静态 musl |
| `arm-unknown-linux-musleabi` | `arm_arm926ej-s` | 静态 musl |
| `x86_64-unknown-linux-musl` | `x86_64` | 静态 musl |
| `i686-unknown-linux-musl` | `i386_pentium4` | 静态 musl |
| `mipsel-unknown-linux-gnu` | `mipsel_24kc` | 静态 glibc（`-Z build-std`） |
| `mips-unknown-linux-gnu` | `mips_24kc` | 静态 glibc（`-Z build-std`） |
| `riscv64gc-unknown-linux-gnu` | `riscv64_generic` | 静态 glibc |

- 推 `v*` tag 会建 Release（`gh release view v1.0.9 -R xin-521/luci-app-srun`；本仓库当前为 `v1.0.9`），
  资产为 8 个带架构后缀的 `srun-<版本>-<架构>.apk`、`luci-app-srun-<版本>-noarch.apk`、8 个裸二进制
  `srun-<rust target>` 与 `sha256sums`；job 幂等，重复触发会 `--clobber` 覆盖同名资产。
- PR 或手动触发（`workflow_dispatch`，可传 `auth_server_ip` / `srun_ref`）只产出 Artifacts，不建 Release。

下载后先自检再安装（`sha256sums` 与 `.apk` 同目录）：

```sh
sha256sum -c sha256sums                  # 全部 OK
apk verify --allow-untrusted ./*.apk     # 包结构/摘要自检
```

`AUTH_SERVER_IP` 是**编译期**默认 Portal 地址（`build.rs` 要求），默认 `10.0.0.1`；
设备上仍可用 `/etc/config/srun` 的 `server` 覆盖。

> 5 个目标（aarch64/armv7/arm/x86_64/i686）用 Rust 自带的 musl 自包含链接；linker 一律用
> 工具链自带的 `rust-lld`：Ubuntu 的 `/usr/bin/ld` 只支持宿主目标，会拒绝
> `--fix-cortex-a53-843419` 这类目标专属选项（这正是只有 x86_64/i686 能过、其余全挂的原因）。
>
> mips/mipsel 的 Rust 未发布 std（其 musl crt/libc 也未一并提供），riscv64 有 std 但无自包含 libc，
> 这三个改用 apt 交叉 gcc（`gcc-mipsel-linux-gnu` / `libc6-dev-*-cross` 等）配 `-Z build-std`，
> 内核侧为**静态 glibc**：在 OpenWrt（musl）上仍旧自包含可运行，代价是体积略大。
> （musl.cc 曾试，但 runner 连不上。）
>
> mkpkg 用的 `apk-tools` 以 `URL_BACKEND=wget` 编译：其自带 libfetch 的静态库
> `io_url_libfetch.o` 在 `apk.static` 里解析不到 `fetch*` 符号，wget 后端可绕开（本地
> mkpkg/verify/mkndx 不走网络）
>
> 另有 [`.github/workflows/openwrt-build.yml`](./.github/workflows/openwrt-build.yml)：把本包放进
> 真实 OpenWrt 构建树做编译冒烟测试（apk/ipk × 3 目标，慢，约 40 分钟/目标）。

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

包在 [`luci-app-srun/`](./luci-app-srun)；其 Makefile 会自动定位 `luci.mk`（先找
`../../luci.mk`，否则找树内 `$(TOPDIR)/feeds/*/luci.mk`），下列任一方式都可用：

**A. 作为本地 feed（推荐）**

```sh
cd openwrt
echo "src-link srun /path/to/openwrt-luci-app-srun" >> feeds.conf.default
./scripts/feeds update srun && ./scripts/feeds install -a -p srun

make menuconfig                      # LuCI -> Applications -> luci-app-srun
make package/luci-app-srun/compile
```

**B. 放进 OpenWrt 源码树**

```sh
cp -a /path/to/openwrt-luci-app-srun/luci-app-srun /path/to/openwrt/package/
cd /path/to/openwrt && make package/luci-app-srun/compile
```

**C. 放进 LuCI feed 布局**（`openwrt-build.yml` 走的方式，最贴近官方 feed）

```sh
git clone -b master https://github.com/openwrt/luci.git luci-tree
cp -a /path/to/openwrt-luci-app-srun/luci-app-srun luci-tree/applications/

cd /path/to/openwrt
# 把本地 luci 树作为 feed（同名 luci 条目则覆盖官方 src-git 行）
sed -i '/^src-.* luci /d' feeds.conf.default
echo "src-link luci /path/to/luci-tree" >> feeds.conf.default
./scripts/feeds update luci && ./scripts/feeds install -a -p luci
make package/luci-app-srun/compile
```

> `LUCI_DEPENDS` 里的 `srun` 不在任何官方 feed：上面 C 方式在 CI 里用 stub feed 满足依赖
> 以做编译验证（见 `.github/workflows/openwrt-build.yml`）；真机部署请用 `dist/` 的 apk
> 或自行交叉编译 `zu1k/srun`。B 方式构建的包版本/作者取自 `Makefile` 的
> `PKG_VERSION`/`LUCI_MAINTAINER`（与发布产物一致）。

安装后登录 LuCI：菜单 **服务 → SRun**（概览 / 配置 / 日志）。

## 关键设计

- 唯一可编辑真源为 `/etc/config/srun`；运行时 JSON 由 `srun-generate-config` 派生到 `/var/run/srun/`。
- `procd` 守护 `srun-daemon` 周期调用 `srun login -c <per-user.json>`，成功判定写 `state.tsv`。
- Web UI 经 `rpcd` 的 ubus 对象 `luci.srun` 读取状态、触发动作；该插件是**纯 shell**
  (`/usr/libexec/rpcd/luci.srun`)，不依赖 `rpcd-mod-ucode`；ACL 最小授权（`acl.d/luci-app-srun.json`）。
- 抓取状态的 ucode 脚本只有 `srun-generate-config`（UCI → 运行时 JSON），其 `ucode` 由 `luci-base` 带出。
- 支持多拨（多 `login` 账号节）、按网卡/IP 绑定、开机自启与断线巡检。

## 版本与元数据

包版本有两处，需同步：`luci-app-srun/Makefile` 的 `PKG_VERSION`/`PKG_RELEASE`（buildroot/feed 构建用）
与 `scripts/build-apk.sh` 的 `LUCI_VER`（`dist/` 构建用）。二者当前均为 `1.0.9-r1`。
作者信息写在 `LUCI_MAINTAINER`/`PKG_MAINTAINER`（**`luci.mk` 只认 `LUCI_MAINTAINER`**），
`LUCI_URL` 指向本仓库；许可证 Apache-2.0（本包）/ GPL-3.0（上游 `srun`）。

升级 `luci-app-srun` 后**必须 `Ctrl+F5` 强刷**：LuCI 的静态资源缓存版本号取自 LuCI 自身版本，
与本包版本无关，否则浏览器仍跑旧 JS（详见 [`INSTALL.md`](./INSTALL.md)）。

详见 [`SPEC.md`](./SPEC.md)（规范与设计依据）。

# 安装 `srun` + `luci-app-srun`（OpenWrt 25.12+ / APK）

预编译产物位于 [`dist/`](./dist)（由 `scripts/build-apk.sh` 生成）：

| 文件 | 架构 | 说明 |
| --- | --- | --- |
| `srun-0.6.2-r3.apk` | `aarch64_cortex-a53` | armv8 静态 musl 二进制（`/usr/bin/srun`） |
| `luci-app-srun-1.0.8-r2.apk` | `noarch` | LuCI 应用（脚本/JS/ucode/ACL） |
| `APKINDEX.tar.gz` | — | 本地 feed 索引 |

> 仅适用于将 `opkg` 换成 `apk` 的 OpenWrt（25.12 及之后 / snapshot）。

## 安装

把 `dist/` 下两个 `.apk` 传到设备后：

```sh
apk add --allow-untrusted ./srun-0.6.2-r3.apk ./luci-app-srun-1.0.8-r2.apk
```

安装时包的 `post-install` 会自动：重启 `rpcd`（加载 `luci.srun` 插件）、创建
`/etc/config/srun`、`enable` 服务。**此时还没有账号，不会登录**——这是正常的。

## 升级后必须清浏览器缓存（重要）

LuCI 给静态资源加的缓存版本号是 **LuCI 自身** 的版本（如 `26.133.20346~e9ebca7`），
与本包版本无关。因此升级 `luci-app-srun` 后，浏览器仍会使用旧的 `config.js` /
`overview.js` / `log.js`，表现为“改了没效果”。升级后请任选其一：

- 在 LuCI 页面按 **Ctrl+F5**（或开发者工具 → Network → Disable cache 后刷新）；
- 清除该设备（`192.168.1.1`）的站点数据后重新登录；
- 用无痕窗口验证。

若仍需确认设备上文件已更新：

```sh
grep -c callNetif /www/luci-static/resources/view/srun/config.js
grep -c do_netif   /usr/libexec/rpcd/luci.srun
ubus call luci.srun netif
```

## 首次配置

1. 登录 LuCI，菜单 **服务 → SRun → 配置**。
2. 填写：`Portal server`（如 `http://10.0.0.1`）、至少一个账号（`Username`/`Password`，
   以及 `IP` 或 `Interface`）。
3. 点 **保存并应用**。提交 `/etc/config/srun` 会触发 procd 的 `config.change` 重载，
   服务据此自动启动登录；也可在 **概览** 页点 **启动**。
4. 在 **概览** 页看到账号“在线”、**日志** 页看到 `login [...] ok` 即为成功。

> 若设备上没有其他 proxy 已配置，可在 UCI 中直接设：
> `uci set srun.main.server='http://10.0.0.1'`，`uci commit srun`，`/etc/init.d/srun reload`。

### 作为本地 feed

```sh
# 上传 dist/ 到设备，例如 /opt/srun-feed/
apk add --allow-untrusted --repository /opt/srun-feed \
        --allow-untrusted srun luci-app-srun
```

> 包未签名，安装需 `--allow-untrusted`（或导入签名 key 后去掉）。

## 架构

`srun` 包默认架构为 `aarch64_cortex-a53`（多数 armv8 路由器，如联发科/高通平台）。
若目标架构不同（例如 `armsr/armv8` 为 `aarch64_generic`），用对应值重新构建：

```sh
SRUN_ARCH=aarch64_generic sh scripts/build-apk.sh
```

`luci-app-srun` 为 `noarch`，与架构无关。

## 卸载

```sh
apk del luci-app-srun srun
rm -f /etc/config/srun
```

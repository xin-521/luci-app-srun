# luci-app-srun

LuCI 应用：在 OpenWrt 网页界面完成 SRun/深澜校园网 Portal 认证的登录/注销、多拨账号管理、
服务启停与状态/日志查看。基于上游 [`zu1k/srun`](https://github.com/zu1k/srun) 命令行工具，
**不修改其 CLI/配置语义**。

设计依据见 [`../SPEC.md`](../SPEC.md)。

## 布局

```
luci-app-srun/
├── Makefile
├── htdocs/luci-static/resources/view/srun/{overview,config,log}.js
├── po/{templates/srun.pot, zh_Hans/srun.po}
└── root/
    ├── etc/init.d/srun
    ├── etc/uci-defaults/80_srun
    ├── usr/libexec/srun-daemon
    ├── usr/libexec/srun-generate-config
    ├── usr/share/luci/menu.d/luci-app-srun.json
    ├── usr/libexec/rpcd/luci.srun
    └── usr/share/rpcd/acl.d/luci-app-srun.json
```

## 依赖

- `srun`（独立包，须可执行于 `/usr/bin/srun`；可用 UCI `srun.main.binary` 覆盖）。
- `luci-base` 与 `ucode`。

## 构建

```sh
# Makefile 以 `include ../../luci.mk` 引用 luci 仓库根的构建框架，
# 因此 feed 根必须是含 luci.mk 的 luci 检出（不能直接把本仓库根挂为 feed）。
# 将本包放入 luci 源码树：
git clone -b master https://github.com/openwrt/luci.git luci-tree
cp -a /path/to/openwrt-luci-app-srun/luci-app-srun luci-tree/applications/

# 在 openwrt 源码树中，把官方 luci feed 替换为该本地树并编译：
sed -i 's|^src-git luci .*|src-link luci /absolute/path/to/luci-tree|' feeds.conf.default
./scripts/feeds update luci
./scripts/feeds install -a -p luci
make package/luci-app-srun/compile
```

> `LUCI_DEPENDS` 中的 `srun` 不在任何官方 feed 里：CI 以 stub feed 满足依赖做编译验证
> （见 `.github/workflows/openwrt-build.yml`）；真机部署请使用 `dist/` 的 apk 或自行打包。

## 运行模型

`/etc/config/srun` 是唯一真源：`srun-generate-config`（ucode）把它转成每账号运行时
`/var/run/srun/user-<sid>.json`（0600）；`procd` 守护 `srun-daemon` 周期调用
`srun login -c <json>`，成功判定写入 `/var/run/srun/state.tsv`；Web UI 经 rpcd 的
`luci.srun` 读取状态并触发动作。

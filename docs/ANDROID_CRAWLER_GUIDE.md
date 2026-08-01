# Android 端爬虫运行指南

Android 建议使用 Termux 运行 `scripts/mobile_crawler.py`。请从 F-Droid 或 Termux 官方 GitHub 发布页安装 Termux，不要使用已经停止维护的 Google Play 旧版本。

脚本会以 UTC 时间上报带时区的 ISO 8601 时间戳，后端和页面会自动换算为本地时间，不需要在手机上手动调整时差。

首次安装并启动：

```sh
pkg update
pkg install python git tmux
git clone https://github.com/mariohuang233/hmlcrawl.git
cd hmlcrawl
python scripts/mobile_crawler.py --source android
```

脚本在 Termux 中会自动识别为 `android`，因此 `--source android` 可以省略。如果需要区分多台手机，可以为每台设备设置不同但不超过 32 个字符的来源标识，例如：

```sh
python scripts/mobile_crawler.py --source android-pixel8
python scripts/mobile_crawler.py --source android-xiaomi14
```

也可以通过环境变量配置：

```sh
export CRAWLER_SOURCE=android-pixel8
python scripts/mobile_crawler.py
```

需要长期运行时，可在 Android 的应用设置中将 Termux 的电池策略设为“不受限制”，允许后台运行，然后用 `tmux` 保持会话：

```sh
tmux new -s crawler
python scripts/mobile_crawler.py --source android-pixel8
```

按 `Ctrl+B`，再按 `D` 可退出界面但保留任务；之后运行 `tmux attach -t crawler` 可重新进入。系统重启后仍需重新启动 Termux 和爬虫，除非另外配置 Termux:Boot。

iSH 无法可靠判断宿主设备究竟是 iPhone 还是 iPad，因此 iOS 端若要精确区分，请显式指定：

```sh
python3 scripts/mobile_crawler.py --source iphone
python3 scripts/mobile_crawler.py --source ipad
```

启动日志中的“来源”以及上传记录的 `source`、`crawl_id` 前缀应与指定标识一致；旧数据仍会保留原来的 `ipad` 标识，不会被自动改写。

# Android 端爬虫运行指南

Android 建议使用 Termux 运行 `scripts/mobile_crawler.py`。请从 F-Droid 或 Termux 官方 GitHub 发布页安装 Termux，不要使用已经停止维护的 Google Play 旧版本。

脚本会以 UTC 时间上报带时区的 ISO 8601 时间戳，后端和页面会自动换算为本地时间，不需要在手机上手动调整时差。

首次安装并启动：

```sh
pkg update
pkg upgrade
pkg install python git tmux openssl ca-certificates
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

## 上传失败与自动补发

脚本使用系统 CA 证书校验 Railway 的 HTTPS 连接。遇到移动网络切换、TLS 连接被提前关闭、超时、HTTP 429 或服务端 5xx 时，会自动执行最多 4 次指数退避重试。持续失败的记录会保存在 `mobile_data/data_YYYYMMDD.jsonl`，每个采集周期都会再次补发；补发中断时未成功的记录会原子化写回，不会被误删。

如果持续出现证书错误，先执行：

```sh
pkg update
pkg upgrade
pkg reinstall python openssl ca-certificates
```

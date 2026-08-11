# 米家设备用电接入

本项目直接读取中国大陆区米家云端的“日用电量”，目标设备是米家空调伴侣 2（`lumi.acpartner.mcn02`）和连接热水器的米家智能插座 3（`cuco.plug.v3`），不需要 Home Assistant、NAS、树莓派或另一项云服务，也不会读取实时功率或控制设备。

## 首次连接

先在本机启动当前 Web，然后打开 `http://127.0.0.1:8123/api/xiaomi/history-probe`，按页面提示登录米家；如果小米要求图片验证码、短信或邮件验证，继续在同一页面完成即可。账号和密码只在本机内存中用于登录，连接成功后立即丢弃；后台只把小米签发的云端会话用 AES-256-GCM 加密后保存到当前项目已有的 MongoDB。

连接成功后，本机会先保存最近约 32 天数据，Railway 启动后自动回填约 12 个月数据，之后默认每 15 分钟同步一次。首页“今日用电”会显示设备构成，“30 天趋势”和“12 个月趋势”会显示空调、热水器、其他电器以及总用电，日报、周报和月报也会附带这三项分量。

## Railway

Railway 继续使用当前 Node 服务和当前 `MONGO_URI` 即可，不需要新增 Service。最简配置不设置 `XIAOMI_CLOUD_ENCRYPTION_KEY`，本地与 Railway 会从同一个 `MONGO_URI` 派生相同的加密密钥；如果你决定设置独立密钥，必须先在本地和 Railway 配置完全相同的值，再执行首次连接，否则 Railway 无法解密已经保存的会话。可选变量 `XIAOMI_ENERGY_SYNC_CRON` 默认是 `*/15 * * * *`，通常无需修改。

部署后可查看 `/health` 确认 MongoDB 为 `connected`，再查看 `/api/device-energy/summary`；正常情况下会返回 `configured: true`，并包含 `air_conditioner` 和 `water_heater` 两台设备。Railway 配置固定为一个副本，避免多个实例重复请求小米云；即使某次小米云请求暂时失败，现有全屋总表、页面和报表仍会继续工作，并在后续定时任务中重试。

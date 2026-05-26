#!/usr/bin/env python3
"""
iPad/手机端轻量爬虫 - 用于旧 iPad/手机
功耗极低(~2-3W)，只负责爬取和上报数据
通过多个云端地址上报，只要一个在线就能成功

使用方法:
    python3 mobile_crawler.py

iOS (iSH App):
    1. App Store 搜索 "iSH Shell" 安装
    2. 打开 iSH，运行:
       apk add python3 curl git
       git clone https://github.com/mariohuang233/hmlcrawl.git
       cd hmlcrawl
       python3 scripts/mobile_crawler.py

Android (Termux):
    pkg install python curl
    git clone https://github.com/mariohuang233/hmlcrawl.git
    cd hmlcrawl
    python3 scripts/mobile_crawler.py

定时: 每15分钟自动执行，后台常驻
"""

import urllib.request
import urllib.error
import json
import time
import re
import random
import os
import sys
from datetime import datetime

# ============ 配置 ============
# 多个云端后端地址（按优先级排序，自动选择可用的）
BACKEND_URLS = [
    # 替换成你实际部署的地址，去掉下面注释并填写
    # "https://你的railway项目.up.railway.app/api/report",
    # "https://你的zeabur项目.zeabur.app/api/report",
    # "https://你的render项目.onrender.com/api/report",
    # "https://你的vercel项目.vercel.app/api/report",
]

# 如果未配置云端地址，可以改为直接写入本地文件
# 然后由本地爬虫自动同步到数据库
LOCAL_OUTPUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "mobile_data")
os.makedirs(LOCAL_OUTPUT_DIR, exist_ok=True)

# 电表配置
METER_ID = "18100071580"
METER_NAME = "2759弄18号402阳台"

# 目标网站
TARGET_HOST = "www.wap.cnyiot.com"
DIRECT_IPS = [
    "121.41.227.153",
    "47.99.204.107",
    "120.26.164.242",
    "47.99.209.106",
    "47.97.48.100"
]

# 爬取间隔（秒）
FETCH_INTERVAL = 15 * 60

# 重试配置
MAX_RETRIES = 3
RETRY_DELAY = 5


def log(msg):
    """打印带时间戳的日志"""
    line = f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {msg}"
    print(line)
    try:
        log_file = os.path.join(LOCAL_OUTPUT_DIR, "mobile_crawler.log")
        with open(log_file, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except:
        pass


def fetch_html():
    """获取网页HTML"""
    ip = random.choice(DIRECT_IPS)
    url = f"https://{ip}/nat/pay.aspx?mid={METER_ID}"

    headers = {
        'User-Agent': 'Mozilla/5.0 (iPad; CPU OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Host': TARGET_HOST,
        'Referer': f'https://{TARGET_HOST}/',
        'Origin': f'https://{TARGET_HOST}'
    }

    req = urllib.request.Request(url, headers=headers)
    req.add_header('Cache-Control', 'no-cache')

    time.sleep(random.uniform(0.5, 1.5))

    try:
        import ssl
        context = ssl.create_default_context()
        context.check_hostname = False
        context.verify_mode = ssl.CERT_NONE

        with urllib.request.urlopen(req, timeout=30, context=context) as response:
            html = response.read().decode('utf-8', errors='ignore')
            return html
    except Exception as e:
        log(f"请求失败: {e}")
        return None


def parse_remaining_kwh(html):
    """从HTML中解析剩余电量"""
    if not html:
        return None

    text = html

    patterns = [
        r'剩余电量[:：]\s*([\d.]+)\s*kWh?',
        r'剩余[:：]\s*([\d.]+)\s*kWh?',
        r'剩余\s*([\d.]+)\s*kWh?',
    ]

    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            kwh = float(match.group(1))
            if 0 < kwh < 1000:
                log(f"通过正则找到剩余电量: {kwh} kWh")
                return kwh

    numbers = re.findall(r'\d+\.?\d*', text)
    valid_numbers = []
    for num in numbers:
        try:
            val = float(num)
            if 0.5 < val < 100 and '.' in num:
                valid_numbers.append(val)
        except:
            pass

    if valid_numbers:
        valid_numbers.sort()
        kwh = valid_numbers[len(valid_numbers) // 2]
        log(f"通过数字筛选找到剩余电量: {kwh} kWh")
        return kwh

    return None


def save_to_local_file(meter_id, meter_name, remaining_kwh):
    """保存到本地文件（当云端不可用时的备份方案）"""
    record = {
        "meter_id": meter_id,
        "meter_name": meter_name,
        "remaining_kwh": remaining_kwh,
        "collected_at": datetime.now().isoformat()
    }
    filename = f"data_{datetime.now().strftime('%Y%m%d')}.json"
    filepath = os.path.join(LOCAL_OUTPUT_DIR, filename)

    records = []
    if os.path.exists(filepath):
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                records = json.load(f)
        except:
            records = []

    records.append(record)
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, indent=2)

    log(f"数据已保存到本地: {filepath} ({remaining_kwh} kWh)")
    return True


def try_report_to_url(url, data):
    """尝试上报到单个URL"""
    try:
        req = urllib.request.Request(
            url,
            data=json.dumps(data).encode('utf-8'),
            headers={'Content-Type': 'application/json'}
        )
        with urllib.request.urlopen(req, timeout=15) as response:
            result = response.read().decode('utf-8')
            log(f"上报成功 -> {url}")
            return True
    except Exception as e:
        log(f"上报失败 {url}: {str(e)[:50]}")
        return False


def report_to_backend(meter_id, meter_name, remaining_kwh):
    """上报数据 - 尝试多个云端地址，全部失败则存本地"""
    data = {
        "meter_id": meter_id,
        "meter_name": meter_name,
        "remaining_kwh": remaining_kwh,
        "collected_at": datetime.now().isoformat()
    }

    uploaded = False
    if BACKEND_URLS:
        for url in BACKEND_URLS:
            if try_report_to_url(url, data):
                uploaded = True
                break

    if uploaded:
        return True
    else:
        log("所有云端地址均不可用，保存到本地文件")
        return save_to_local_file(meter_id, meter_name, remaining_kwh)


def crawl_and_report():
    """执行一次爬取并上报"""
    log("开始爬取...")

    for attempt in range(MAX_RETRIES):
        html = fetch_html()
        if html:
            remaining = parse_remaining_kwh(html)
            if remaining is not None:
                success = report_to_backend(METER_ID, METER_NAME, remaining)
                if success:
                    return True
            else:
                log("解析剩余电量失败")
        else:
            log(f"获取网页失败 (尝试 {attempt + 1}/{MAX_RETRIES})")

        if attempt < MAX_RETRIES - 1:
            log(f"{RETRY_DELAY}秒后重试...")
            time.sleep(RETRY_DELAY)

    return False


def main():
    """主循环"""
    log("=" * 40)
    log("iPad/手机端爬虫启动")
    log(f"电表ID: {METER_ID}")
    log(f"爬取间隔: {FETCH_INTERVAL // 60}分钟")
    if BACKEND_URLS:
        log(f"云端地址: {len(BACKEND_URLS)} 个")
        for u in BACKEND_URLS:
            log(f"  - {u}")
    else:
        log("未配置云端地址，数据将保存到本地文件")
    log(f"本地数据目录: {LOCAL_OUTPUT_DIR}")
    log("=" * 40)

    crawl_and_report()

    while True:
        log(f"等待{FETCH_INTERVAL // 60}分钟后下一次爬取...")
        time.sleep(FETCH_INTERVAL)
        crawl_and_report()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        log("爬虫已手动停止")
        sys.exit(0)
    except Exception as e:
        log(f"未捕获异常: {e}")
        # 异常后等待5分钟自动重启
        time.sleep(300)
        main()

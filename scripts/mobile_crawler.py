#!/usr/bin/env python3
"""
手机端轻量爬虫 - 用于旧手机/平板
功耗极低(~2-3W)，只负责爬取和上报数据

使用方法:
    python3 mobile_crawler.py

依赖:
    Android: pkg install python curl -y
    iOS: apk add python curl (iSH)

定时: 每15分钟自动执行
"""

import urllib.request
import urllib.error
import json
import time
import re
import random
from datetime import datetime

# ============ 配置 ============
# 你的后端地址（部署在 Railway/Zeabur 上的地址）
BACKEND_URL = "https://your-app.railway.app/api/report"

# 电表配置
METER_ID = "18100071580"
METER_NAME = "2759弄18号402阳台"

# 目标网站配置
TARGET_HOST = "www.wap.cnyiot.com"
DIRECT_IPS = [
    "121.41.227.153",
    "47.99.204.107",
    "120.26.164.242",
    "47.99.209.106",
    "47.97.48.100"
]

# 爬取间隔（秒）- 15分钟 = 900秒
FETCH_INTERVAL = 15 * 60

# 重试次数
MAX_RETRIES = 3
RETRY_DELAY = 5

def log(msg):
    """打印带时间戳的日志"""
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {msg}")

def fetch_html():
    """获取网页HTML"""
    # 随机选择一个IP
    ip = random.choice(DIRECT_IPS)
    url = f"https://{ip}/nat/pay.aspx?mid={METER_ID}"

    headers = {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
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

    # 随机延迟 0.5-1.5秒
    time.sleep(random.uniform(0.5, 1.5))

    try:
        # 忽略SSL证书验证（直连IP时需要）
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

    # 提取所有文本内容
    text = html

    # 方法1: 正则匹配 "剩余电量: xxx kWh"
    patterns = [
        r'剩余电量[:：]\s*([\d.]+)\s*kWh?',
        r'剩余[:：]\s*([\d.]+)\s*kWh?',
        r'剩余\s*([\d.]+)\s*kWh?',
    ]

    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            kwh = float(match.group(1))
            if 0 < kwh < 1000:  # 合理范围
                log(f"通过正则找到剩余电量: {kwh} kWh")
                return kwh

    # 方法2: 查找所有数字，筛选合理值
    numbers = re.findall(r'\d+\.?\d*', text)
    valid_numbers = []
    for num in numbers:
        try:
            val = float(num)
            if 0.5 < val < 100 and '.' in num:  # 0.5-100kWh，有小数
                valid_numbers.append(val)
        except:
            pass

    if valid_numbers:
        # 按升序排列，取中间值
        valid_numbers.sort()
        kwh = valid_numbers[len(valid_numbers) // 2]
        log(f"通过数字筛选找到剩余电量: {kwh} kWh")
        return kwh

    return None

def report_to_backend(meter_id, meter_name, remaining_kwh):
    """上报数据到后端"""
    data = {
        "meter_id": meter_id,
        "meter_name": meter_name,
        "remaining_kwh": remaining_kwh,
        "collected_at": datetime.now().isoformat()
    }

    try:
        req = urllib.request.Request(
            BACKEND_URL,
            data=json.dumps(data).encode('utf-8'),
            headers={'Content-Type': 'application/json'}
        )

        with urllib.request.urlopen(req, timeout=30) as response:
            result = response.read().decode('utf-8')
            log(f"上报成功: {result}")
            return True
    except Exception as e:
        log(f"上报失败: {e}")
        return False

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
    log("手机端爬虫启动")
    log(f"后端地址: {BACKEND_URL}")
    log(f"电表ID: {METER_ID}")
    log(f"爬取间隔: {FETCH_INTERVAL}秒 ({FETCH_INTERVAL // 60}分钟)")
    log("=" * 40)

    # 启动后立即执行一次
    crawl_and_report()

    # 进入定时循环
    while True:
        log(f"等待{FETCH_INTERVAL // 60}分钟后下一次爬取...")
        time.sleep(FETCH_INTERVAL)
        crawl_and_report()

if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
iPad/手机端轻量爬虫 v4.0 - 完全参考电脑端逻辑
==============================================
与本地JS爬虫共享统一数据格式，通过API上报数据

使用方法:
    python3 mobile_crawler.py [--daemon]

iOS (iSH):
    apk add python3 curl git
    git clone https://github.com/mariohuang233/hmlcrawl.git
    cd hmlcrawl
    python3 scripts/mobile_crawler.py --daemon

参数:
    --daemon  后台运行模式（异常后自动重启）

数据格式版本: 1.0 (与本地爬虫共享)
"""

import urllib.request
import urllib.error
import json
import time
import re
import random
import os
import sys
import hashlib
import argparse
from datetime import datetime, timezone

# ============ 配置 ============
BACKEND_URL = "https://thoryierbubu.up.railway.app/api/report"
API_TOKEN = ""

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "mobile_data")
os.makedirs(DATA_DIR, exist_ok=True)

METER_ID = "18100071580"
METER_NAME = "2759弄18号402阳台"
TARGET_HOST = "www.wap.cnyiot.com"
DIRECT_IPS = [
    "121.41.227.153", "47.99.204.107", "120.26.164.242",
    "47.99.209.106", "47.97.48.100"
]
FETCH_INTERVAL = 15 * 60
MAX_RETRIES = 3
INITIAL_RETRY_DELAY = 5
FORMAT_VERSION = 1

current_ip_index = 0


# ============ 工具函数 ============

def log(msg):
    line = f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {msg}"
    print(line)
    try:
        with open(os.path.join(DATA_DIR, "mobile_crawler.log"), "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except:
        pass


def normalize_kwh(value):
    return round(float(value), 2)


def generate_crawl_id(source="ipad"):
    t = int(time.time() * 1000)
    r = random.randint(0, 2**32)
    return f"{source}_{t:x}_{r:x}"


def compute_checksum(record):
    sorted_data = {
        "meter_id": record["meter_id"],
        "meter_name": record["meter_name"],
        "remaining_kwh": record["remaining_kwh"],
        "collected_at": record["collected_at"],
        "source": record["source"],
        "crawl_id": record["crawl_id"],
        "format_version": record["format_version"]
    }
    raw = json.dumps(sorted_data, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]


def create_standard_record(meter_id, meter_name, remaining_kwh, collected_at, source="ipad"):
    collected_iso = collected_at
    if isinstance(collected_at, datetime):
        collected_iso = collected_at.isoformat()
    record = {
        "meter_id": meter_id,
        "meter_name": meter_name,
        "remaining_kwh": normalize_kwh(remaining_kwh),
        "collected_at": collected_iso,
        "source": source,
        "crawl_id": generate_crawl_id(source),
        "format_version": FORMAT_VERSION
    }
    record["checksum"] = compute_checksum(record)
    return record


# ============ 网络请求 ============

def _is_blocked(html):
    block_keywords = ['blocked', '安全威胁', '被阻断', 'Tunnel website ahead!', '405', '访问被拒绝']
    title_match = re.search(r'<title>([^<]*)</title>', html, re.IGNORECASE)
    if title_match:
        title = title_match.group(1)
        if any(k.lower() in title.lower() for k in block_keywords):
            log(f"检测到拦截页面，标题: {title}")
            return True
    if any(k.lower() in html.lower() for k in block_keywords):
        log(f"检测到拦截页面，包含关键词")
        return True
    return False


def fetch_html():
    global current_ip_index
    url = f"https://{DIRECT_IPS[current_ip_index]}/nat/pay.aspx?mid={METER_ID}"

    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
        'Connection': 'keep-alive',
        'Host': TARGET_HOST,
        'Referer': f'https://{TARGET_HOST}/',
        'Cache-Control': 'no-cache',
        'Upgrade-Insecure-Requests': '1'
    }

    req = urllib.request.Request(url, headers=headers)

    time.sleep(random.uniform(0.5, 1.5))

    try:
        import ssl
        context = ssl.create_default_context()
        context.check_hostname = False
        context.verify_mode = ssl.CERT_NONE
        with urllib.request.urlopen(req, timeout=30, context=context) as resp:
            html = resp.read().decode('utf-8', errors='ignore')
            
            if len(html) < 100:
                log(f"页面内容过短 ({len(html)} 字符)，可能是错误页")
            
            if _is_blocked(html):
                log(f"当前 IP ({DIRECT_IPS[current_ip_index]}) 被拦截，切换到下一个 IP")
                current_ip_index = (current_ip_index + 1) % len(DIRECT_IPS)
                log(f"切换到 IP: {DIRECT_IPS[current_ip_index]}")
                return None
            
            return html
    except Exception as e:
        log(f"请求失败: {e}")
        current_ip_index = (current_ip_index + 1) % len(DIRECT_IPS)
        log(f"切换到 IP: {DIRECT_IPS[current_ip_index]}")
        return None


# ============ 解析策略（与JS端 _smartParse 完全一致）============

def _extract_text(html):
    text = re.sub(r'<[^>]+>', ' ', html)
    text = re.sub(r'\s+', ' ', text)
    return text.strip()


def _parse_by_regex(text):
    patterns = [
        r'剩余电量[:：]\s*([\d.]+)\s*kWh?',
        r'剩余[:：]\s*([\d.]+)\s*kWh?',
        r'剩余\s*([\d.]+)\s*kWh?'
    ]
    for p in patterns:
        m = re.search(p, text, re.IGNORECASE)
        if m:
            val = float(m.group(1))
            if 0 < val < 1000:
                return val
    return None


def _parse_by_dom(text):
    clean_text = _extract_text(text)
    m = re.search(r'剩余电量[:：]\s*([\d.]+)\s*kWh', clean_text, re.IGNORECASE)
    if m:
        val = float(m.group(1))
        if 0 < val < 100:
            return val
    return None


def _parse_by_keyword(text):
    clean_text = _extract_text(text)
    m = re.search(r'(剩余电量|剩余).*?([\d.]+)\s*kWh?', clean_text, re.IGNORECASE)
    if m:
        val = float(m.group(2))
        if val > 0 and val < 100:
            return val
    return None


def _parse_by_number_heuristic(text):
    clean_text = _extract_text(text)
    nums = re.findall(r'\d+\.?\d*', clean_text)
    valid = [float(n) for n in nums if 0.5 < float(n) < 100 and '.' in n]
    if not valid:
        return None
    valid.sort()
    return valid[len(valid) // 2]


def smart_parse(html):
    if not html:
        return None

    strategies = [
        ("正则匹配", lambda: _parse_by_regex(_extract_text(html))),
        ("DOM解析", lambda: _parse_by_dom(html)),
        ("关键词匹配", lambda: _parse_by_keyword(html)),
        ("数字启发式", lambda: _parse_by_number_heuristic(html))
    ]

    for name, fn in strategies:
        result = fn()
        if result is not None:
            log(f"策略 [{name}] 解析成功: {result} kWh")
            return result

    log("所有解析策略均失败")
    log(f"页面内容预览: {html[:500]}")
    return None


# ============ 本地存储 ============

def save_local(record):
    filename = f"data_{datetime.now().strftime('%Y%m%d')}.jsonl"
    filepath = os.path.join(DATA_DIR, filename)
    try:
        with open(filepath, "a", encoding="utf-8") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")
        log(f"本地保存成功: {filepath}")
        return True
    except Exception as e:
        log(f"本地保存失败: {e}")
        return False


# ============ 上传机制 ============

def upload_to_api(record):
    if not BACKEND_URL:
        log("后端地址未配置")
        return False
    
    try:
        data = json.dumps({
            "meter_id": record["meter_id"],
            "meter_name": record["meter_name"],
            "remaining_kwh": record["remaining_kwh"],
            "collected_at": record["collected_at"],
            "crawl_id": record["crawl_id"],
            "source": record["source"],
            "format_version": record["format_version"]
        }).encode("utf-8")
        
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "hmlcrawl-mobile/4.0"
        }
        if API_TOKEN:
            headers["X-API-Token"] = API_TOKEN
        
        req = urllib.request.Request(BACKEND_URL, data=data, headers=headers)
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = resp.read().decode("utf-8")
            log(f"API上传成功: {result[:50]}")
            return True
    except urllib.error.HTTPError as e:
        if e.code == 409:
            log(f"服务器返回409（重复数据），视为成功")
            return True
        log(f"API上传失败: HTTP {e.code}")
        return False
    except Exception as e:
        log(f"API上传失败: {str(e)[:60]}")
        return False


def upload_record(record):
    if upload_to_api(record):
        return True
    log("API上传失败，保存到本地")
    save_local(record)
    return False


# ============ 爬取主流程 ============

def crawl_and_report():
    log("开始爬取...")

    for attempt in range(MAX_RETRIES):
        html = fetch_html()
        if html:
            remaining = smart_parse(html)
            if remaining is not None:
                record = create_standard_record(
                    meter_id=METER_ID,
                    meter_name=METER_NAME,
                    remaining_kwh=remaining,
                    collected_at=datetime.now(),
                    source="ipad"
                )

                upload_record(record)
                return True
            else:
                log("解析剩余电量失败，保存页面内容用于调试...")
                debug_file = os.path.join(DATA_DIR, f"debug_html_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt")
                try:
                    with open(debug_file, "w", encoding="utf-8") as f:
                        f.write(html)
                    log(f"页面内容已保存到: {debug_file}")
                except:
                    log(f"保存调试文件失败")
        else:
            log(f"获取网页失败 (尝试 {attempt + 1}/{MAX_RETRIES})")

        if attempt < MAX_RETRIES - 1:
            delay = INITIAL_RETRY_DELAY * (1.5 ** attempt)
            log(f"{int(delay)}秒后重试...")
            time.sleep(delay)

    log("所有重试均失败")
    return False


# ============ 入口 ============

def main_loop(daemon=False):
    log("=" * 40)
    log("iPad/手机端爬虫 v4.0")
    log(f"电表: {METER_ID} ({METER_NAME})")
    log(f"间隔: {FETCH_INTERVAL // 60}分钟")
    log(f"来源: ipad")
    log(f"后端: {BACKEND_URL if BACKEND_URL else '未配置'}")
    log(f"数据目录: {DATA_DIR}")
    log("=" * 40)

    crawl_and_report()

    interval = FETCH_INTERVAL

    while True:
        log(f"等待 {interval // 60} 分钟后下一次爬取...")
        time.sleep(interval)
        try:
            crawl_and_report()
        except Exception as e:
            log(f"爬取异常: {e}")
            if daemon:
                log("守护模式，5分钟后自动重启")
                time.sleep(300)
            else:
                raise


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="iPad/手机端爬虫")
    parser.add_argument("--daemon", action="store_true", help="守护模式（异常后自动重启）")
    args = parser.parse_args()

    try:
        main_loop(daemon=args.daemon)
    except KeyboardInterrupt:
        log("爬虫已手动停止")
        sys.exit(0)
    except Exception as e:
        log(f"未捕获异常: {e}")
        if args.daemon:
            log("守护模式，10秒后重启...")
            time.sleep(10)
            main_loop(daemon=True)
        else:
            raise

#!/usr/bin/env python3
"""
iPad/手机端轻量爬虫 v3.0 - 简化版
==================================
与本地JS爬虫共享统一数据格式，直接连接MongoDB，零配置运行！

使用方法:
    python3 mobile_crawler.py [--daemon]

iOS (iSH):
    apk add python3 curl git
    git clone https://github.com/mariohuang233/hmlcrawl.git
    cd hmlcrawl
    python3 scripts/mobile_crawler.py --daemon

Android (Termux):
    pkg install python curl git
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

try:
    from pymongo import MongoClient
    HAS_MONGODB = True
except ImportError:
    HAS_MONGODB = False

# ============ 配置 ============
MONGO_URI = "mongodb+srv://mariohuang:Huangjw1014@yierbubu.aha67vc.mongodb.net/electricity?retryWrites=true&w=majority&appName=yierbubu"

BACKEND_URLS = []

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
UPLOAD_RETRIES = 3
UPLOAD_RETRY_DELAY = 10
FORMAT_VERSION = 1

mongo_client = None


def get_mongo_client():
    global mongo_client
    if mongo_client is None and HAS_MONGODB and MONGO_URI:
        for attempt in range(3):
            try:
                mongo_client = MongoClient(MONGO_URI, 
                    serverSelectionTimeoutMS=15000,
                    connectTimeoutMS=15000,
                    socketTimeoutMS=15000)
                mongo_client.admin.command('ping')
                log("MongoDB 连接成功")
                return mongo_client
            except Exception as e:
                log(f"MongoDB 连接失败 (尝试 {attempt + 1}/3): {str(e)[:80]}")
                if attempt < 2:
                    time.sleep(2)
        mongo_client = None
    return mongo_client


def save_to_mongo(record):
    if not HAS_MONGODB:
        log("未安装 pymongo，请运行: pip install pymongo")
        return False
    
    client = get_mongo_client()
    if not client:
        log("MongoDB 不可用，尝试重新连接...")
        mongo_client = None
        client = get_mongo_client()
        if not client:
            log("MongoDB 重新连接失败")
            return False
    
    try:
        db = client['electricity']
        usage_data = {
            "meter_id": record["meter_id"],
            "meter_name": record["meter_name"],
            "remaining_kwh": record["remaining_kwh"],
            "collected_at": datetime.fromisoformat(record["collected_at"].replace('Z', '+00:00'))
        }
        result = db['usages'].insert_one(usage_data)
        log(f"MongoDB 写入成功: {result.inserted_id}")
        return True
    except Exception as e:
        log(f"MongoDB 写入失败: {str(e)[:80]}")
        mongo_client = None
        return False


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
    """与JS端 computeChecksum 算法兼容：SHA256前16位"""
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


def validate_record(record):
    errors = []
    if not isinstance(record.get("meter_id"), str) or not record["meter_id"]:
        errors.append("meter_id 无效")
    if not isinstance(record.get("meter_name"), str) or not record["meter_name"]:
        errors.append("meter_name 无效")
    kwh = record.get("remaining_kwh")
    if kwh is None or not isinstance(kwh, (int, float)) or kwh <= 0 or kwh >= 1000:
        errors.append(f"remaining_kwh 无效: {kwh}")
    if not record.get("collected_at"):
        errors.append("collected_at 缺失")
    if record.get("crawl_id") and not isinstance(record["crawl_id"], str):
        errors.append("crawl_id 必须是字符串")
    return len(errors) == 0, errors


# ============ 网络请求 ============

def fetch_html():
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
        'Cache-Control': 'no-cache'
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
            return html
    except Exception as e:
        log(f"请求失败: {e}")
        return None


# ============ 多策略解析（与JS端一致）============

def _parse_by_regex(text):
    patterns = [
        r'剩余电量[:：]\s*([\d.]+)\s*kWh?',
        r'剩余[:：]\s*([\d.]+)\s*kWh?',
        r'剩余\s*([\d.]+)\s*kWh?',
    ]
    for p in patterns:
        m = re.search(p, text, re.IGNORECASE)
        if m:
            val = float(m.group(1))
            if 0 < val < 1000:
                return val
    return None


def _parse_by_keyword(text):
    m = re.search(r'(剩余电量|剩余).*?([\d.]+)\s*kWh?', text, re.IGNORECASE)
    if m:
        val = float(m.group(2))
        if val > 0 and val < 100:
            return val
    return None


def _parse_by_number_heuristic(text):
    """兜底：查找所有带小数的合理数字（必须包含小数点，与JS端一致）"""
    nums = re.findall(r'\d+\.\d+', text)
    valid = [float(n) for n in nums if 0.5 < float(n) < 100]
    if not valid:
        return None
    valid.sort()
    return valid[len(valid) // 2]


def _parse_by_dom(text):
    """模拟JS端 _parseByDom：查找包含'剩余电量'的元素，提取其所在上下文的数值"""
    patterns = [
        r'<[^>]*>([^<]*剩余电量[^<]*)<[^>]*>',
        r'<[^>]*>([^<]*剩余[^<]*电量[^<]*)<[^>]*>',
    ]
    for pattern in patterns:
        matches = re.findall(pattern, text, re.IGNORECASE)
        for match in matches:
            m = re.search(r'剩余电量[:：]\s*([\d.]+)', match)
            if m:
                val = float(m.group(1))
                if 0 < val < 100:
                    return val
            m2 = re.search(r'剩余[:：]\s*([\d.]+)', match)
            if m2:
                val = float(m2.group(1))
                if 0 < val < 100:
                    return val
    return None


def smart_parse(html):
    """四层解析策略，与JS端 _smartParse 完全对应"""
    if not html:
        return None

    text = html
    strategies = [
        ("正则匹配", lambda: _parse_by_regex(text)),
        ("DOM解析", lambda: _parse_by_dom(text)),
        ("关键词匹配", lambda: _parse_by_keyword(text)),
        ("数字启发式", lambda: _parse_by_number_heuristic(text)),
    ]

    for name, fn in strategies:
        result = fn()
        if result is not None:
            log(f"策略 [{name}] 解析成功: {result} kWh")
            return result

    log("所有解析策略均失败")
    return None


def _parse_html_tag(html):
    """通过HTML标签粗提取文本后查找"""
    text = re.sub(r'<[^>]+>', ' ', html)
    text = re.sub(r'\s+', ' ', text)
    m = re.search(r'剩余电量[:：]\s*([\d.]+)', text)
    if m:
        val = float(m.group(1))
        if 0 < val < 100:
            return val
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


def get_pending_uploads(limit=100):
    """获取未上传的记录（检查所有以 data_ 开头的文件）"""
    records = []
    try:
        files = sorted([f for f in os.listdir(DATA_DIR)
                        if f.startswith("data_") and f.endswith(".jsonl")],
                       reverse=True)[:3]
        for fname in files:
            fpath = os.path.join(DATA_DIR, fname)
            try:
                with open(fpath, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line:
                            try:
                                records.append(json.loads(line))
                            except:
                                pass
                        if len(records) >= limit:
                            break
            except:
                pass
            if len(records) >= limit:
                break
    except:
        pass
    return records[:limit]


# ============ 上传机制 ============

def try_upload(url, record):
    try:
        data = json.dumps(record).encode("utf-8")
        headers = {
            "Content-Type": "application/json",
            "X-Source": record.get("source", "ipad"),
            "X-Format-Version": str(record.get("format_version", 1)),
            "X-Crawl-Id": record.get("crawl_id", ""),
            "User-Agent": "hmlcrawl-mobile/2.0"
        }
        if API_TOKEN:
            headers["X-API-Token"] = API_TOKEN
        req = urllib.request.Request(url, data=data, headers=headers)
        with urllib.request.urlopen(req, timeout=15) as resp:
            result = resp.read().decode("utf-8")
            log(f"上传成功 -> {url}")
            return True
    except urllib.error.HTTPError as e:
        if e.code == 409:
            log(f"服务器返回409（重复），视为成功: {url}")
            return True
        log(f"上传失败 {url}: HTTP {e.code}")
        return False
    except Exception as e:
        log(f"上传失败 {url}: {str(e)[:60]}")
        return False


def upload_record(record):
    """优先直接写入MongoDB，失败则尝试后端API，最后保存本地"""
    if MONGO_URI and HAS_MONGODB:
        if save_to_mongo(record):
            return True
        log("MongoDB写入失败，尝试后端API")
    
    uploaded = False
    if BACKEND_URLS:
        for url in BACKEND_URLS:
            if try_upload(url, record):
                uploaded = True
                break
    if not uploaded:
        log("所有后端不可用，保存到本地")
        save_local(record)
    return uploaded


def flush_pending_uploads():
    """尝试批量上传本地积压的数据（优先MongoDB）"""
    pending = get_pending_uploads(50)
    if not pending:
        return
    log(f"发现 {len(pending)} 条本地积压数据，尝试批量上传...")
    success_count = 0
    for record in pending:
        if MONGO_URI and HAS_MONGODB:
            if save_to_mongo(record):
                success_count += 1
                continue
        if BACKEND_URLS:
            for url in BACKEND_URLS:
                if try_upload(url, record):
                    success_count += 1
                    break
        time.sleep(0.5)
    log(f"积压数据上传完成: {success_count}/{len(pending)}")


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
                valid, errors = validate_record(record)
                if not valid:
                    log(f"记录校验失败: {errors}")
                    return False

                upload_record(record)
                flush_pending_uploads()
                return True
            else:
                log("解析剩余电量失败")
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
    log("iPad/手机端爬虫 v3.0")
    log(f"电表: {METER_ID} ({METER_NAME})")
    log(f"间隔: {FETCH_INTERVAL // 60}分钟")
    log(f"来源: ipad")
    if MONGO_URI and HAS_MONGODB:
        log("MongoDB: 已配置（优先直接写入）")
    elif BACKEND_URLS:
        log(f"后端: {len(BACKEND_URLS)} 个地址")
    else:
        log("后端: 未配置，数据仅保存本地")
    log(f"数据目录: {DATA_DIR}")
    log("=" * 40)

    crawl_and_report()
    flush_pending_uploads()

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
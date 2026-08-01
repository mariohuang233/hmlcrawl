#!/usr/bin/env python3
"""
iPad/手机端轻量爬虫 v5.2 - 可靠定时调度
==============================================
支持持续定时运行，包含本地缓存补发、休眠恢复补偿、心跳检测和自动恢复机制

使用方法:
    python3 mobile_crawler.py

iOS (iSH):
    apk add python3 curl git
    git clone https://github.com/mariohuang233/hmlcrawl.git
    cd hmlcrawl
    python3 scripts/mobile_crawler.py

参数:
    --daemon     守护恢复模式（默认开启，保留兼容）
    --no-daemon  调试模式（未捕获异常时退出）
    --source     设备来源（Android/Termux 默认为 android，iOS 默认为 ipad）

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
import threading
import signal
from datetime import datetime, timezone

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
FETCH_INTERVAL = 10 * 60
HEARTBEAT_INTERVAL = 60
SCHEDULER_TICK_SECONDS = 5
SUSPEND_RECOVERY_THRESHOLD = 30
MAX_RETRIES = 3
INITIAL_RETRY_DELAY = 5
FORMAT_VERSION = 1

current_ip_index = 0
last_active_time = time.time()
is_running = True

def detect_default_source():
    configured = os.environ.get("CRAWLER_SOURCE", "").strip()
    if configured:
        return configured
    if os.environ.get("TERMUX_VERSION") or os.environ.get("ANDROID_ROOT"):
        return "android"
    return "ipad"

def validate_source(value):
    source = value.strip()
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,31}", source):
        raise argparse.ArgumentTypeError("来源标识需为 1-32 位字母、数字、点、下划线或连字符")
    return source

def log(msg):
    line = f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {msg}"
    print(line, flush=True)
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
        if collected_at.tzinfo is None:
            collected_at = collected_at.astimezone()
        collected_iso = collected_at.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
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

def smart_parse(html):
    if not html:
        return None
    
    text = re.sub(r'<[^>]+>', ' ', html)
    text = re.sub(r'\s+', ' ', text)
    
    m = re.search(r'剩余电量[:：]\s*([\d.]+)', text)
    if m:
        val = float(m.group(1))
        if 0 < val < 1000:
            log(f"解析成功: {val} kWh")
            return val
    
    log("解析失败")
    log(f"页面文本预览: {text[:200]}")
    return None

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
            "User-Agent": "hmlcrawl-mobile/5.2"
        }
        if API_TOKEN:
            headers["X-API-Token"] = API_TOKEN
        
        req = urllib.request.Request(BACKEND_URL, data=data, headers=headers)
        
        import ssl
        context = ssl.create_default_context()
        context.set_ciphers('DEFAULT@SECLEVEL=1')
        context.check_hostname = False
        context.verify_mode = ssl.CERT_NONE
        
        with urllib.request.urlopen(req, timeout=30, context=context) as resp:
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

def replay_cached_data():
    log("开始补发本地缓存数据...")
    cached_files = [f for f in os.listdir(DATA_DIR) if f.startswith("data_") and f.endswith(".jsonl")]
    total_replayed = 0
    total_failed = 0
    
    for filename in sorted(cached_files):
        filepath = os.path.join(DATA_DIR, filename)
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                lines = f.readlines()
            
            records = []
            for line in lines:
                line = line.strip()
                if line:
                    try:
                        records.append(json.loads(line))
                    except:
                        continue
            
            if not records:
                os.remove(filepath)
                continue
            
            log(f"处理缓存文件: {filename} ({len(records)}条记录)")
            
            for record in records:
                if upload_to_api(record):
                    total_replayed += 1
                else:
                    total_failed += 1
                    save_local(record)
            
            os.remove(filepath)
            log(f"缓存文件 {filename} 已处理并删除")
        except Exception as e:
            log(f"处理缓存文件 {filename} 失败: {e}")
    
    log(f"补发完成: 成功 {total_replayed} 条，失败 {total_failed} 条")

def crawl_and_report(source):
    global last_active_time
    last_active_time = time.time()
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
                    collected_at=datetime.now(timezone.utc),
                    source=source
                )

                upload_record(record)
                last_active_time = time.time()
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

def heartbeat_monitor():
    global last_active_time, is_running
    log("心跳监控线程已启动")
    while is_running:
        try:
            elapsed = time.time() - last_active_time
            if elapsed > FETCH_INTERVAL + 300:
                log(f"警告: 长时间未活动 ({int(elapsed/60)}分钟)，可能被系统挂起")
            
            time.sleep(HEARTBEAT_INTERVAL)
        except Exception as e:
            log(f"心跳监控异常: {e}")
            time.sleep(HEARTBEAT_INTERVAL)

def signal_handler(signum, frame):
    global is_running
    log(f"收到信号 {signum}，准备退出...")
    is_running = False

def format_run_time(timestamp):
    return datetime.fromtimestamp(timestamp).strftime("%Y-%m-%d %H:%M:%S")

def wait_until(target_time):
    """等待到绝对时间；进程从系统挂起状态恢复后会立即结束等待。"""
    global is_running
    while is_running:
        remaining = target_time - time.time()
        if remaining <= 0:
            return True
        time.sleep(min(SCHEDULER_TICK_SECONDS, remaining))
    return False

def get_next_run_time(scheduled_time, finished_time, interval):
    """保持固定周期；若本轮过久或设备休眠，跳过已错过的空档而不连续轰炸目标站。"""
    next_run = scheduled_time + interval
    if next_run <= finished_time:
        missed_intervals = int((finished_time - next_run) // interval) + 1
        next_run += missed_intervals * interval
    return next_run

def main_loop(daemon=True, source="ipad"):
    global is_running
    
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    log("=" * 40)
    log("iPad/手机端爬虫 v5.2 - 可靠定时调度")
    log(f"电表: {METER_ID} ({METER_NAME})")
    log(f"间隔: {FETCH_INTERVAL // 60}分钟")
    log(f"心跳: {HEARTBEAT_INTERVAL}秒")
    log(f"来源: {source}")
    log(f"后端: {BACKEND_URL if BACKEND_URL else '未配置'}")
    log(f"数据目录: {DATA_DIR}")
    log(f"守护恢复: {'开启' if daemon else '关闭'}")
    log("=" * 40)

    replay_cached_data()

    heartbeat_thread = threading.Thread(target=heartbeat_monitor, daemon=True)
    heartbeat_thread.start()

    interval = FETCH_INTERVAL
    log(f"定时调度已启动: 每 {interval // 60} 分钟执行一次")
    scheduled_time = time.time()

    while is_running:
        if not wait_until(scheduled_time):
            break

        started_at = time.time()
        delay = started_at - scheduled_time
        if delay >= SUSPEND_RECOVERY_THRESHOLD:
            log(f"检测到系统休眠或调度延迟 {int(delay)} 秒，立即补执行本轮采集")
        else:
            log(f"定时任务触发: {format_run_time(started_at)}")

        try:
            crawl_and_report(source)
        except Exception as e:
            log(f"爬取异常: {e}")
            if daemon:
                log("守护恢复已接管异常，继续等待下一轮")
            else:
                raise
        finally:
            finished_at = time.time()
            scheduled_time = get_next_run_time(scheduled_time, finished_at, interval)
            log(f"下次定时采集: {format_run_time(scheduled_time)}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="iPad/手机端爬虫")
    recovery_group = parser.add_mutually_exclusive_group()
    recovery_group.add_argument(
        "--daemon",
        dest="daemon",
        action="store_true",
        help="开启守护恢复（默认，保留旧命令兼容）"
    )
    recovery_group.add_argument(
        "--no-daemon",
        dest="daemon",
        action="store_false",
        help="关闭守护恢复，未捕获异常时退出"
    )
    parser.set_defaults(daemon=True)
    parser.add_argument("--once", action="store_true", help="单次运行模式（执行一次后退出，适合快捷指令）")
    parser.add_argument(
        "--source",
        type=validate_source,
        default=validate_source(detect_default_source()),
        help="设备来源，例如 android、android-pixel8、iphone 或 ipad"
    )
    args = parser.parse_args()

    if args.once:
        log("单次运行模式")
        replay_cached_data()
        crawl_and_report(args.source)
        sys.exit(0)

    while True:
        try:
            main_loop(daemon=args.daemon, source=args.source)
            break
        except KeyboardInterrupt:
            log("爬虫已手动停止")
            sys.exit(0)
        except Exception as e:
            log(f"未捕获异常: {e}")
            if args.daemon:
                log("守护模式，10秒后重启...")
                time.sleep(10)
            else:
                raise

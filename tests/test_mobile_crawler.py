import importlib.util
import json
import ssl
import tempfile
import unittest
import urllib.error
from pathlib import Path


MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts" / "mobile_crawler.py"
SPEC = importlib.util.spec_from_file_location("mobile_crawler", MODULE_PATH)
mobile_crawler = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(mobile_crawler)


class FakeResponse:
    def __init__(self, payload=None):
        self.payload = payload or {"success": True, "message": "ok"}

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self):
        return json.dumps(self.payload).encode("utf-8")


def sample_record(crawl_id="android-test"):
    return {
        "meter_id": "test-meter",
        "meter_name": "test",
        "remaining_kwh": 10.5,
        "collected_at": "2026-08-01T06:30:00Z",
        "crawl_id": crawl_id,
        "source": "android",
        "format_version": 1,
    }


class UploadTests(unittest.TestCase):
    def setUp(self):
        self.original_log = mobile_crawler.log
        mobile_crawler.log = lambda _message: None

    def tearDown(self):
        mobile_crawler.log = self.original_log

    def test_retries_a_transient_tls_eof_with_verified_tls(self):
        attempts = []
        sleeps = []

        def opener(_request, **kwargs):
            attempts.append(kwargs)
            if len(attempts) == 1:
                raise urllib.error.URLError(ssl.SSLError("UNEXPECTED_EOF_WHILE_READING"))
            return FakeResponse()

        uploaded = mobile_crawler.upload_to_api(
            sample_record(),
            max_attempts=2,
            sleep_fn=sleeps.append,
            opener=opener,
        )

        self.assertTrue(uploaded)
        self.assertEqual(len(attempts), 2)
        self.assertEqual(len(sleeps), 1)
        self.assertEqual(attempts[0]["context"].verify_mode, ssl.CERT_REQUIRED)
        self.assertTrue(attempts[0]["context"].check_hostname)

    def test_does_not_retry_a_permanent_http_error(self):
        attempts = []

        def opener(request, **_kwargs):
            attempts.append(request)
            raise urllib.error.HTTPError(request.full_url, 400, "bad request", {}, None)

        uploaded = mobile_crawler.upload_to_api(
            sample_record(),
            max_attempts=4,
            sleep_fn=lambda _delay: None,
            opener=opener,
        )

        self.assertFalse(uploaded)
        self.assertEqual(len(attempts), 1)


class CacheReplayTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.original_data_dir = mobile_crawler.DATA_DIR
        self.original_upload = mobile_crawler.upload_to_api
        self.original_log = mobile_crawler.log
        mobile_crawler.DATA_DIR = self.tempdir.name
        mobile_crawler.log = lambda _message: None

    def tearDown(self):
        mobile_crawler.DATA_DIR = self.original_data_dir
        mobile_crawler.upload_to_api = self.original_upload
        mobile_crawler.log = self.original_log
        self.tempdir.cleanup()

    def test_failed_replay_keeps_the_failed_and_unattempted_records(self):
        records = [sample_record("one"), sample_record("two"), sample_record("three")]
        cache_file = Path(self.tempdir.name) / "data_20260801.jsonl"
        cache_file.write_text("".join(json.dumps(record) + "\n" for record in records), encoding="utf-8")
        attempts = []

        def upload(record):
            attempts.append(record["crawl_id"])
            return record["crawl_id"] == "one"

        mobile_crawler.upload_to_api = upload
        available = mobile_crawler.replay_cached_data()

        remaining = [json.loads(line) for line in cache_file.read_text(encoding="utf-8").splitlines()]
        self.assertFalse(available)
        self.assertEqual(attempts, ["one", "two"])
        self.assertEqual([record["crawl_id"] for record in remaining], ["two", "three"])

    def test_successful_replay_removes_the_cache_file(self):
        cache_file = Path(self.tempdir.name) / "data_20260801.jsonl"
        cache_file.write_text(json.dumps(sample_record()) + "\n", encoding="utf-8")
        mobile_crawler.upload_to_api = lambda _record: True

        available = mobile_crawler.replay_cached_data()

        self.assertTrue(available)
        self.assertFalse(cache_file.exists())


if __name__ == "__main__":
    unittest.main()

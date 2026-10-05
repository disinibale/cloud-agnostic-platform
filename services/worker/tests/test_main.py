import io
import json
import subprocess
import sys

from worker.__main__ import run

VALID = '{"orderId": "o-1", "userId": "1", "item": "widget", "quantity": 2}'
UNKNOWN_ITEM = '{"orderId": "o-2", "userId": "1", "item": "spaceship", "quantity": 1}'


def test_run_writes_one_result_per_line_and_continues_after_bad_input() -> None:
    out = io.StringIO()

    run([VALID + "\n", "garbage\n", UNKNOWN_ITEM + "\n", VALID + "\n"], out)

    results = [json.loads(line) for line in out.getvalue().splitlines()]
    assert [(r["orderId"], r["status"]) for r in results] == [
        ("o-1", "processed"),
        (None, "rejected"),
        ("o-2", "rejected"),
        ("o-1", "processed"),
    ]


def test_run_skips_blank_lines() -> None:
    out = io.StringIO()

    run(["\n", "   \n", VALID + "\n", "\n"], out)

    assert out.getvalue().splitlines() == ['{"orderId": "o-1", "status": "processed"}']


def test_module_entrypoint_survives_bad_bytes_and_logs_to_stderr() -> None:
    stdin = b"\n".join([VALID.encode(), b"\xff\xfe not utf-8", b"{", VALID.encode()])

    proc = subprocess.run(
        [sys.executable, "-m", "worker"],
        input=stdin,
        capture_output=True,
        timeout=30,
        check=False,
    )

    assert proc.returncode == 0, proc.stderr.decode()
    results = [json.loads(line) for line in proc.stdout.decode().splitlines()]
    assert [r["status"] for r in results] == [
        "processed",
        "rejected",
        "rejected",
        "processed",
    ]
    assert b"processed order o-1" in proc.stderr

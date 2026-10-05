"""Stdin entrypoint: JSON Lines events in, one JSON result per line out.

This is the only stdin-specific code. Replacing the event source means
replacing this module; worker.processing stays as it is.
"""

import json
import logging
import sys
from collections.abc import Iterable
from typing import TextIO

from worker.processing import process_line


def run(lines: Iterable[str], out: TextIO) -> None:
    for line in lines:
        # Blank lines carry no event, such as a trailing newline at the end of input.
        if not line.strip():
            continue
        out.write(json.dumps(process_line(line)) + "\n")
        # Emit each result as soon as it exists, even when stdout is a pipe.
        out.flush()


def main() -> None:
    # Logs go to stderr so stdout carries nothing but results.
    logging.basicConfig(
        level=logging.INFO,
        stream=sys.stderr,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    # The platform default encoding (cp1252 on Windows) would mangle UTF-8
    # input. Undecodable bytes become U+FFFD and the line is rejected, not fatal.
    sys.stdin.reconfigure(encoding="utf-8", errors="replace")
    sys.stdout.reconfigure(encoding="utf-8")
    run(sys.stdin, sys.stdout)


if __name__ == "__main__":
    main()

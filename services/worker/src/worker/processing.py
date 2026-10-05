"""Order event processing, independent of where events come from.

Nothing here knows about stdin. Any event source (stdin today, a queue later)
hands raw lines or decoded events to these functions.
"""

import json
import logging
from typing import Literal, NotRequired, TypedDict

logger = logging.getLogger(__name__)

# Unit prices in cents. Integer cents keep totals exact.
PRICES_CENTS: dict[str, int] = {
    "widget": 250,
    "gadget": 1299,
    "gizmo": 499,
}


class Result(TypedDict):
    orderId: str | None
    status: Literal["processed", "rejected"]
    reason: NotRequired[str]


def process_line(line: str) -> Result:
    """Decode one JSON line and process it. Never raises on bad input."""
    try:
        event = json.loads(line)
    # Deeply nested input makes the decoder hit the recursion limit.
    except ValueError, RecursionError:
        return _rejected(None, "malformed JSON")
    return process_event(event)


def process_event(event: object) -> Result:
    """Validate a decoded event and "process" it by pricing the order."""
    if not isinstance(event, dict):
        return _rejected(None, "event must be a JSON object")

    order_id = event.get("orderId")
    if not _is_non_empty_str(order_id):
        return _rejected(None, "orderId must be a non-empty string")

    user_id = event.get("userId")
    if not _is_non_empty_str(user_id):
        return _rejected(order_id, "userId must be a non-empty string")

    item = event.get("item")
    if not _is_non_empty_str(item):
        return _rejected(order_id, "item must be a non-empty string")

    quantity = event.get("quantity")
    # bool is a subclass of int, so `true` would otherwise count as 1.
    if isinstance(quantity, bool) or not isinstance(quantity, int) or quantity < 1:
        return _rejected(order_id, "quantity must be a positive integer")

    price = PRICES_CENTS.get(item)
    if price is None:
        return _rejected(order_id, f"unknown item: {item}")

    total = price * quantity
    logger.info(
        "processed order %s for user %s: %d x %s = %s",
        order_id,
        user_id,
        quantity,
        item,
        _format_cents(total),
    )
    return {"orderId": order_id, "status": "processed"}


def _is_non_empty_str(value: object) -> bool:
    return isinstance(value, str) and value.strip() != ""


def _format_cents(cents: int) -> str:
    return f"{cents // 100}.{cents % 100:02d}"


def _rejected(order_id: str | None, reason: str) -> Result:
    logger.warning("rejected order %s: %s", order_id, reason)
    return {"orderId": order_id, "status": "rejected", "reason": reason}

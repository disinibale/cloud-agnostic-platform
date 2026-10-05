import json
import logging

import pytest

from worker.processing import process_event, process_line


def event_line(**overrides: object) -> str:
    event: dict[str, object] = {
        "orderId": "o-1",
        "userId": "1",
        "item": "widget",
        "quantity": 2,
    }
    event.update(overrides)
    return json.dumps(event)


def without(field: str) -> str:
    event = json.loads(event_line())
    del event[field]
    return json.dumps(event)


@pytest.mark.parametrize(
    ("item", "quantity"),
    [("widget", 2), ("gadget", 1), ("gizmo", 10)],
)
def test_valid_event_is_processed(item: str, quantity: int) -> None:
    result = process_line(event_line(item=item, quantity=quantity))

    assert result == {"orderId": "o-1", "status": "processed"}


def test_processed_event_logs_the_total(caplog: pytest.LogCaptureFixture) -> None:
    with caplog.at_level(logging.INFO, logger="worker.processing"):
        process_line(event_line(item="gadget", quantity=3))

    assert "3 x gadget = 38.97" in caplog.text


@pytest.mark.parametrize(
    ("line", "reason"),
    [
        (without("userId"), "userId must be a non-empty string"),
        (event_line(userId=""), "userId must be a non-empty string"),
        (event_line(userId=7), "userId must be a non-empty string"),
        (without("item"), "item must be a non-empty string"),
        (event_line(item="   "), "item must be a non-empty string"),
        (event_line(item=["widget"]), "item must be a non-empty string"),
        (without("quantity"), "quantity must be a positive integer"),
        (event_line(quantity=0), "quantity must be a positive integer"),
        (event_line(quantity=-1), "quantity must be a positive integer"),
        (event_line(quantity=1.5), "quantity must be a positive integer"),
        (event_line(quantity="2"), "quantity must be a positive integer"),
        (event_line(quantity=True), "quantity must be a positive integer"),
        (event_line(quantity=None), "quantity must be a positive integer"),
    ],
)
def test_invalid_field_is_rejected_with_order_id(line: str, reason: str) -> None:
    assert process_line(line) == {
        "orderId": "o-1",
        "status": "rejected",
        "reason": reason,
    }


@pytest.mark.parametrize(
    "line",
    [without("orderId"), event_line(orderId=""), event_line(orderId=42)],
)
def test_invalid_order_id_is_rejected_without_order_id(line: str) -> None:
    assert process_line(line) == {
        "orderId": None,
        "status": "rejected",
        "reason": "orderId must be a non-empty string",
    }


@pytest.mark.parametrize(
    "line",
    [
        "",
        "not json",
        "{",
        '{"orderId": "o-1",',
        "{'orderId': 'o-1'}",
    ],
    ids=["empty", "text", "open-brace", "truncated", "single-quotes"],
)
def test_malformed_json_is_rejected(line: str) -> None:
    assert process_line(line) == {
        "orderId": None,
        "status": "rejected",
        "reason": "malformed JSON",
    }


def test_deeply_nested_json_is_rejected_without_crashing() -> None:
    # Deeply nested JSON is rejected safely without crashing. The rejection
    # reason is not asserted because it depends on the environment's stack size:
    # hitting the recursion limit reports "malformed JSON", while successful
    # parsing reports "event must be a JSON object".
    result = process_line("[" * 100_000 + "]" * 100_000)

    assert result["orderId"] is None
    assert result["status"] == "rejected"


@pytest.mark.parametrize("line", ["[]", "42", '"o-1"', "null", "true"])
def test_non_object_json_is_rejected(line: str) -> None:
    assert process_line(line) == {
        "orderId": None,
        "status": "rejected",
        "reason": "event must be a JSON object",
    }


def test_unknown_item_is_rejected() -> None:
    assert process_line(event_line(item="spaceship")) == {
        "orderId": "o-1",
        "status": "rejected",
        "reason": "unknown item: spaceship",
    }


def test_process_event_accepts_decoded_events() -> None:
    event = {"orderId": "o-9", "userId": "2", "item": "gizmo", "quantity": 1}

    assert process_event(event) == {"orderId": "o-9", "status": "processed"}

from civicweave_ai.guards.pii import redact


def test_redact_email() -> None:
    assert redact("Contact test@example.com for info") == "Contact [redacted] for info"


def test_redact_mobile() -> None:
    assert redact("Call 9876543210") == "Call [redacted]"
    assert redact("Call +91-9876543210") == "Call [redacted]"
    assert redact("Call +91 9876543210") == "Call [redacted]"


def test_redact_pan() -> None:
    assert redact("My PAN is ABCDE1234F") == "My PAN is [redacted]"


def test_redact_aadhaar() -> None:
    assert redact("Aadhaar 1234 5678 9012") == "Aadhaar [redacted]"
    assert redact("Aadhaar 1234-5678-9012") == "Aadhaar [redacted]"
    assert redact("Aadhaar 123456789012") == "Aadhaar [redacted]"

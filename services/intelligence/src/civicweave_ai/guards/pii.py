import re

EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}")
MOBILE_RE = re.compile(r"(?:\+91[\s\-]?)?[6-9]\d{9}\b")
PAN_RE = re.compile(r"\b[A-Z]{5}[0-9]{4}[A-Z]\b")
AADHAAR_RE = re.compile(r"\b\d{4}[\s\-]?\d{4}[\s\-]?\d{4}\b")


def redact(text: str) -> str:
    text = EMAIL_RE.sub("[redacted]", text)
    text = MOBILE_RE.sub("[redacted]", text)
    text = PAN_RE.sub("[redacted]", text)
    text = AADHAAR_RE.sub("[redacted]", text)
    return text

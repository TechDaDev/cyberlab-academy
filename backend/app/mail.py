"""Email delivery with a private local capture provider for development."""
import json
import os
import smtplib
import ssl
from datetime import datetime, timezone
from email.message import EmailMessage
from pathlib import Path
from typing import Protocol
from uuid import uuid4


class MailProvider(Protocol):
    def send(self, recipient: str, subject: str, body: str) -> None: ...


class DevCaptureMail:
    def send(self, recipient: str, subject: str, body: str) -> None:
        directory = Path(os.getenv("MAIL_CAPTURE_DIR", "/tmp/cyberlab-mail"))
        directory.mkdir(mode=0o700, parents=True, exist_ok=True)
        directory.chmod(0o700)
        path = directory / f"{uuid4()}.json"
        payload = {"to": recipient, "subject": subject, "body": body,
                   "created_at": datetime.now(timezone.utc).isoformat()}
        fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump(payload, stream)


class SMTPMail:
    def send(self, recipient: str, subject: str, body: str) -> None:
        host = os.environ["SMTP_HOST"]
        sender = os.environ["MAIL_FROM"]
        message = EmailMessage()
        message["From"] = sender
        message["To"] = recipient
        message["Subject"] = subject
        message.set_content(body)
        with smtplib.SMTP(host, int(os.getenv("SMTP_PORT", "587")), timeout=15) as server:
            server.starttls(context=ssl.create_default_context())
            server.login(os.environ["SMTP_USER"], os.environ["SMTP_PASSWORD"])
            server.send_message(message)


def mail_provider() -> MailProvider:
    provider = os.getenv("MAIL_PROVIDER", "dev_capture")
    if provider == "dev_capture":
        if os.getenv("APP_ENV") == "production":
            raise RuntimeError("MAIL_PROVIDER=smtp required in production")
        return DevCaptureMail()
    if provider == "smtp":
        return SMTPMail()
    raise RuntimeError("Unsupported MAIL_PROVIDER")


def send_link(recipient: str, action: str, token: str) -> None:
    base = os.getenv("FRONTEND_URL", "http://localhost:3000").rstrip("/")
    path = "verify-email" if action == "verify_email" else "reset-password"
    subject = "Verify your CyberLab Academy email" if action == "verify_email" else "Reset your CyberLab Academy password"
    # The frontend receives the token in its URL. It then submits it to the API.
    mail_provider().send(recipient, subject, f"Open {base}/{path}?token={token}\nThis link expires soon and works once.\n")

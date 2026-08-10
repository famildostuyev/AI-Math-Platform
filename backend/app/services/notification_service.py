from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from app.core.enums import VerificationChannel


class NotificationDeliveryError(Exception):
    """Raised when a notification cannot be delivered."""


@dataclass(frozen=True, slots=True)
class VerificationNotification:
    """Data required to deliver a verification code."""

    channel: VerificationChannel
    destination: str
    code: str


class NotificationProvider(Protocol):
    """Contract implemented by notification delivery providers."""

    def send_verification_code(
        self,
        notification: VerificationNotification,
    ) -> None:
        """Deliver a verification code to the requested destination."""


class ConsoleNotificationProvider:
    """
    Development-only provider that writes verification codes to stdout.

    This provider keeps the application workflow operational before a real
    email or SMS integration is configured.
    """

    def send_verification_code(
        self,
        notification: VerificationNotification,
    ) -> None:
        destination = notification.destination.strip()
        code = notification.code.strip()

        if not destination:
            raise NotificationDeliveryError(
                "Notification destination cannot be empty."
            )

        if not code:
            raise NotificationDeliveryError(
                "Verification code cannot be empty."
            )

        print(
            "[verification] "
            f"channel={notification.channel.value} "
            f"destination={destination} "
            f"code={code}"
        )


class NotificationService:
    """Application-facing notification delivery service."""

    def __init__(
        self,
        provider: NotificationProvider | None = None,
    ) -> None:
        self.provider = provider or ConsoleNotificationProvider()

    def send_verification_code(
        self,
        *,
        channel: VerificationChannel,
        destination: str,
        code: str,
    ) -> None:
        notification = VerificationNotification(
            channel=channel,
            destination=destination,
            code=code,
        )

        try:
            self.provider.send_verification_code(notification)
        except NotificationDeliveryError:
            raise
        except Exception as exc:
            raise NotificationDeliveryError(
                "Verification notification could not be delivered."
            ) from exc
"""Emergency Notification Dispatcher for the Risk Engine (risk_engine/notifications.py).

Provides multi-channel emergency alert dispatch (WhatsApp & Voice Call) via Twilio.

Design & Architectural Rationale:
  - Safety & Non-Blocking Guarantee: Emergency response generation must never fail
    or crash because an external notification gateway (Twilio, network, API limits)
    is down or misconfigured. All SDK calls and initialization are wrapped defensively
    to return structured result dicts with failure statuses rather than raising exceptions.
  - Graceful Fallback / Soft Dependency: The `twilio` package is an optional dependency.
    If not installed, `ImportError` is caught gracefully during module load, marking the
    dispatcher as disabled while preserving full functionality for the rest of the Risk Engine.
  - Dry Run Safety First: Defaults to `DISPATCH_MODE="dry_run"`. In dry run mode, messages
    are logged at INFO level to Python logging without hitting external APIs, preventing
    accidental live charges or messaging spam during local development and testing.
  - Channel Cooldowns: Emergency conditions can persist across dozens of snapshot ticks.
    Without rate limiting, every tick would trigger duplicate voice calls and WhatsApp messages.
    An in-memory cooldown clock per channel ensures operators are alerted immediately when an
    incident occurs without being flooded by duplicate notifications.
"""

import os
import time
import logging
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

# Auto-load root .env file if present
def _load_env_file() -> None:
    env_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".env"))
    if os.path.exists(env_path):
        try:
            with open(env_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        k, v = line.split("=", 1)
                        k = k.strip()
                        v = v.strip().strip("'\"")
                        if k not in os.environ or not os.environ[k]:
                            os.environ[k] = v
        except Exception as e:
            logger.warning("Could not parse .env file: %s", e)

_load_env_file()

# Graceful import check for twilio SDK
try:
    from twilio.rest import Client as TwilioClient
    _TWILIO_AVAILABLE = True
except ImportError:
    TwilioClient = None
    _TWILIO_AVAILABLE = False


class NotificationDispatcher:
    """Dispatches emergency alerts to response teams via WhatsApp and Voice calls.
    
    Reads credentials and dispatch mode from environment variables:
      - TWILIO_ACCOUNT_SID
      - TWILIO_AUTH_TOKEN
      - TWILIO_PHONE_NUMBER
      - TWILIO_WHATSAPP_NUMBER
      - NOTIFY_TARGET_PHONE_NUMBER
      - DISPATCH_MODE ("dry_run" or "live", default: "dry_run")
    """

    def __init__(self, dispatch_cooldown_seconds: float = 5.0) -> None:
        self.cooldown_seconds = dispatch_cooldown_seconds
        self._last_dispatch: Dict[str, float] = {}
        self._last_result: Dict[str, Dict[str, Any]] = {}

        # Environment configuration - sanitize by stripping whitespace and spaces
        self.account_sid = os.environ.get("TWILIO_ACCOUNT_SID", "").strip()
        self.auth_token = os.environ.get("TWILIO_AUTH_TOKEN", "").strip()
        self.from_phone = os.environ.get("TWILIO_PHONE_NUMBER", "+1 260 544 2983").replace(" ", "").strip()
        self.from_whatsapp = os.environ.get("TWILIO_WHATSAPP_NUMBER", "+14155238886").replace(" ", "").strip()
        self.target_phone = os.environ.get("NOTIFY_TARGET_PHONE_NUMBER", "+91 8937967955").replace(" ", "").strip()
        
        mode = os.environ.get("DISPATCH_MODE", "dry_run").strip().lower()
        self.dry_run = mode != "live"

        self._client: Optional[Any] = None
        self.enabled = _TWILIO_AVAILABLE

        if not _TWILIO_AVAILABLE:
            logger.warning("Twilio SDK is not installed. NotificationDispatcher is disabled (dry_run logging only).")
        elif not self.dry_run:
            self._init_client()

    def _init_client(self) -> None:
        _load_env_file()
        self.account_sid = os.environ.get("TWILIO_ACCOUNT_SID", "").strip()
        self.auth_token = os.environ.get("TWILIO_AUTH_TOKEN", "").strip()
        self.from_phone = os.environ.get("TWILIO_PHONE_NUMBER", "+1 260 544 2983").replace(" ", "").strip()
        self.from_whatsapp = os.environ.get("TWILIO_WHATSAPP_NUMBER", "+14155238886").replace(" ", "").strip()
        self.target_phone = os.environ.get("NOTIFY_TARGET_PHONE_NUMBER", "+91 8937967955").replace(" ", "").strip()

        if _TWILIO_AVAILABLE and self.account_sid and self.auth_token and not self._client:
            try:
                self._client = TwilioClient(self.account_sid, self.auth_token)
            except Exception as e:
                logger.error("Failed to initialize Twilio Client: %s", e)
                self.enabled = False

    def set_mode(self, mode: str) -> str:
        """Dynamically update dispatch mode ('dry_run' or 'live')."""
        mode_clean = mode.strip().lower()
        self.dry_run = (mode_clean != "live")
        if not self.dry_run:
            self._init_client()
        self._last_dispatch.clear()  # Reset cooldown so toggling mode allows immediate dispatch
        self._last_result.clear()
        logger.info("NotificationDispatcher mode updated to: %s", "live" if not self.dry_run else "dry_run")
        return "live" if not self.dry_run else "dry_run"

    def reset_cooldown(self) -> None:
        """Clear per-channel cooldown clocks."""
        self._last_dispatch.clear()
        self._last_result.clear()

    def get_mode(self) -> str:
        """Return current dispatch mode ('dry_run' or 'live')."""
        return "live" if not self.dry_run else "dry_run"

    def _is_in_cooldown(self, channel: str) -> bool:
        """Check whether a channel dispatch attempt is within the cooldown window."""
        now = time.time()
        last = self._last_dispatch.get(channel, 0.0)
        return (now - last) < self.cooldown_seconds

    def _format_whatsapp_number(self, num: str) -> str:
        """Ensure number has whatsapp: prefix for Twilio Sandbox format."""
        num = num.strip().replace(" ", "")
        if not num.startswith("whatsapp:"):
            return f"whatsapp:{num}"
        return num

    def send_whatsapp_alert(self, message: str) -> Dict[str, Any]:
        """Sends a WhatsApp alert message via Twilio's WhatsApp Sandbox API.
        
        In dry_run mode or if disabled, logs the message and returns dry_run status.
        Enforces per-channel cooldown before dispatching.
        """
        channel = "whatsapp"
        
        if self._is_in_cooldown(channel):
            if channel in self._last_result:
                return self._last_result[channel]
            logger.info("[%s] Cooldown active (%.1fs remaining). Skipping dispatch.", channel, self.cooldown_seconds - (time.time() - self._last_dispatch.get(channel, 0.0)))
            return {
                "status": "skipped_cooldown",
                "channel": channel,
                "dry_run": self.dry_run,
                "message": message,
                "recipient": self.target_phone,
            }

        if self.dry_run or not self.enabled or not self._client:
            logger.info("[DRY_RUN - %s] Would send message to %s: '%s'", channel.upper(), self.target_phone, message)
            self._last_dispatch[channel] = time.time()
            res = {
                "status": "success",
                "channel": channel,
                "dry_run": True,
                "message": message,
                "recipient": self.target_phone,
                "note": "Dry run execution — no external API call made."
            }
            self._last_result[channel] = res
            return res

        try:
            from_addr = self._format_whatsapp_number(self.from_whatsapp)
            to_addr = self._format_whatsapp_number(self.target_phone)
            
            logger.info("Dispatching live WhatsApp alert to %s from %s", to_addr, from_addr)
            twilio_msg = self._client.messages.create(
                body=message,
                from_=from_addr,
                to=to_addr,
            )
            self._last_dispatch[channel] = time.time()
            res = {
                "status": "success",
                "channel": channel,
                "dry_run": False,
                "message": message,
                "recipient": to_addr,
                "sid": getattr(twilio_msg, "sid", None),
            }
            self._last_result[channel] = res
            return res
        except Exception as e:
            logger.error("Failed to send WhatsApp alert via Twilio: %s", e)
            res = {
                "status": "failed",
                "channel": channel,
                "dry_run": False,
                "message": message,
                "recipient": self.target_phone,
                "error": str(e),
            }
            self._last_result[channel] = res
            return res

    def place_voice_call(self, message: str) -> Dict[str, Any]:
        """Places an automated voice call using Twilio Voice API with TwiML Text-To-Speech.
        
        In dry_run mode or if disabled, logs the voice message and returns dry_run status.
        Enforces per-channel cooldown before dispatching.
        """
        channel = "voice"

        if self._is_in_cooldown(channel):
            if channel in self._last_result:
                return self._last_result[channel]
            logger.info("[%s] Cooldown active (%.1fs remaining). Skipping call.", channel, self.cooldown_seconds - (time.time() - self._last_dispatch.get(channel, 0.0)))
            return {
                "status": "skipped_cooldown",
                "channel": channel,
                "dry_run": self.dry_run,
                "message": message,
                "recipient": self.target_phone,
            }

        if self.dry_run or not self.enabled or not self._client:
            logger.info("[DRY_RUN - %s] Would place voice call to %s with TwiML text: '%s'", channel.upper(), self.target_phone, message)
            self._last_dispatch[channel] = time.time()
            res = {
                "status": "success",
                "channel": channel,
                "dry_run": True,
                "message": message,
                "recipient": self.target_phone,
                "note": "Dry run execution — no external voice call placed."
            }
            self._last_result[channel] = res
            return res

        try:
            twiml_content = f"<Response><Pause length='1'/><Say voice='alice'>{message}</Say><Pause length='2'/><Say voice='alice'>{message}</Say></Response>"
            from_addr = self.from_phone.replace(" ", "").strip()
            to_addr = self.target_phone.replace(" ", "").strip()
            logger.info("Placing live Voice call to %s from %s", to_addr, from_addr)
            
            call = self._client.calls.create(
                twiml=twiml_content,
                to=to_addr,
                from_=from_addr,
            )
            self._last_dispatch[channel] = time.time()
            res = {
                "status": "success",
                "channel": channel,
                "dry_run": False,
                "message": message,
                "recipient": to_addr,
                "sid": getattr(call, "sid", None),
            }
            self._last_result[channel] = res
            return res
        except Exception as e:
            logger.error("Failed to place voice call via Twilio: %s", e)
            res = {
                "status": "failed",
                "channel": channel,
                "dry_run": False,
                "message": message,
                "recipient": self.target_phone,
                "error": str(e),
            }
            self._last_result[channel] = res
            return res

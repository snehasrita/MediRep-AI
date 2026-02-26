from agora_token_builder import RtcTokenBuilder
import time
import os
import logging
from config import AGORA_APP_ID, AGORA_APP_CERTIFICATE, AGORA_TOKEN_EXPIRY_SECONDS

logger = logging.getLogger(__name__)

class AgoraService:
    @staticmethod
    def generate_token(channel_name: str, uid: int = 0, role: int = 1) -> str:
        """
        Generate an Agora RTC Token.
        :param channel_name: Unique channel name (e.g. consultation_id)
        :param uid: User ID (0 for auto-assign, or specific integer)
        :param role: 1 for Host (Broadcaster), 2 for Audience (Subscriber)
                     In a call, both are usually Broadcasters (1)
        :return: Token string
        """
        if not AGORA_APP_ID or not AGORA_APP_CERTIFICATE:
            logger.error("Agora App ID or Certificate missing")
            raise ValueError("Agora configuration missing")

        expiration_time_in_seconds = int(AGORA_TOKEN_EXPIRY_SECONDS)
        current_timestamp = int(time.time())
        privilege_expired_ts = current_timestamp + expiration_time_in_seconds

        try:
            token = RtcTokenBuilder.buildTokenWithUid(
                AGORA_APP_ID, 
                AGORA_APP_CERTIFICATE, 
                channel_name, 
                uid, 
                role, 
                privilege_expired_ts
            )
            return token
        except Exception as e:
            logger.error(f"Failed to generate Agora token: {e}")
            raise e

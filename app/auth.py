import secrets
import logging
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from app.dependencies import get_settings

logger = logging.getLogger(__name__)
_security = HTTPBasic()


def verify_credentials(
    credentials: HTTPBasicCredentials = Depends(_security),
) -> str:
    """FastAPI dependency — returns username on success, raises 401 on failure."""
    settings = get_settings()

    # secrets.compare_digest prevents timing attacks
    username_ok = secrets.compare_digest(
        credentials.username.encode("utf-8"),
        settings.auth_username.encode("utf-8"),
    )
    password_ok = secrets.compare_digest(
        credentials.password.encode("utf-8"),
        settings.auth_password.encode("utf-8"),
    )

    if not (username_ok and password_ok):
        logger.warning("Failed login attempt for username %r", credentials.username)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Basic"},
        )

    return credentials.username

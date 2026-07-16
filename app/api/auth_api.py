from fastapi import APIRouter, Depends
from app.auth import verify_credentials

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.get("/verify")
def verify(username: str = Depends(verify_credentials)):
    """Returns 200 if credentials are valid, 401 otherwise."""
    return {"authenticated": True, "username": username}

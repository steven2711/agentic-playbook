import os

import jwt
from fastapi import Header, HTTPException


def current_user(authorization: str = Header(...)) -> dict[str, str]:
    """Decode the bearer token. Every protected route depends on this."""
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=401, detail="missing bearer token")
    try:
        claims = jwt.decode(token, os.environ["ATLAS_JWT_SECRET"], algorithms=["HS256"])
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail="invalid token") from exc
    return {"sub": str(claims["sub"]), "org": str(claims.get("org", ""))}

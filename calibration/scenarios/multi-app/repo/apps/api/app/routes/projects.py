from fastapi import APIRouter, Depends

from app.auth.session import current_user

router = APIRouter(prefix="/projects")

_PROJECTS = [{"id": "1", "name": "Apollo", "updatedAt": "2026-01-02T00:00:00Z"}]


@router.get("")
def list_projects(user: dict[str, str] = Depends(current_user)) -> list[dict[str, str]]:
    return [p for p in _PROJECTS if user["org"] == "atlas"]

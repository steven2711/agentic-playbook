from fastapi.testclient import TestClient

from app.auth.session import current_user
from app.main import app


def test_lists_projects_for_org() -> None:
    app.dependency_overrides[current_user] = lambda: {"sub": "u1", "org": "atlas"}
    res = TestClient(app).get("/projects")
    assert res.status_code == 200
    assert res.json()[0]["name"] == "Apollo"

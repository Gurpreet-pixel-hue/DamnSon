from fastapi.testclient import TestClient

from civicweave_ai.main import app

client = TestClient(app)


def test_health_check() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data["ok"], bool)
    assert data["llm"] in ["gemini", "groq", "rules", "local"]
    assert data["db"] in ["up", "down"]

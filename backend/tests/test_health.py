import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.db.mongodb import MongoDB
from app.main import create_app


def unavailable_settings() -> Settings:
    return Settings(
        mongodb_uri="mongodb://127.0.0.1:27018",
        mongodb_database="git_out_test",
        mongodb_server_selection_timeout_ms=100,
    )


def test_health_returns_expected_backend_structure() -> None:
    application = create_app(settings=unavailable_settings())

    with TestClient(application) as client:
        response = client.get("/health")

    assert response.status_code == 503
    assert set(response.json()) == {"status", "service", "database"}
    assert response.json()["service"] == "git-out-backend"


def test_health_reports_degraded_when_mongodb_is_unavailable() -> None:
    application = create_app(settings=unavailable_settings())

    with TestClient(application) as client:
        response = client.get("/health")

    assert response.status_code == 503
    assert response.json() == {
        "status": "degraded",
        "service": "git-out-backend",
        "database": "unavailable",
    }


def test_health_integration_with_mongodb() -> None:
    """Run manually when MongoDB is available at the configured URI."""

    settings = Settings()
    application = create_app(settings=settings, mongodb=MongoDB(settings))

    with TestClient(application) as client:
        response = client.get("/health")

    if response.status_code == 503:
        pytest.skip("MongoDB is not available for the integration check")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "git-out-backend",
        "database": "connected",
    }

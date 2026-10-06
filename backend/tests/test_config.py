from app.core.config import Settings


def test_settings_load_from_environment(monkeypatch) -> None:
    monkeypatch.setenv("MONGODB_URI", "mongodb://example.test:27017")
    monkeypatch.setenv("MONGODB_DATABASE", "git_out_custom")
    monkeypatch.setenv("ENVIRONMENT", "test")
    monkeypatch.setenv("DEBUG", "true")

    settings = Settings()

    assert settings.mongodb_uri == "mongodb://example.test:27017"
    assert settings.mongodb_database == "git_out_custom"
    assert settings.environment == "test"
    assert settings.debug is True

from cryptography.fernet import Fernet
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app


@pytest.fixture
def client(monkeypatch, tmp_path):
    monkeypatch.setenv("COOKIE_SECURE", "false")
    monkeypatch.setenv("MFA_ENCRYPTION_KEY", Fernet.generate_key().decode())
    monkeypatch.setenv("MAIL_CAPTURE_DIR", str(tmp_path / "mail"))
    engine = create_engine("sqlite+pysqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    local = sessionmaker(bind=engine, expire_on_commit=False)
    def override():
        with local() as session:
            yield session
    app.dependency_overrides[get_db] = override
    with TestClient(app) as test_client:
        test_client.headers.update({"Origin": "http://localhost:3000"})
        yield test_client, local
    app.dependency_overrides.clear()
    engine.dispose()

from app import run


def test_runner_ignores_proxy_headers_by_default(monkeypatch):
    monkeypatch.delenv("TRUSTED_PROXY_IPS", raising=False)
    captured = {}
    monkeypatch.setattr(run.uvicorn, "run", lambda *args, **kwargs: captured.update(kwargs))
    run.main()
    assert captured["host"] == "127.0.0.1"
    assert captured["port"] == 8000
    assert captured["proxy_headers"] is False
    assert captured["forwarded_allow_ips"] == ""


def test_runner_uses_explicit_trusted_proxy_addresses(monkeypatch):
    monkeypatch.setenv("TRUSTED_PROXY_IPS", "127.0.0.1")
    captured = {}
    monkeypatch.setattr(run.uvicorn, "run", lambda *args, **kwargs: captured.update(kwargs))
    run.main()
    assert captured["proxy_headers"] is True
    assert captured["forwarded_allow_ips"] == "127.0.0.1"

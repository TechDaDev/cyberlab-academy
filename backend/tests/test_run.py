from app import run


def _capture(monkeypatch):
    captured = {}
    monkeypatch.setattr(run.uvicorn, "run", lambda *args, **kwargs: captured.update(kwargs))
    return captured


def test_runner_never_rewrites_the_client_address(monkeypatch):
    monkeypatch.delenv("TRUSTED_PROXY_IPS", raising=False)
    captured = _capture(monkeypatch)
    run.main()
    assert captured["host"] == "127.0.0.1"
    assert captured["port"] == 8000
    assert captured["proxy_headers"] is False
    assert captured["forwarded_allow_ips"] is None


def test_runner_keeps_proxy_headers_off_even_with_trusted_proxies(monkeypatch):
    """Uvicorn must not rewrite scope["client"]; the app authorizes forwarding itself."""
    monkeypatch.setenv("TRUSTED_PROXY_IPS", "127.0.0.1")
    captured = _capture(monkeypatch)
    run.main()
    assert captured["proxy_headers"] is False
    assert captured["forwarded_allow_ips"] is None

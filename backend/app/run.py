"""Local API runner with explicit reverse-proxy trust settings."""
import os

import uvicorn


def main() -> None:
    trusted_proxies = os.getenv("TRUSTED_PROXY_IPS", "").strip()
    uvicorn.run(
        "app.main:app",
        host=os.getenv("BIND_HOST", "127.0.0.1"),
        port=int(os.getenv("BIND_PORT", "8000")),
        reload=os.getenv("RELOAD", "true").lower() == "true",
        proxy_headers=bool(trusted_proxies),
        forwarded_allow_ips=trusted_proxies,
    )


if __name__ == "__main__":
    main()

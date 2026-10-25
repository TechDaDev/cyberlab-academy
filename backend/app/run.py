"""Local API runner with explicit reverse-proxy trust settings.

Uvicorn's own ``ProxyHeadersMiddleware`` rewrites ``scope["client"]`` with the forwarded
address, which destroys the only value this application can use to decide whether the
*immediate peer* may speak for a downstream client. Forwarded addresses are therefore
interpreted in exactly one place — ``app.security`` — and Uvicorn's proxy handling stays
off even when ``TRUSTED_PROXY_IPS`` is configured.
"""
import os

import uvicorn


def main() -> None:
    uvicorn.run(
        "app.main:app",
        host=os.getenv("BIND_HOST", "127.0.0.1"),
        port=int(os.getenv("BIND_PORT", "8000")),
        reload=os.getenv("RELOAD", "true").lower() == "true",
        # Never let the server rewrite the client address: the application needs the true
        # socket peer to authorize X-Forwarded-For itself (see app.security).
        proxy_headers=False,
        forwarded_allow_ips=None,
    )


if __name__ == "__main__":
    main()

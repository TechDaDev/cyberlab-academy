import os

from fastapi import FastAPI, Request
from starlette.middleware.trustedhost import TrustedHostMiddleware
from .routes_auth import router as accounts_router
from .routes_admin import router as administration_router
from .security import UntrustedForwardingGuard

app = FastAPI(
    title="CyberLab Academy API",
    version="0.2.0",
    description="Mission-based cybersecurity learning platform",
)

app.include_router(accounts_router)
app.include_router(administration_router)
app.add_middleware(UntrustedForwardingGuard)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=[
    item.strip() for item in os.getenv("ALLOWED_HOSTS", "localhost,127.0.0.1,testserver").split(",") if item.strip()
])

@app.middleware("http")
async def no_store_sensitive_responses(request: Request, call_next):
    response = await call_next(request)
    if request.url.path.startswith(("/api/v1/auth/", "/api/v1/users/", "/api/v1/admin/")):
        response.headers["Cache-Control"] = "no-store"
        response.headers["Referrer-Policy"] = "no-referrer"
    return response

@app.get("/api/v1/health", tags=["system"])
def health() -> dict[str, str]:
    return {"status": "ok"}

from fastapi import FastAPI
from .routes_auth import router as accounts_router

app = FastAPI(
    title="CyberLab Academy API",
    version="0.1.0",
    description="Mission-based cybersecurity learning platform",
)

app.include_router(accounts_router)

@app.get("/api/v1/health", tags=["system"])
def health() -> dict[str, str]:
    return {"status": "ok"}

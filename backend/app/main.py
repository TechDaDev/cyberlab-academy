from fastapi import FastAPI

app = FastAPI(
    title="CyberLab Academy API",
    version="0.1.0",
    description="Mission-based cybersecurity learning platform",
)


@app.get("/api/v1/health", tags=["system"])
def health() -> dict[str, str]:
    """Unauthenticated liveness probe. No internal diagnostics."""
    return {"status": "ok"}

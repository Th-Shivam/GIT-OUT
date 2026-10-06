from fastapi import FastAPI


app = FastAPI(
    title="Git Out API",
    description="Backend services for the Git Out voice-first AI companion.",
    version="0.1.0",
)


@app.get("/health", tags=["system"])
def health() -> dict[str, str]:
    """Report whether the backend is available."""

    return {"status": "ok", "service": "git-out-backend"}

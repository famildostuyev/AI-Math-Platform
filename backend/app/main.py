from fastapi import FastAPI

from app.api.auth import router as auth_router


app = FastAPI(
    title="AI Math Platform",
    version="0.9.0",
)

app.include_router(
    auth_router,
    prefix="/api/v1",
)


@app.get("/")
def root():
    return {
        "message": "AI Math Platform API is running."
    }
from fastapi import FastAPI

from app.api.auth import router as auth_router
from app.api.catalog import router as catalog_router
from app.api.media import router as media_router
from app.api.question_bank import router as question_bank_router
from app.api.question_editor import router as question_editor_router
from app.api.source_documents import router as source_documents_router
from app.api.source_pre_analysis import router as source_pre_analysis_router
from app.api.teacher import router as teacher_router


app = FastAPI(
    title="AI Math Platform",
    version="0.9.0",
)

app.include_router(
    auth_router,
    prefix="/api/v1",
)

app.include_router(
    teacher_router,
    prefix="/api/v1",
)

app.include_router(
    catalog_router,
    prefix="/api/v1",
)

app.include_router(
    question_editor_router,
    prefix="/api/v1",
)

app.include_router(
    question_bank_router,
    prefix="/api/v1",
)

app.include_router(
    media_router,
    prefix="/api/v1",
)

app.include_router(
    source_pre_analysis_router,
    prefix="/api/v1",
)

app.include_router(
    source_documents_router,
    prefix="/api/v1",
)


@app.get("/")
def root():
    return {
        "message": "AI Math Platform API is running."
    }

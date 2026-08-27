from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.core.enums import RoleName
from app.database.session import get_db
from app.models.user import User
from app.schemas.admin_ai import AdminAIQueryRequest
from app.services.admin_ai_foundation_registry import build_admin_ai_foundation_registry
from app.services.admin_ai_orchestrator import (
    AdminAIOrchestrationExecutionError,
    AdminAIOrchestrationResult,
    AdminAIOrchestrator,
    AdminAIPlanValidationError,
)
from app.services.admin_ai_read_capabilities import AdminAIReadCapabilityExecutor
from app.services.admin_ai_planner_grounding import (
    AdminAIPlannerCatalogGroundingError,
    AdminAIPlannerCatalogService,
    AdminAIPlannerCurrentRevisionService,
)
from app.services.openai_admin_ai_planner import (
    OpenAIAdminAIPlanner,
    OpenAIAdminAIPlannerAPIError,
    OpenAIAdminAIPlannerInvalidRequestError,
    OpenAIAdminAIPlannerInvalidResponseError,
    OpenAIAdminAIPlannerManifestTooLargeError,
    OpenAIAdminAIPlannerNetworkError,
    OpenAIAdminAIPlannerRateLimitError,
    OpenAIAdminAIPlannerTimeoutError,
    OpenAIAdminAIPlannerUnknownProviderError,
)


router = APIRouter(prefix="/admin-ai", tags=["Admin AI"])


def get_admin_ai_orchestrator(db: Annotated[Session, Depends(get_db)]) -> AdminAIOrchestrator:
    try:
        planner = OpenAIAdminAIPlanner()
    except OpenAIAdminAIPlannerInvalidRequestError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Admin AI is not configured.",
        ) from exc
    try:
        grounding = AdminAIPlannerCatalogService(db).build()
    except AdminAIPlannerCatalogGroundingError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Admin AI catalog grounding is unavailable.",
        ) from exc
    return AdminAIOrchestrator(
        planner=planner, registry=build_admin_ai_foundation_registry(),
        read_executor=AdminAIReadCapabilityExecutor(db),
        catalog_grounding=grounding,
        current_revision_service=AdminAIPlannerCurrentRevisionService(db),
    )


@router.post("/query", response_model=AdminAIOrchestrationResult)
def query_admin_ai(
    request: AdminAIQueryRequest,
    _current_user: Annotated[User, Depends(require_roles(RoleName.ADMIN))],
    orchestrator: Annotated[AdminAIOrchestrator, Depends(get_admin_ai_orchestrator)],
) -> AdminAIOrchestrationResult:
    try:
        return orchestrator.run(
            actor_role=RoleName.ADMIN,
            instruction=request.instruction,
            current_revision_id=request.current_revision_id,
        )
    except OpenAIAdminAIPlannerInvalidRequestError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Admin AI is not configured.") from exc
    except OpenAIAdminAIPlannerTimeoutError as exc:
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail="Admin AI request timed out.") from exc
    except OpenAIAdminAIPlannerRateLimitError as exc:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Admin AI is temporarily busy.") from exc
    except (OpenAIAdminAIPlannerNetworkError, OpenAIAdminAIPlannerAPIError, OpenAIAdminAIPlannerUnknownProviderError) as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Admin AI provider is unavailable.") from exc
    except (OpenAIAdminAIPlannerInvalidResponseError, OpenAIAdminAIPlannerManifestTooLargeError, AdminAIPlanValidationError) as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Admin AI returned an invalid plan.") from exc
    except AdminAIOrchestrationExecutionError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Admin AI could not complete a read operation.") from exc

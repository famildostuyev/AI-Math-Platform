from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.core.enums import RoleName
from app.database.session import get_db
from app.models.user import User
from app.schemas.admin_ai import (
    AdminAIQueryRequest,
    AdminAIQuestionDraftPromotionResponse,
    AdminAIReplacementProposalRequest,
    AdminAIReplacementProposalResponse,
)
from app.services.admin_ai_foundation_registry import build_admin_ai_foundation_registry
from app.services.admin_ai_orchestrator import (
    AdminAIOrchestrationExecutionError,
    AdminAIHostContext,
    AdminAIOrchestrationResult,
    AdminAIOrchestrator,
    AdminAIPlanValidationError,
)
from app.services.admin_ai_read_capabilities import (
    AdminAIReadCapabilityError,
    AdminAIReadCapabilityExecutor,
)
from app.services.admin_ai_mutation_proposal_service import (
    AdminAIMutationProposalError,
    AdminAIMutationProposalService,
)
from app.services.admin_ai_generated_question_draft_service import (
    AdminAIGeneratedQuestionDraftError,
    AdminAIGeneratedQuestionDraftNotFoundError,
    AdminAIGeneratedQuestionDraftNotPromotableError,
    AdminAIGeneratedQuestionDraftQuestionTypeError,
    AdminAIGeneratedQuestionDraftService,
)
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


def get_admin_ai_generated_question_draft_service(
    db: Annotated[Session, Depends(get_db)],
) -> AdminAIGeneratedQuestionDraftService:
    return AdminAIGeneratedQuestionDraftService(db)


def get_admin_ai_current_revision_service(
    db: Annotated[Session, Depends(get_db)],
) -> AdminAIPlannerCurrentRevisionService:
    return AdminAIPlannerCurrentRevisionService(db)


def get_admin_ai_read_executor(
    db: Annotated[Session, Depends(get_db)],
) -> AdminAIReadCapabilityExecutor:
    return AdminAIReadCapabilityExecutor(db)


def get_admin_ai_catalog_service(
    db: Annotated[Session, Depends(get_db)],
) -> AdminAIPlannerCatalogService:
    return AdminAIPlannerCatalogService(db)


def get_admin_ai_replacement_proposal_service(
    db: Annotated[Session, Depends(get_db)],
) -> AdminAIMutationProposalService:
    return AdminAIMutationProposalService(
        db, provider_name="admin_ai", model_name="existing_generated_draft",
        prompt_version="admin-ai-draft-replacement-v1", provider_schema_version=1,
    )


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
        synthesizer=planner,
        catalog_grounding=grounding,
        current_revision_service=AdminAIPlannerCurrentRevisionService(db),
        mutation_proposal_persister=AdminAIMutationProposalService(
            db, provider_name="openai", model_name=planner.model_name,
            prompt_version=planner.prompt_version, provider_schema_version=1,
        ),
    )


@router.post("/query", response_model=AdminAIOrchestrationResult)
def query_admin_ai(
    request: AdminAIQueryRequest,
    current_user: Annotated[User, Depends(require_roles(RoleName.ADMIN))],
    orchestrator: Annotated[AdminAIOrchestrator, Depends(get_admin_ai_orchestrator)],
    draft_service: Annotated[
        AdminAIGeneratedQuestionDraftService,
        Depends(get_admin_ai_generated_question_draft_service),
    ],
) -> AdminAIOrchestrationResult:
    try:
        result = AdminAIOrchestrationResult.model_validate(orchestrator.run(
            actor_role=RoleName.ADMIN,
            instruction=request.instruction,
            current_revision_id=request.current_revision_id,
            conversation_context=request.conversation_context,
            actor_user_id=current_user.id,
        ))
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
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Admin AI could not complete the request.") from exc

    generated = result.generated_draft
    if (
        result.response_kind != "mutation_proposal"
        and generated is not None
        and generated.draft_kind == "question"
    ):
        try:
            persistent = draft_service.create_from_generated_draft(
                draft=generated,
                owner_user_id=current_user.id,
                actor_role=RoleName.ADMIN,
                source_revision_id=request.current_revision_id,
            )
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Admin AI generated question draft could not be persisted.",
            ) from exc
        result = result.model_copy(update={
            "persistent_draft_id": persistent.id,
            "persistent_draft_status": persistent.status.value,
        })
    return result


@router.post("/replacement-proposals", response_model=AdminAIReplacementProposalResponse)
def create_admin_ai_replacement_proposal(
    request: AdminAIReplacementProposalRequest,
    current_user: Annotated[User, Depends(require_roles(RoleName.ADMIN))],
    current_revision_service: Annotated[
        AdminAIPlannerCurrentRevisionService, Depends(get_admin_ai_current_revision_service)
    ],
    read_executor: Annotated[AdminAIReadCapabilityExecutor, Depends(get_admin_ai_read_executor)],
    catalog_service: Annotated[AdminAIPlannerCatalogService, Depends(get_admin_ai_catalog_service)],
    proposal_service: Annotated[
        AdminAIMutationProposalService, Depends(get_admin_ai_replacement_proposal_service)
    ],
) -> AdminAIReplacementProposalResponse:
    try:
        current = current_revision_service.resolve(revision_id=request.current_revision_id)
        catalog = catalog_service.build()
        question_type = next(
            entry for entry in catalog.question_types
            if entry.id == current.question_type_id
        )
        envelope = read_executor.hydrate_question_revision_host_context(
            actor_role=RoleName.ADMIN,
            revision_id=request.current_revision_id,
        )
        host_context = AdminAIHostContext(
            context_type="question_revision",
            revision_id=current.revision_id,
            question_type_id=current.question_type_id,
            question_type_name=question_type.name,
            inspect_result=envelope.capability_results[0],
        )
        proposal = proposal_service.create_from_generated_draft(
            host_context=host_context,
            draft=request.generated_draft,
            requested_by_user_id=current_user.id,
        )
    except (
        AdminAIPlannerCatalogGroundingError,
        AdminAIReadCapabilityError,
        AdminAIMutationProposalError,
        StopIteration,
    ) as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Admin AI could not prepare the proposal.",
        ) from exc
    return AdminAIReplacementProposalResponse(
        proposal_id=proposal.id,
        proposal_status=proposal.status.value,
    )


@router.post(
    "/question-drafts/{draft_id}/promote",
    response_model=AdminAIQuestionDraftPromotionResponse,
    status_code=status.HTTP_201_CREATED,
)
def promote_admin_ai_question_draft(
    draft_id: uuid.UUID,
    current_user: Annotated[User, Depends(require_roles(RoleName.ADMIN))],
    draft_service: Annotated[
        AdminAIGeneratedQuestionDraftService,
        Depends(get_admin_ai_generated_question_draft_service),
    ],
) -> AdminAIQuestionDraftPromotionResponse:
    try:
        canonical = draft_service.promote_to_new_question(
            draft_id=draft_id, actor_user_id=current_user.id,
            actor_role=RoleName.ADMIN,
        )
    except AdminAIGeneratedQuestionDraftNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Admin AI question draft was not found.",
        ) from exc
    except (
        AdminAIGeneratedQuestionDraftNotPromotableError,
        AdminAIGeneratedQuestionDraftQuestionTypeError,
    ) as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Admin AI question draft cannot be promoted.",
        ) from exc
    except AdminAIGeneratedQuestionDraftError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Admin AI question draft could not be promoted.",
        ) from exc
    return AdminAIQuestionDraftPromotionResponse(
        draft_id=draft_id,
        draft_status="promoted",
        question_family_id=canonical.question_family_id,
        question_form_id=canonical.question_form_id,
        revision_id=canonical.revision_id,
    )

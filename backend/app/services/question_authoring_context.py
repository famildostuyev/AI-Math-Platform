from __future__ import annotations

import json
import uuid
from datetime import datetime
from typing import Annotated, Literal, Union

from pydantic import BaseModel, ConfigDict, Field, ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.enums import (
    AnswerPolicy,
    ContentBlockType,
    QuestionDifficulty,
    QuestionRevisionProvenanceKind,
    QuestionRevisionStatus,
)
from app.models.ai_authoring_conversation import AIAuthoringConversation
from app.models.question_revision import QuestionRevision
from app.schemas.question_editor import (
    FormulaBlockRead,
    GeometryBlockRead,
    ImageBlockRead,
    QuestionRevisionEditorRead,
    TextBlockRead,
)
from app.schemas.question_answer import AcceptedAnswerRead, AnswerOptionRead
from app.schemas.structured_text import StructuredTextDocument
from app.schemas.question_solution import SolutionFormulaBlockRead, SolutionTextBlockRead
from app.services.question_editor_service import (
    EditorBlockContentMissingError,
    QuestionEditorService,
    RevisionNotFoundError,
    UnsupportedEditorBlockTypeError,
)


class StrictFrozenContextModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class AuthoringSourceContext(StrictFrozenContextModel):
    source_id: uuid.UUID | None
    display_name: str | None
    detail: str | None


class AuthoringTextBlockContext(StrictFrozenContextModel):
    block_type: Literal[ContentBlockType.TEXT]
    block_id: uuid.UUID
    order: int = Field(ge=0)
    source_text: str
    document: StructuredTextDocument
    format_version: Literal[1]


class AuthoringFormulaBlockContext(StrictFrozenContextModel):
    block_type: Literal[ContentBlockType.FORMULA]
    block_id: uuid.UUID
    order: int = Field(ge=0)
    source_latex: str
    format_version: Literal[1]


class AuthoringImageBlockContext(StrictFrozenContextModel):
    block_type: Literal[ContentBlockType.IMAGE]
    block_id: uuid.UUID
    order: int = Field(ge=0)
    media_asset_id: uuid.UUID
    alt_text: str | None


class AuthoringGeometryBlockContext(StrictFrozenContextModel):
    block_type: Literal[ContentBlockType.GEOMETRY]
    block_id: uuid.UUID
    order: int = Field(ge=0)
    source_data: dict[str, object]
    format_version: Literal[1]


AuthoringBlockContext = Annotated[
    Union[
        AuthoringTextBlockContext,
        AuthoringFormulaBlockContext,
        AuthoringImageBlockContext,
        AuthoringGeometryBlockContext,
    ],
    Field(discriminator="block_type"),
]


class AuthoringAnswerOptionContext(StrictFrozenContextModel):
    option_id: uuid.UUID
    label: str | None
    order: int = Field(gt=0)
    source_text: str
    document: StructuredTextDocument
    format_version: Literal[1]
    is_correct: bool


class AuthoringAcceptedAnswerContext(StrictFrozenContextModel):
    answer_id: uuid.UUID
    order: int = Field(gt=0)
    source_text: str
    document: StructuredTextDocument
    format_version: Literal[1]


class AuthoringSolutionTextBlockContext(StrictFrozenContextModel):
    block_type: Literal["text"]
    block_id: uuid.UUID
    order: int = Field(gt=0)
    source_text: str
    document: StructuredTextDocument
    format_version: Literal[1]


class AuthoringSolutionFormulaBlockContext(StrictFrozenContextModel):
    block_type: Literal["formula"]
    block_id: uuid.UUID
    order: int = Field(gt=0)
    source_latex: str
    format_version: Literal[1]


AuthoringSolutionBlockContext = Annotated[
    Union[AuthoringSolutionTextBlockContext, AuthoringSolutionFormulaBlockContext],
    Field(discriminator="block_type"),
]


class AuthoringSolutionContext(StrictFrozenContextModel):
    solution_id: uuid.UUID
    blocks: tuple[AuthoringSolutionBlockContext, ...]


class AuthoringRevisionContext(StrictFrozenContextModel):
    revision_id: uuid.UUID
    revision_number: int = Field(gt=0)
    revision_status: QuestionRevisionStatus
    revision_updated_at: datetime
    provenance_kind: QuestionRevisionProvenanceKind
    question_family_id: uuid.UUID
    question_form_id: uuid.UUID
    question_type_id: uuid.UUID
    primary_topic_id: uuid.UUID | None
    related_topic_ids: tuple[uuid.UUID, ...]
    purpose_ids: tuple[uuid.UUID, ...]
    difficulty: QuestionDifficulty | None
    source: AuthoringSourceContext
    blocks: tuple[AuthoringBlockContext, ...]
    answer_policy: AnswerPolicy = AnswerPolicy.UNSUPPORTED
    answer_options: tuple[AuthoringAnswerOptionContext, ...] = ()
    accepted_answers: tuple[AuthoringAcceptedAnswerContext, ...] = ()
    solution: AuthoringSolutionContext | None = None


class QuestionAuthoringContextError(Exception):
    pass


class AuthoringContextRevisionNotFoundError(QuestionAuthoringContextError):
    pass


class AuthoringContextRevisionInactiveError(QuestionAuthoringContextError):
    pass


class AuthoringContextConversationNotFoundError(QuestionAuthoringContextError):
    pass


class AuthoringContextConversationDeletedError(QuestionAuthoringContextError):
    pass


class AuthoringContextInvalidBlockPayloadError(QuestionAuthoringContextError):
    pass


class AuthoringContextTooLargeError(QuestionAuthoringContextError):
    pass


_EXCLUDED_GEOMETRY_KEYS = {
    "api_key",
    "access_token",
    "refresh_token",
    "authorization",
    "storage_key",
    "storage_path",
    "filesystem_path",
    "raw_provider_response",
    "raw_openai_response",
    "hidden_prompt",
    "system_prompt",
}


def _sanitize_geometry(value: object) -> object:
    if isinstance(value, dict):
        return {
            key: _sanitize_geometry(item)
            for key, item in value.items()
            if key.casefold() not in _EXCLUDED_GEOMETRY_KEYS
        }
    if isinstance(value, list):
        return [_sanitize_geometry(item) for item in value]
    return value


class QuestionAuthoringContextService:
    def __init__(self, db: Session, *, max_chars: int | None = None) -> None:
        self.db = db
        if max_chars is None:
            from app.core.config import settings

            max_chars = settings.AI_AUTHORING_CONTEXT_MAX_CHARS
        self.max_chars = max_chars
        if self.max_chars <= 0:
            raise ValueError("max_chars must be positive.")

    def build_for_revision(
        self, *, revision_id: uuid.UUID
    ) -> AuthoringRevisionContext:
        revision = self.db.scalar(
            select(QuestionRevision).where(QuestionRevision.id == revision_id)
        )
        if revision is None:
            raise AuthoringContextRevisionNotFoundError(
                "Question revision was not found."
            )
        if revision.deleted_at is not None:
            raise AuthoringContextRevisionInactiveError(
                "Question revision is inactive."
            )
        try:
            editor_read = QuestionEditorService(self.db).get_revision_for_editor(
                revision_id=revision_id
            )
        except RevisionNotFoundError as exc:
            raise AuthoringContextRevisionNotFoundError(
                "Active question revision was not found."
            ) from exc
        except (EditorBlockContentMissingError, UnsupportedEditorBlockTypeError) as exc:
            raise AuthoringContextInvalidBlockPayloadError(
                "Question revision contains an invalid block payload."
            ) from exc
        return self._build(editor_read, revision.provenance_kind)

    def build_for_conversation(
        self, *, conversation_id: uuid.UUID
    ) -> AuthoringRevisionContext:
        conversation = self.db.scalar(
            select(AIAuthoringConversation).where(
                AIAuthoringConversation.id == conversation_id
            )
        )
        if conversation is None:
            raise AuthoringContextConversationNotFoundError(
                "AI authoring conversation was not found."
            )
        if conversation.deleted_at is not None:
            raise AuthoringContextConversationDeletedError(
                "AI authoring conversation is deleted."
            )
        # Closed conversations remain readable; only future turn creation is gated.
        return self.build_for_revision(revision_id=conversation.active_revision_id)

    def _build(
        self,
        read: QuestionRevisionEditorRead,
        provenance_kind: QuestionRevisionProvenanceKind,
    ) -> AuthoringRevisionContext:
        try:
            context = AuthoringRevisionContext(
                revision_id=read.revision_id,
                revision_number=read.revision_number,
                revision_status=read.status,
                revision_updated_at=read.updated_at,
                provenance_kind=provenance_kind,
                question_family_id=read.question_family_id,
                question_form_id=read.question_form_id,
                question_type_id=read.question_type_id,
                primary_topic_id=read.primary_topic_id,
                related_topic_ids=tuple(read.related_topic_ids),
                purpose_ids=tuple(read.purpose_ids),
                difficulty=read.difficulty,
                source=AuthoringSourceContext(
                    source_id=read.source_id,
                    display_name=read.source_display_name,
                    detail=read.source_detail,
                ),
                blocks=tuple(self._map_block(block) for block in read.blocks),
                answer_policy=read.answer_policy,
                answer_options=tuple(self._map_option(item) for item in read.answer_options),
                accepted_answers=tuple(self._map_accepted(item) for item in read.accepted_answers),
                solution=(
                    None if read.solution is None else AuthoringSolutionContext(
                        solution_id=read.solution.id,
                        blocks=tuple(self._map_solution_block(item) for item in read.solution.blocks),
                    )
                ),
            )
        except (ValidationError, TypeError, ValueError) as exc:
            raise AuthoringContextInvalidBlockPayloadError(
                "Question revision context could not be assembled."
            ) from exc
        encoded = json.dumps(
            context.model_dump(mode="json"),
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        )
        if len(encoded) > self.max_chars:
            raise AuthoringContextTooLargeError(
                "Question authoring context exceeds the configured size limit."
            )
        return context

    @staticmethod
    def _map_block(block):
        if isinstance(block, TextBlockRead):
            return AuthoringTextBlockContext(
                block_type=ContentBlockType.TEXT,
                block_id=block.id,
                order=block.sort_order,
                source_text=block.payload.source_text,
                document=block.payload.document,
                format_version=block.payload.format_version,
            )
        if isinstance(block, FormulaBlockRead):
            return AuthoringFormulaBlockContext(
                block_type=ContentBlockType.FORMULA,
                block_id=block.id,
                order=block.sort_order,
                source_latex=block.payload.source_latex,
                format_version=block.payload.format_version,
            )
        if isinstance(block, ImageBlockRead):
            return AuthoringImageBlockContext(
                block_type=ContentBlockType.IMAGE,
                block_id=block.id,
                order=block.sort_order,
                media_asset_id=block.payload.media_asset_id,
                alt_text=block.payload.alt_text,
            )
        if isinstance(block, GeometryBlockRead):
            sanitized = _sanitize_geometry(block.payload.source_data)
            if not isinstance(sanitized, dict):
                raise AuthoringContextInvalidBlockPayloadError(
                    "Geometry block payload is invalid."
                )
            return AuthoringGeometryBlockContext(
                block_type=ContentBlockType.GEOMETRY,
                block_id=block.id,
                order=block.sort_order,
                source_data=sanitized,
                format_version=block.payload.format_version,
            )
        raise AuthoringContextInvalidBlockPayloadError(
            "Question revision contains an unsupported block type."
        )

    @staticmethod
    def _map_option(item: AnswerOptionRead) -> AuthoringAnswerOptionContext:
        return AuthoringAnswerOptionContext(
            option_id=item.id, label=item.label, order=item.order_index,
            source_text=item.source_text, document=item.document,
            format_version=item.format_version, is_correct=item.is_correct,
        )

    @staticmethod
    def _map_accepted(item: AcceptedAnswerRead) -> AuthoringAcceptedAnswerContext:
        return AuthoringAcceptedAnswerContext(
            answer_id=item.id, order=item.order_index,
            source_text=item.source_text, document=item.document,
            format_version=item.format_version,
        )

    @staticmethod
    def _map_solution_block(item):
        if isinstance(item, SolutionTextBlockRead):
            return AuthoringSolutionTextBlockContext(
                block_type="text", block_id=item.id, order=item.sort_order,
                source_text=item.source_text, document=item.document,
                format_version=item.format_version,
            )
        if isinstance(item, SolutionFormulaBlockRead):
            return AuthoringSolutionFormulaBlockContext(
                block_type="formula", block_id=item.id, order=item.sort_order,
                source_latex=item.source_latex, format_version=item.format_version,
            )
        raise AuthoringContextInvalidBlockPayloadError("Solution contains an unsupported block type.")

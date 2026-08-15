from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.enums import (
    ContentBlockType,
    QuestionFamilyOriginKind,
    QuestionFormDerivationKind,
    QuestionRevisionProvenanceKind,
    QuestionRevisionStatus,
)
from app.models.content_block import ContentBlock
from app.models.formula_block_content import FormulaBlockContent
from app.models.purpose import Purpose
from app.models.question_family import QuestionFamily
from app.models.question_form import QuestionForm
from app.models.question_revision import QuestionRevision
from app.models.question_revision_purpose import QuestionRevisionPurpose
from app.models.question_revision_related_topic import QuestionRevisionRelatedTopic
from app.models.question_type import QuestionType
from app.models.text_block_content import TextBlockContent
from app.models.topic import Topic
from app.schemas.question_editor import (
    BlockOrderRequest,
    FormulaBlockCreate,
    FormulaBlockPayloadRead,
    FormulaBlockRead,
    FormulaBlockUpdate,
    GeometryBlockPayloadRead,
    GeometryBlockRead,
    ImageBlockPayloadRead,
    ImageBlockRead,
    QuestionDraftCreate,
    QuestionDraftRead,
    QuestionRevisionEditorRead,
    TextBlockCreate,
    TextBlockPayloadRead,
    TextBlockRead,
    TextBlockUpdate,
)
from app.services.structured_text_service import (
    normalize_text_content,
    prepare_structured_text_write,
)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class QuestionEditorServiceError(Exception):
    """Base exception for Question Editor service failures."""


class QuestionTypeNotFoundError(QuestionEditorServiceError):
    """Raised when the requested question type is unavailable."""


class TopicNotFoundError(QuestionEditorServiceError):
    """Raised when a requested topic is unavailable."""


class PurposeNotFoundError(QuestionEditorServiceError):
    """Raised when a requested purpose is unavailable."""


class RevisionNotFoundError(QuestionEditorServiceError):
    """Raised when a revision is unavailable to the editor."""


class RevisionNotEditableError(QuestionEditorServiceError):
    """Raised when a revision is not in draft status."""


class UnsupportedEditorBlockTypeError(QuestionEditorServiceError):
    """Raised when an editor read encounters a deferred block type."""


class EditorBlockContentMissingError(QuestionEditorServiceError):
    """Raised when a persisted block has no matching payload row."""


class EditorBlockNotFoundError(QuestionEditorServiceError):
    """Raised when a block is unavailable within the target revision."""


class EditorBlockTypeMismatchError(QuestionEditorServiceError):
    """Raised when a mutation targets the wrong block type."""


class RevisionConflictError(QuestionEditorServiceError):
    """Raised when an optimistic concurrency timestamp is stale."""


class ContentBlockOrderConflictError(QuestionEditorServiceError):
    """Raised when an active block append position conflicts."""


class BlockOrderSetMismatchError(QuestionEditorServiceError):
    """Raised when a reorder request does not contain every active block."""


class QuestionEditorService:
    """Transactional application service for the Admin Question Editor."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def create_draft(
        self,
        *,
        draft: QuestionDraftCreate,
        actor_id: uuid.UUID,
    ) -> QuestionDraftRead:
        """Create one authored family, original form, and draft revision."""

        try:
            self._require_question_type(draft.question_type_id)
            if draft.primary_topic_id is not None:
                self._require_topic(draft.primary_topic_id)
            for topic_id in draft.related_topic_ids:
                self._require_topic(topic_id)
            for purpose_id in draft.purpose_ids:
                self._require_purpose(purpose_id)

            family = QuestionFamily(
                source_family_id=None,
                origin_kind=QuestionFamilyOriginKind.AUTHORED,
                created_by_user_id=actor_id,
                is_active=True,
            )
            self.db.add(family)
            self.db.flush()

            form = QuestionForm(
                question_family_id=family.id,
                question_type_id=draft.question_type_id,
                source_form_id=None,
                derivation_kind=QuestionFormDerivationKind.ORIGINAL,
                open_response_mode=None,
                is_original=True,
                is_active=True,
            )
            self.db.add(form)
            self.db.flush()

            revision = QuestionRevision(
                question_form_id=form.id,
                revision_number=1,
                based_on_revision_id=None,
                status=QuestionRevisionStatus.DRAFT,
                provenance_kind=QuestionRevisionProvenanceKind.HUMAN_AUTHORED,
                difficulty=None,
                primary_topic_id=draft.primary_topic_id,
                created_by_user_id=actor_id,
                reviewed_by_user_id=None,
                reviewed_at=None,
                is_current_approved=False,
            )
            self.db.add(revision)
            self.db.flush()

            links = [
                QuestionRevisionRelatedTopic(
                    question_revision_id=revision.id,
                    topic_id=topic_id,
                )
                for topic_id in draft.related_topic_ids
            ]
            links.extend(
                QuestionRevisionPurpose(
                    question_revision_id=revision.id,
                    purpose_id=purpose_id,
                )
                for purpose_id in draft.purpose_ids
            )
            if links:
                self.db.add_all(links)

            self.db.commit()
            self.db.refresh(revision)

            return self._draft_read(
                family=family,
                form=form,
                revision=revision,
                related_topic_ids=draft.related_topic_ids,
                purpose_ids=draft.purpose_ids,
            )
        except Exception:
            self.db.rollback()
            raise

    def get_revision_for_editor(
        self,
        *,
        revision_id: uuid.UUID,
    ) -> QuestionRevisionEditorRead:
        """Read one active revision aggregate in editor form."""

        revision = self.db.scalar(
            select(QuestionRevision)
            .join(
                QuestionForm,
                QuestionForm.id == QuestionRevision.question_form_id,
            )
            .join(
                QuestionFamily,
                QuestionFamily.id == QuestionForm.question_family_id,
            )
            .where(
                QuestionRevision.id == revision_id,
                QuestionRevision.deleted_at.is_(None),
                QuestionForm.is_active.is_(True),
                QuestionForm.deleted_at.is_(None),
                QuestionFamily.is_active.is_(True),
                QuestionFamily.deleted_at.is_(None),
            )
        )
        if revision is None:
            raise RevisionNotFoundError("Question revision was not found.")

        related_topic_ids = list(self.db.scalars(
            select(QuestionRevisionRelatedTopic.topic_id)
            .join(Topic, Topic.id == QuestionRevisionRelatedTopic.topic_id)
            .where(
                QuestionRevisionRelatedTopic.question_revision_id == revision.id,
                QuestionRevisionRelatedTopic.deleted_at.is_(None),
                Topic.is_active.is_(True),
                Topic.deleted_at.is_(None),
            )
            .order_by(QuestionRevisionRelatedTopic.id)
        ).all())
        purpose_ids = list(self.db.scalars(
            select(QuestionRevisionPurpose.purpose_id)
            .join(Purpose, Purpose.id == QuestionRevisionPurpose.purpose_id)
            .where(
                QuestionRevisionPurpose.question_revision_id == revision.id,
                QuestionRevisionPurpose.deleted_at.is_(None),
                Purpose.is_active.is_(True),
                Purpose.deleted_at.is_(None),
            )
            .order_by(QuestionRevisionPurpose.id)
        ).all())
        blocks = list(self.db.scalars(
            select(ContentBlock)
            .where(
                ContentBlock.question_revision_id == revision.id,
                ContentBlock.deleted_at.is_(None),
            )
            .order_by(ContentBlock.sort_order, ContentBlock.id)
        ).all())

        form = revision.question_form
        family = form.question_family
        draft_read = self._draft_read(
            family=family,
            form=form,
            revision=revision,
            related_topic_ids=related_topic_ids,
            purpose_ids=purpose_ids,
        )
        return QuestionRevisionEditorRead(
            **draft_read.model_dump(),
            blocks=[self._serialize_block(block) for block in blocks],
        )

    def create_text_block(
        self,
        *,
        revision_id: uuid.UUID,
        request: TextBlockCreate,
    ) -> TextBlockRead:
        """Append one canonical structured-text block to a draft revision."""

        try:
            revision = self.db.scalar(
                select(QuestionRevision)
                .join(
                    QuestionForm,
                    QuestionForm.id == QuestionRevision.question_form_id,
                )
                .join(
                    QuestionFamily,
                    QuestionFamily.id == QuestionForm.question_family_id,
                )
                .where(
                    QuestionRevision.id == revision_id,
                    QuestionRevision.deleted_at.is_(None),
                    QuestionForm.is_active.is_(True),
                    QuestionForm.deleted_at.is_(None),
                    QuestionFamily.is_active.is_(True),
                    QuestionFamily.deleted_at.is_(None),
                )
                .with_for_update()
            )
            if revision is None:
                raise RevisionNotFoundError(
                    "Question revision was not found."
                )

            self.ensure_revision_editable(revision)
            self.ensure_revision_timestamp_matches(
                revision,
                request.expected_revision_updated_at,
            )
            prepared = prepare_structured_text_write(
                request.payload.document,
                request.payload.format_version,
            )

            maximum_sort_order = self.db.scalar(
                select(func.max(ContentBlock.sort_order)).where(
                    ContentBlock.question_revision_id == revision.id,
                    ContentBlock.deleted_at.is_(None),
                )
            )
            sort_order = (maximum_sort_order or 0) + 1000

            block = ContentBlock(
                question_revision_id=revision.id,
                block_type=ContentBlockType.TEXT,
                sort_order=sort_order,
            )
            self.db.add(block)
            self.db.flush()

            content = TextBlockContent(
                content_block_id=block.id,
                source_text=prepared.source_text,
                document_data=prepared.document_data,
                format_version=prepared.format_version,
            )
            self.db.add(content)
            revision.updated_at = _utc_now()

            self.db.commit()

            return TextBlockRead(
                id=block.id,
                block_type=ContentBlockType.TEXT,
                sort_order=block.sort_order,
                payload=TextBlockPayloadRead(
                    source_text=prepared.source_text,
                    document=request.payload.document,
                    format_version=prepared.format_version,
                ),
            )
        except IntegrityError as exc:
            self.db.rollback()
            raise ContentBlockOrderConflictError(
                "The active block append position is no longer available."
            ) from exc
        except Exception:
            self.db.rollback()
            raise

    def create_formula_block(
        self,
        *,
        revision_id: uuid.UUID,
        request: FormulaBlockCreate,
    ) -> FormulaBlockRead:
        """Append one formula block to an editable draft revision."""

        try:
            revision = self.db.scalar(
                select(QuestionRevision)
                .join(
                    QuestionForm,
                    QuestionForm.id == QuestionRevision.question_form_id,
                )
                .join(
                    QuestionFamily,
                    QuestionFamily.id == QuestionForm.question_family_id,
                )
                .where(
                    QuestionRevision.id == revision_id,
                    QuestionRevision.deleted_at.is_(None),
                    QuestionForm.is_active.is_(True),
                    QuestionForm.deleted_at.is_(None),
                    QuestionFamily.is_active.is_(True),
                    QuestionFamily.deleted_at.is_(None),
                )
                .with_for_update()
            )
            if revision is None:
                raise RevisionNotFoundError(
                    "Question revision was not found."
                )

            self.ensure_revision_editable(revision)
            self.ensure_revision_timestamp_matches(
                revision,
                request.expected_revision_updated_at,
            )

            maximum_sort_order = self.db.scalar(
                select(func.max(ContentBlock.sort_order)).where(
                    ContentBlock.question_revision_id == revision.id,
                    ContentBlock.deleted_at.is_(None),
                )
            )
            sort_order = (maximum_sort_order or 0) + 1000

            block = ContentBlock(
                question_revision_id=revision.id,
                block_type=ContentBlockType.FORMULA,
                sort_order=sort_order,
            )
            self.db.add(block)
            self.db.flush()

            content = FormulaBlockContent(
                content_block_id=block.id,
                source_latex=request.payload.source_latex,
                format_version=request.payload.format_version,
            )
            self.db.add(content)
            revision.updated_at = _utc_now()

            self.db.commit()

            return FormulaBlockRead(
                id=block.id,
                block_type=ContentBlockType.FORMULA,
                sort_order=block.sort_order,
                payload=FormulaBlockPayloadRead(
                    source_latex=content.source_latex,
                    format_version=content.format_version,
                ),
            )
        except IntegrityError as exc:
            self.db.rollback()
            raise ContentBlockOrderConflictError(
                "The active block append position is no longer available."
            ) from exc
        except Exception:
            self.db.rollback()
            raise

    def ensure_revision_editable(self, revision: QuestionRevision) -> None:
        """Require the only currently editable revision state: draft."""

        if revision.status != QuestionRevisionStatus.DRAFT:
            raise RevisionNotEditableError(
                "Only draft revisions can be edited."
            )

    def ensure_revision_timestamp_matches(
        self,
        revision: QuestionRevision,
        expected_revision_updated_at: datetime,
    ) -> None:
        """Require an exact optimistic concurrency timestamp match."""

        if revision.updated_at != expected_revision_updated_at:
            raise RevisionConflictError(
                "Question revision was modified by another request."
            )

    def update_text_block(
        self,
        *,
        revision_id: uuid.UUID,
        block_id: uuid.UUID,
        request: TextBlockUpdate,
    ) -> TextBlockRead:
        """Replace one existing text payload without changing block identity."""

        try:
            revision = self.db.scalar(
                select(QuestionRevision)
                .join(
                    QuestionForm,
                    QuestionForm.id == QuestionRevision.question_form_id,
                )
                .join(
                    QuestionFamily,
                    QuestionFamily.id == QuestionForm.question_family_id,
                )
                .where(
                    QuestionRevision.id == revision_id,
                    QuestionRevision.deleted_at.is_(None),
                    QuestionForm.is_active.is_(True),
                    QuestionForm.deleted_at.is_(None),
                    QuestionFamily.is_active.is_(True),
                    QuestionFamily.deleted_at.is_(None),
                )
                .with_for_update()
            )
            if revision is None:
                raise RevisionNotFoundError(
                    "Question revision was not found."
                )

            self.ensure_revision_editable(revision)
            self.ensure_revision_timestamp_matches(
                revision,
                request.expected_revision_updated_at,
            )

            block = self.db.scalar(
                select(ContentBlock)
                .where(
                    ContentBlock.id == block_id,
                    ContentBlock.question_revision_id == revision.id,
                    ContentBlock.deleted_at.is_(None),
                )
                .with_for_update()
            )
            if block is None:
                raise EditorBlockNotFoundError(
                    "Content block was not found in the revision."
                )
            if block.block_type != ContentBlockType.TEXT:
                raise EditorBlockTypeMismatchError(
                    "Content block is not a text block."
                )

            content = block.text_content
            if content is None:
                raise EditorBlockContentMissingError(
                    "Text block content is missing."
                )

            prepared = prepare_structured_text_write(
                request.document,
                request.format_version,
            )
            content.source_text = prepared.source_text
            content.document_data = prepared.document_data
            content.format_version = prepared.format_version
            revision.updated_at = _utc_now()

            self.db.commit()

            return TextBlockRead(
                id=block.id,
                block_type=ContentBlockType.TEXT,
                sort_order=block.sort_order,
                payload=TextBlockPayloadRead(
                    source_text=prepared.source_text,
                    document=request.document,
                    format_version=prepared.format_version,
                ),
            )
        except Exception:
            self.db.rollback()
            raise

    def update_formula_block(
        self,
        *,
        revision_id: uuid.UUID,
        block_id: uuid.UUID,
        request: FormulaBlockUpdate,
    ) -> FormulaBlockRead:
        """Replace one formula payload without changing block identity."""

        try:
            revision = self.db.scalar(
                select(QuestionRevision)
                .join(
                    QuestionForm,
                    QuestionForm.id == QuestionRevision.question_form_id,
                )
                .join(
                    QuestionFamily,
                    QuestionFamily.id == QuestionForm.question_family_id,
                )
                .where(
                    QuestionRevision.id == revision_id,
                    QuestionRevision.deleted_at.is_(None),
                    QuestionForm.is_active.is_(True),
                    QuestionForm.deleted_at.is_(None),
                    QuestionFamily.is_active.is_(True),
                    QuestionFamily.deleted_at.is_(None),
                )
                .with_for_update()
            )
            if revision is None:
                raise RevisionNotFoundError(
                    "Question revision was not found."
                )

            self.ensure_revision_editable(revision)
            self.ensure_revision_timestamp_matches(
                revision,
                request.expected_revision_updated_at,
            )

            block = self.db.scalar(
                select(ContentBlock)
                .where(
                    ContentBlock.id == block_id,
                    ContentBlock.question_revision_id == revision.id,
                    ContentBlock.deleted_at.is_(None),
                )
                .with_for_update()
            )
            if block is None:
                raise EditorBlockNotFoundError(
                    "Content block was not found in the revision."
                )
            if block.block_type != ContentBlockType.FORMULA:
                raise EditorBlockTypeMismatchError(
                    "Content block is not a formula block."
                )

            content = block.formula_content
            if content is None:
                raise EditorBlockContentMissingError(
                    "Formula block content is missing."
                )

            content.source_latex = request.source_latex
            content.format_version = request.format_version
            revision.updated_at = _utc_now()

            self.db.commit()

            return FormulaBlockRead(
                id=block.id,
                block_type=ContentBlockType.FORMULA,
                sort_order=block.sort_order,
                payload=FormulaBlockPayloadRead(
                    source_latex=content.source_latex,
                    format_version=content.format_version,
                ),
            )
        except Exception:
            self.db.rollback()
            raise

    def delete_block(
        self,
        *,
        revision_id: uuid.UUID,
        block_id: uuid.UUID,
        expected_revision_updated_at: datetime,
    ) -> None:
        """Soft-delete one active block while preserving its payload rows."""

        try:
            revision = self.db.scalar(
                select(QuestionRevision)
                .join(
                    QuestionForm,
                    QuestionForm.id == QuestionRevision.question_form_id,
                )
                .join(
                    QuestionFamily,
                    QuestionFamily.id == QuestionForm.question_family_id,
                )
                .where(
                    QuestionRevision.id == revision_id,
                    QuestionRevision.deleted_at.is_(None),
                    QuestionForm.is_active.is_(True),
                    QuestionForm.deleted_at.is_(None),
                    QuestionFamily.is_active.is_(True),
                    QuestionFamily.deleted_at.is_(None),
                )
                .with_for_update()
            )
            if revision is None:
                raise RevisionNotFoundError(
                    "Question revision was not found."
                )

            self.ensure_revision_editable(revision)
            self.ensure_revision_timestamp_matches(
                revision,
                expected_revision_updated_at,
            )

            block = self.db.scalar(
                select(ContentBlock)
                .where(
                    ContentBlock.id == block_id,
                    ContentBlock.question_revision_id == revision.id,
                    ContentBlock.deleted_at.is_(None),
                )
                .with_for_update()
            )
            if block is None:
                raise EditorBlockNotFoundError(
                    "Content block was not found in the revision."
                )

            deleted_at = _utc_now()
            block.deleted_at = deleted_at
            revision.updated_at = deleted_at

            self.db.commit()
        except Exception:
            self.db.rollback()
            raise

    def reorder_blocks(
        self,
        *,
        revision_id: uuid.UUID,
        request: BlockOrderRequest,
    ) -> None:
        """Replace the complete active block order with normalized positions."""

        try:
            revision = self.db.scalar(
                select(QuestionRevision)
                .join(
                    QuestionForm,
                    QuestionForm.id == QuestionRevision.question_form_id,
                )
                .join(
                    QuestionFamily,
                    QuestionFamily.id == QuestionForm.question_family_id,
                )
                .where(
                    QuestionRevision.id == revision_id,
                    QuestionRevision.deleted_at.is_(None),
                    QuestionForm.is_active.is_(True),
                    QuestionForm.deleted_at.is_(None),
                    QuestionFamily.is_active.is_(True),
                    QuestionFamily.deleted_at.is_(None),
                )
                .with_for_update()
            )
            if revision is None:
                raise RevisionNotFoundError(
                    "Question revision was not found."
                )

            self.ensure_revision_editable(revision)
            self.ensure_revision_timestamp_matches(
                revision,
                request.expected_revision_updated_at,
            )

            blocks = list(self.db.scalars(
                select(ContentBlock)
                .where(
                    ContentBlock.question_revision_id == revision.id,
                    ContentBlock.deleted_at.is_(None),
                )
                .order_by(ContentBlock.sort_order, ContentBlock.id)
                .with_for_update()
            ).all())
            block_by_id = {block.id: block for block in blocks}
            requested_ids = request.block_ids
            if (
                len(requested_ids) != len(blocks)
                or set(requested_ids) != set(block_by_id)
            ):
                raise BlockOrderSetMismatchError(
                    "Block order must contain exactly every active block."
                )

            if blocks:
                current_max = max(block.sort_order for block in blocks)
                final_max = len(blocks) * 1000
                temporary_base = max(current_max, final_max) + 1_000_000
                for position, block_id in enumerate(requested_ids):
                    block_by_id[block_id].sort_order = (
                        temporary_base + ((position + 1) * 1000)
                    )
                self.db.flush()

                for position, block_id in enumerate(requested_ids):
                    block_by_id[block_id].sort_order = (position + 1) * 1000

            revision.updated_at = _utc_now()
            self.db.commit()
        except IntegrityError as exc:
            self.db.rollback()
            raise ContentBlockOrderConflictError(
                "The active block order could not be persisted."
            ) from exc
        except Exception:
            self.db.rollback()
            raise

    def _require_question_type(self, question_type_id: uuid.UUID) -> None:
        question_type = self.db.scalar(
            select(QuestionType).where(
                QuestionType.id == question_type_id,
                QuestionType.is_active.is_(True),
                QuestionType.deleted_at.is_(None),
            )
        )
        if question_type is None:
            raise QuestionTypeNotFoundError(
                "Active question type was not found."
            )

    def _require_topic(self, topic_id: uuid.UUID) -> None:
        topic = self.db.scalar(
            select(Topic).where(
                Topic.id == topic_id,
                Topic.is_active.is_(True),
                Topic.deleted_at.is_(None),
            )
        )
        if topic is None:
            raise TopicNotFoundError("Active topic was not found.")

    def _require_purpose(self, purpose_id: uuid.UUID) -> None:
        purpose = self.db.scalar(
            select(Purpose).where(
                Purpose.id == purpose_id,
                Purpose.is_active.is_(True),
                Purpose.deleted_at.is_(None),
            )
        )
        if purpose is None:
            raise PurposeNotFoundError("Active purpose was not found.")

    def _draft_read(
        self,
        *,
        family: QuestionFamily,
        form: QuestionForm,
        revision: QuestionRevision,
        related_topic_ids: list[uuid.UUID],
        purpose_ids: list[uuid.UUID],
    ) -> QuestionDraftRead:
        return QuestionDraftRead(
            question_family_id=family.id,
            question_form_id=form.id,
            revision_id=revision.id,
            revision_number=revision.revision_number,
            status=revision.status,
            question_type_id=form.question_type_id,
            primary_topic_id=revision.primary_topic_id,
            related_topic_ids=related_topic_ids,
            purpose_ids=purpose_ids,
            difficulty=revision.difficulty,
            updated_at=revision.updated_at,
        )

    def _serialize_block(self, block: ContentBlock):
        try:
            block_type = ContentBlockType(block.block_type)
        except ValueError as exc:
            raise UnsupportedEditorBlockTypeError(
                f"Unsupported editor block type: {block.block_type!r}."
            ) from exc

        if block_type == ContentBlockType.TEXT:
            content = block.text_content
            if content is None:
                raise EditorBlockContentMissingError(
                    "Text block content is missing."
                )
            document = normalize_text_content(
                source_text=content.source_text,
                document_data=content.document_data,
                format_version=content.format_version,
            )
            return TextBlockRead(
                id=block.id,
                block_type=block_type,
                sort_order=block.sort_order,
                payload=TextBlockPayloadRead(
                    source_text=content.source_text,
                    document=document,
                    format_version=content.format_version,
                ),
            )
        if block_type == ContentBlockType.FORMULA:
            content = block.formula_content
            if content is None:
                raise EditorBlockContentMissingError(
                    "Formula block content is missing."
                )
            return FormulaBlockRead(
                id=block.id,
                block_type=block_type,
                sort_order=block.sort_order,
                payload=FormulaBlockPayloadRead(
                    source_latex=content.source_latex,
                    format_version=content.format_version,
                ),
            )
        if block_type == ContentBlockType.IMAGE:
            content = block.image_content
            if content is None:
                raise EditorBlockContentMissingError(
                    "Image block content is missing."
                )
            return ImageBlockRead(
                id=block.id,
                block_type=block_type,
                sort_order=block.sort_order,
                payload=ImageBlockPayloadRead(
                    media_asset_id=content.media_asset_id,
                    alt_text=content.alt_text,
                ),
            )
        if block_type == ContentBlockType.GEOMETRY:
            content = block.geometry_content
            if content is None:
                raise EditorBlockContentMissingError(
                    "Geometry block content is missing."
                )
            return GeometryBlockRead(
                id=block.id,
                block_type=block_type,
                sort_order=block.sort_order,
                payload=GeometryBlockPayloadRead(
                    source_data=content.source_data,
                    format_version=content.format_version,
                ),
            )
        raise UnsupportedEditorBlockTypeError(
            f"Unsupported editor block type: {block_type.value}."
        )

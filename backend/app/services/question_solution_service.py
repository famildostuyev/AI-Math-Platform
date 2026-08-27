from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.enums import QuestionRevisionStatus, SolutionBlockType
from app.models.question_family import QuestionFamily
from app.models.question_form import QuestionForm
from app.models.question_revision import QuestionRevision
from app.models.solution import Solution
from app.models.solution_block import SolutionBlock
from app.schemas.question_solution import (
    SolutionBlockOrderRequest,
    SolutionFormulaBlockCreate,
    SolutionFormulaBlockRead,
    SolutionFormulaBlockUpdate,
    SolutionRead,
    SolutionTextBlockCreate,
    SolutionTextBlockRead,
    SolutionTextBlockUpdate,
)
from app.services.structured_text_service import (
    normalize_text_content,
    prepare_structured_text_write,
)
from app.services.authoring_action import (
    CreateSolutionAction, DeleteSolutionAction,
    CreateSolutionTextBlockAction, UpdateSolutionTextBlockAction,
    CreateSolutionFormulaBlockAction, UpdateSolutionFormulaBlockAction,
    DeleteSolutionBlockAction, ReorderSolutionBlocksAction,
)


class QuestionSolutionServiceError(Exception):
    pass


class SolutionRevisionNotFoundError(QuestionSolutionServiceError):
    pass


class SolutionRevisionNotEditableError(QuestionSolutionServiceError):
    pass


class SolutionRevisionConflictError(QuestionSolutionServiceError):
    pass


class SolutionNotFoundError(QuestionSolutionServiceError):
    pass


class SolutionAlreadyExistsError(QuestionSolutionServiceError):
    pass


class SolutionBlockNotFoundError(QuestionSolutionServiceError):
    pass


class SolutionBlockTypeMismatchError(QuestionSolutionServiceError):
    pass


class SolutionBlockOrderSetMismatchError(QuestionSolutionServiceError):
    pass


class SolutionIntegrityConflictError(QuestionSolutionServiceError):
    pass


class QuestionSolutionService:
    """Canonical ADF-1 solution mutations for one question revision."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def get_solution(self, *, revision_id: uuid.UUID) -> SolutionRead | None:
        self._active_revision(revision_id, lock=False)
        solution = self._solution_for_revision(revision_id, lock=False)
        return None if solution is None else self.project_solution(solution)

    def apply_authoring_actions(self, *, revision: QuestionRevision, actions: list, now: datetime) -> None:
        """Apply solution actions without commit; the proposal transaction owns atomicity."""
        solution = self._solution_for_revision(revision.id, lock=True)
        blocks = [] if solution is None else self._active_blocks(solution.id, lock=True)
        by_id = {block.id: block for block in blocks}
        active = solution is not None

        for action in actions:
            if isinstance(action, CreateSolutionAction):
                if active:
                    raise SolutionAlreadyExistsError("An active solution already exists.")
                active = True
            elif isinstance(action, DeleteSolutionAction):
                if not active:
                    raise SolutionNotFoundError("Active solution was not found.")
                active = False
                by_id.clear()
            elif isinstance(action, (CreateSolutionTextBlockAction, CreateSolutionFormulaBlockAction)):
                if not active:
                    raise SolutionNotFoundError("Create the solution before creating blocks.")
            elif isinstance(action, (UpdateSolutionTextBlockAction, UpdateSolutionFormulaBlockAction, DeleteSolutionBlockAction)):
                if not active or action.solution_block_id not in by_id:
                    raise SolutionBlockNotFoundError("Solution block was not found.")
                block = by_id[action.solution_block_id]
                if isinstance(action, UpdateSolutionTextBlockAction) and SolutionBlockType(block.block_type) != SolutionBlockType.TEXT:
                    raise SolutionBlockTypeMismatchError("Solution block type cannot be changed.")
                if isinstance(action, UpdateSolutionFormulaBlockAction) and SolutionBlockType(block.block_type) != SolutionBlockType.FORMULA:
                    raise SolutionBlockTypeMismatchError("Solution block type cannot be changed.")
                if isinstance(action, DeleteSolutionBlockAction):
                    del by_id[action.solution_block_id]
            elif isinstance(action, ReorderSolutionBlocksAction):
                if not active or set(action.ordered_solution_block_ids) != set(by_id):
                    raise SolutionBlockOrderSetMismatchError("Order must contain every active solution block exactly once.")

        solution = self._solution_for_revision(revision.id, lock=True)
        blocks = [] if solution is None else self._active_blocks(solution.id, lock=True)
        by_id = {block.id: block for block in blocks}
        for action in actions:
            if isinstance(action, CreateSolutionAction):
                solution = Solution(question_revision_id=revision.id)
                self.db.add(solution)
                self.db.flush()
            elif isinstance(action, DeleteSolutionAction):
                assert solution is not None
                for block in by_id.values():
                    block.deleted_at = now
                solution.deleted_at = now
            elif isinstance(action, (CreateSolutionTextBlockAction, CreateSolutionFormulaBlockAction)):
                assert solution is not None
                prepared = prepare_structured_text_write(action.payload.document, action.payload.format_version) if isinstance(action, CreateSolutionTextBlockAction) else None
                block = SolutionBlock(
                    solution_id=solution.id,
                    block_type=SolutionBlockType.TEXT if prepared else SolutionBlockType.FORMULA,
                    sort_order=max((item.sort_order for item in by_id.values()), default=0) + 1000,
                    source_text=None if prepared is None else prepared.source_text,
                    document_data=None if prepared is None else prepared.document_data,
                    source_latex=action.payload.source_latex if prepared is None else None,
                    format_version=action.payload.format_version,
                )
                self.db.add(block); self.db.flush(); by_id[block.id] = block
            elif isinstance(action, UpdateSolutionTextBlockAction):
                prepared = prepare_structured_text_write(action.payload.document, action.payload.format_version)
                block = by_id[action.solution_block_id]
                block.source_text, block.document_data, block.format_version = prepared.source_text, prepared.document_data, prepared.format_version
            elif isinstance(action, UpdateSolutionFormulaBlockAction):
                block = by_id[action.solution_block_id]
                block.source_latex, block.format_version = action.payload.source_latex, action.payload.format_version
            elif isinstance(action, DeleteSolutionBlockAction):
                by_id[action.solution_block_id].deleted_at = now
            elif isinstance(action, ReorderSolutionBlocksAction):
                ordered = action.ordered_solution_block_ids
                temporary = max(max((by_id[item].sort_order for item in ordered), default=0), len(ordered) * 1000) + 1_000_000
                for position, item in enumerate(ordered, 1): by_id[item].sort_order = temporary + position * 1000
                self.db.flush()
                for position, item in enumerate(ordered, 1): by_id[item].sort_order = position * 1000

    def project_solution(self, solution: Solution) -> SolutionRead:
        """Project one already-loaded canonical solution with active blocks."""
        return SolutionRead(
            id=solution.id,
            blocks=[self._block_read(block) for block in self._active_blocks(solution.id, lock=False)],
        )

    def create_solution(
        self, *, revision_id: uuid.UUID, expected_revision_updated_at: datetime
    ) -> SolutionRead:
        try:
            revision = self._editable_revision(revision_id, expected_revision_updated_at)
            if self._solution_for_revision(revision.id, lock=True) is not None:
                raise SolutionAlreadyExistsError("An active solution already exists.")
            solution = Solution(question_revision_id=revision.id)
            self.db.add(solution)
            self.db.flush()
            self._touch(revision)
            self.db.commit()
            self.db.refresh(solution)
            return self.project_solution(solution)
        except IntegrityError as exc:
            self.db.rollback()
            raise SolutionIntegrityConflictError("An active solution already exists.") from exc
        except Exception:
            self.db.rollback()
            raise

    def delete_solution(
        self, *, revision_id: uuid.UUID, expected_revision_updated_at: datetime
    ) -> None:
        try:
            revision = self._editable_revision(revision_id, expected_revision_updated_at)
            solution = self._require_solution(revision.id, lock=True)
            now = datetime.now(timezone.utc)
            for block in self._active_blocks(solution.id, lock=True):
                block.deleted_at = now
            solution.deleted_at = now
            self._touch(revision)
            self.db.commit()
        except Exception:
            self.db.rollback()
            raise

    def create_text_block(
        self, *, revision_id: uuid.UUID, request: SolutionTextBlockCreate
    ) -> SolutionTextBlockRead:
        prepared = prepare_structured_text_write(
            request.payload.document, request.payload.format_version
        )
        return self._create_block(
            revision_id=revision_id,
            expected=request.expected_revision_updated_at,
            block_type=SolutionBlockType.TEXT,
            source_text=prepared.source_text,
            document_data=prepared.document_data,
            source_latex=None,
            format_version=prepared.format_version,
        )

    def create_formula_block(
        self, *, revision_id: uuid.UUID, request: SolutionFormulaBlockCreate
    ) -> SolutionFormulaBlockRead:
        return self._create_block(
            revision_id=revision_id,
            expected=request.expected_revision_updated_at,
            block_type=SolutionBlockType.FORMULA,
            source_text=None,
            document_data=None,
            source_latex=request.payload.source_latex,
            format_version=request.payload.format_version,
        )

    def update_text_block(
        self, *, revision_id: uuid.UUID, block_id: uuid.UUID,
        request: SolutionTextBlockUpdate,
    ) -> SolutionTextBlockRead:
        prepared = prepare_structured_text_write(
            request.payload.document, request.payload.format_version
        )
        return self._update_block(
            revision_id=revision_id, block_id=block_id,
            expected=request.expected_revision_updated_at,
            expected_type=SolutionBlockType.TEXT,
            source_text=prepared.source_text, document_data=prepared.document_data,
            source_latex=None, format_version=prepared.format_version,
        )

    def update_formula_block(
        self, *, revision_id: uuid.UUID, block_id: uuid.UUID,
        request: SolutionFormulaBlockUpdate,
    ) -> SolutionFormulaBlockRead:
        return self._update_block(
            revision_id=revision_id, block_id=block_id,
            expected=request.expected_revision_updated_at,
            expected_type=SolutionBlockType.FORMULA,
            source_text=None, document_data=None,
            source_latex=request.payload.source_latex,
            format_version=request.payload.format_version,
        )

    def delete_block(
        self, *, revision_id: uuid.UUID, block_id: uuid.UUID,
        expected_revision_updated_at: datetime,
    ) -> None:
        try:
            revision = self._editable_revision(revision_id, expected_revision_updated_at)
            solution = self._require_solution(revision.id, lock=True)
            block = self._require_block(solution.id, block_id, lock=True)
            block.deleted_at = datetime.now(timezone.utc)
            self._touch(revision)
            self.db.commit()
        except Exception:
            self.db.rollback()
            raise

    def reorder_blocks(
        self, *, revision_id: uuid.UUID, request: SolutionBlockOrderRequest
    ) -> list[SolutionTextBlockRead | SolutionFormulaBlockRead]:
        try:
            revision = self._editable_revision(revision_id, request.expected_revision_updated_at)
            solution = self._require_solution(revision.id, lock=True)
            blocks = self._active_blocks(solution.id, lock=True)
            if (
                len(blocks) != len(request.block_ids)
                or {block.id for block in blocks} != set(request.block_ids)
            ):
                raise SolutionBlockOrderSetMismatchError(
                    "Order must contain every active solution block exactly once."
                )
            by_id = {block.id: block for block in blocks}
            temporary = max(
                max((block.sort_order for block in blocks), default=0),
                len(blocks) * 1000,
            ) + 1_000_000
            for position, block_id in enumerate(request.block_ids, start=1):
                by_id[block_id].sort_order = temporary + position * 1000
            self.db.flush()
            for position, block_id in enumerate(request.block_ids, start=1):
                by_id[block_id].sort_order = position * 1000
            self._touch(revision)
            self.db.commit()
            return [self._block_read(by_id[block_id]) for block_id in request.block_ids]
        except IntegrityError as exc:
            self.db.rollback()
            raise SolutionIntegrityConflictError("Active solution block order conflicts.") from exc
        except Exception:
            self.db.rollback()
            raise

    def _create_block(
        self, *, revision_id: uuid.UUID, expected: datetime,
        block_type: SolutionBlockType, source_text: str | None,
        document_data: dict[str, object] | None, source_latex: str | None,
        format_version: int,
    ):
        try:
            revision = self._editable_revision(revision_id, expected)
            solution = self._require_solution(revision.id, lock=True)
            maximum = self.db.scalar(select(func.max(SolutionBlock.sort_order)).where(
                SolutionBlock.solution_id == solution.id,
                SolutionBlock.deleted_at.is_(None),
            )) or 0
            block = SolutionBlock(
                solution_id=solution.id, block_type=block_type,
                sort_order=maximum + 1000, source_text=source_text,
                document_data=document_data, source_latex=source_latex,
                format_version=format_version,
            )
            self.db.add(block)
            self.db.flush()
            self._touch(revision)
            self.db.commit()
            self.db.refresh(block)
            return self._block_read(block)
        except IntegrityError as exc:
            self.db.rollback()
            raise SolutionIntegrityConflictError("Active solution block order conflicts.") from exc
        except Exception:
            self.db.rollback()
            raise

    def _update_block(
        self, *, revision_id: uuid.UUID, block_id: uuid.UUID, expected: datetime,
        expected_type: SolutionBlockType, source_text: str | None,
        document_data: dict[str, object] | None, source_latex: str | None,
        format_version: int,
    ):
        try:
            revision = self._editable_revision(revision_id, expected)
            solution = self._require_solution(revision.id, lock=True)
            block = self._require_block(solution.id, block_id, lock=True)
            if SolutionBlockType(block.block_type) != expected_type:
                raise SolutionBlockTypeMismatchError("Solution block type cannot be changed.")
            block.source_text = source_text
            block.document_data = document_data
            block.source_latex = source_latex
            block.format_version = format_version
            self._touch(revision)
            self.db.commit()
            self.db.refresh(block)
            return self._block_read(block)
        except Exception:
            self.db.rollback()
            raise

    def _active_revision(self, revision_id: uuid.UUID, *, lock: bool) -> QuestionRevision:
        statement = select(QuestionRevision).join(QuestionForm).join(QuestionFamily).where(
            QuestionRevision.id == revision_id,
            QuestionRevision.deleted_at.is_(None),
            QuestionForm.is_active.is_(True), QuestionForm.deleted_at.is_(None),
            QuestionFamily.is_active.is_(True), QuestionFamily.deleted_at.is_(None),
        )
        if lock:
            statement = statement.with_for_update()
        revision = self.db.scalar(statement)
        if revision is None:
            raise SolutionRevisionNotFoundError("Question revision was not found.")
        return revision

    def _editable_revision(self, revision_id: uuid.UUID, expected: datetime) -> QuestionRevision:
        revision = self._active_revision(revision_id, lock=True)
        if revision.status != QuestionRevisionStatus.DRAFT:
            raise SolutionRevisionNotEditableError("Question revision is not editable.")
        if revision.updated_at != expected:
            raise SolutionRevisionConflictError("Question revision was modified by another request.")
        return revision

    def _solution_for_revision(self, revision_id: uuid.UUID, *, lock: bool) -> Solution | None:
        statement = select(Solution).where(
            Solution.question_revision_id == revision_id, Solution.deleted_at.is_(None)
        )
        if lock:
            statement = statement.with_for_update()
        return self.db.scalar(statement)

    def _require_solution(self, revision_id: uuid.UUID, *, lock: bool) -> Solution:
        solution = self._solution_for_revision(revision_id, lock=lock)
        if solution is None:
            raise SolutionNotFoundError("Active solution was not found.")
        return solution

    def _active_blocks(self, solution_id: uuid.UUID, *, lock: bool) -> list[SolutionBlock]:
        statement = select(SolutionBlock).where(
            SolutionBlock.solution_id == solution_id,
            SolutionBlock.deleted_at.is_(None),
        ).order_by(SolutionBlock.sort_order, SolutionBlock.id)
        if lock:
            statement = statement.with_for_update()
        return list(self.db.scalars(statement).all())

    def _require_block(
        self, solution_id: uuid.UUID, block_id: uuid.UUID, *, lock: bool
    ) -> SolutionBlock:
        statement = select(SolutionBlock).where(
            SolutionBlock.id == block_id,
            SolutionBlock.solution_id == solution_id,
            SolutionBlock.deleted_at.is_(None),
        )
        if lock:
            statement = statement.with_for_update()
        block = self.db.scalar(statement)
        if block is None:
            raise SolutionBlockNotFoundError("Solution block was not found.")
        return block

    @staticmethod
    def _block_read(block: SolutionBlock):
        block_type = SolutionBlockType(block.block_type)
        if block_type == SolutionBlockType.TEXT:
            return SolutionTextBlockRead(
                id=block.id, block_type=block_type, sort_order=block.sort_order,
                source_text=block.source_text,
                document=normalize_text_content(
                    source_text=block.source_text,
                    document_data=block.document_data,
                    format_version=block.format_version,
                ),
                format_version=block.format_version,
            )
        return SolutionFormulaBlockRead(
            id=block.id, block_type=block_type, sort_order=block.sort_order,
            source_latex=block.source_latex, format_version=block.format_version,
        )

    @staticmethod
    def _touch(revision: QuestionRevision) -> None:
        revision.updated_at = datetime.now(timezone.utc)

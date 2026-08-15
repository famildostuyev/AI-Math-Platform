from __future__ import annotations

import sys
import unittest
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from pydantic import ValidationError
from sqlalchemy.exc import IntegrityError


BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.core.enums import (
    ContentBlockType,
    QuestionFamilyOriginKind,
    QuestionFormDerivationKind,
    QuestionRevisionProvenanceKind,
    QuestionRevisionStatus,
)
from app.models.question_family import QuestionFamily
from app.models.question_form import QuestionForm
from app.models.question_revision import QuestionRevision
from app.models.question_revision_purpose import QuestionRevisionPurpose
from app.models.question_revision_related_topic import QuestionRevisionRelatedTopic
from app.models.content_block import ContentBlock
from app.models.formula_block_content import FormulaBlockContent
from app.models.text_block_content import TextBlockContent
from app.schemas.question_editor import (
    FormulaBlockCreate,
    FormulaBlockRead,
    FormulaBlockUpdate,
    QuestionDraftCreate,
    QuestionRevisionEditorRead,
    TextBlockCreate,
    TextBlockRead,
    TextBlockUpdate,
)
from app.services.question_editor_service import (
    ContentBlockOrderConflictError,
    EditorBlockContentMissingError,
    EditorBlockNotFoundError,
    EditorBlockTypeMismatchError,
    PurposeNotFoundError,
    QuestionEditorService,
    QuestionTypeNotFoundError,
    RevisionConflictError,
    RevisionNotEditableError,
    RevisionNotFoundError,
    TopicNotFoundError,
    UnsupportedEditorBlockTypeError,
)
from app.services.structured_text_service import (
    UnsupportedStructuredTextVersionError,
)


NOW = datetime(2026, 8, 15, 12, 0, tzinfo=timezone.utc)


def scalar_result(values: list[object]) -> MagicMock:
    result = MagicMock()
    result.all.return_value = values
    return result


class QuestionEditorServiceTest(unittest.TestCase):
    def _formula_block_request(
        self,
        source_latex: str = "x^2+1",
    ) -> FormulaBlockCreate:
        return FormulaBlockCreate.model_validate({
            "block_type": "formula",
            "payload": {
                "source_latex": source_latex,
                "format_version": 1,
            },
            "expected_revision_updated_at": NOW,
        })

    def _formula_block_update_request(
        self,
        source_latex: str = "  y^2 + 1  ",
    ) -> FormulaBlockUpdate:
        return FormulaBlockUpdate.model_validate({
            "source_latex": source_latex,
            "format_version": 1,
            "expected_revision_updated_at": NOW,
        })

    def _formula_block_update_db(
        self,
        *,
        revision_status: QuestionRevisionStatus = QuestionRevisionStatus.DRAFT,
        revision_updated_at: datetime = NOW,
        block_type: ContentBlockType = ContentBlockType.FORMULA,
        include_content: bool = True,
    ) -> tuple[MagicMock, SimpleNamespace, SimpleNamespace, object | None]:
        revision = SimpleNamespace(
            id=uuid.uuid4(),
            status=revision_status,
            updated_at=revision_updated_at,
        )
        content = (
            SimpleNamespace(
                content_block_id=uuid.uuid4(),
                source_latex="x^2",
                format_version=1,
            )
            if include_content
            else None
        )
        block = SimpleNamespace(
            id=(content.content_block_id if content is not None else uuid.uuid4()),
            question_revision_id=revision.id,
            block_type=block_type,
            sort_order=3000,
            formula_content=content,
        )
        db = MagicMock()
        db.scalar.side_effect = [revision, block]
        return db, revision, block, content

    def _delete_block_db(
        self,
        *,
        revision_status: QuestionRevisionStatus = QuestionRevisionStatus.DRAFT,
        revision_updated_at: datetime = NOW,
        block_type: ContentBlockType = ContentBlockType.TEXT,
    ) -> tuple[MagicMock, SimpleNamespace, SimpleNamespace]:
        revision = SimpleNamespace(
            id=uuid.uuid4(),
            status=revision_status,
            updated_at=revision_updated_at,
        )
        block = SimpleNamespace(
            id=uuid.uuid4(),
            question_revision_id=revision.id,
            block_type=block_type,
            sort_order=2000,
            deleted_at=None,
        )
        db = MagicMock()
        db.scalar.side_effect = [revision, block]
        return db, revision, block

    def _text_block_request(self) -> TextBlockCreate:
        return TextBlockCreate.model_validate({
            "block_type": "text",
            "payload": {
                "document": {
                    "type": "document",
                    "content": [{
                        "type": "paragraph",
                        "content": [
                            {"type": "text", "text": "Solve "},
                            {"type": "inline_math", "latex": "x^2"},
                        ],
                    }],
                },
                "format_version": 1,
            },
            "expected_revision_updated_at": NOW,
        })

    def _text_block_db(
        self,
        *,
        status: QuestionRevisionStatus = QuestionRevisionStatus.DRAFT,
        updated_at: datetime = NOW,
        maximum_sort_order: int | None = None,
    ) -> tuple[MagicMock, SimpleNamespace]:
        revision = SimpleNamespace(
            id=uuid.uuid4(), status=status, updated_at=updated_at,
        )
        db = MagicMock()
        db.scalar.side_effect = [revision, maximum_sort_order]

        def assign_block_id() -> None:
            block = db.add.call_args.args[0]
            if isinstance(block, ContentBlock):
                block.id = uuid.uuid4()

        db.flush.side_effect = assign_block_id
        return db, revision

    def _text_block_update_request(self) -> TextBlockUpdate:
        return TextBlockUpdate.model_validate({
            "document": {
                "type": "document",
                "content": [{
                    "type": "paragraph",
                    "content": [
                        {"type": "text", "text": "Updated "},
                        {"type": "inline_math", "latex": "y^2"},
                    ],
                }],
            },
            "format_version": 1,
            "expected_revision_updated_at": NOW,
        })

    def _text_block_update_db(
        self,
        *,
        revision_status: QuestionRevisionStatus = QuestionRevisionStatus.DRAFT,
        revision_updated_at: datetime = NOW,
        block_type: ContentBlockType = ContentBlockType.TEXT,
        include_content: bool = True,
    ) -> tuple[MagicMock, SimpleNamespace, SimpleNamespace, object | None]:
        revision = SimpleNamespace(
            id=uuid.uuid4(),
            status=revision_status,
            updated_at=revision_updated_at,
        )
        content = (
            SimpleNamespace(
                source_text="Original",
                document_data={"type": "document", "content": []},
                format_version=1,
            )
            if include_content
            else None
        )
        block = SimpleNamespace(
            id=uuid.uuid4(),
            question_revision_id=revision.id,
            block_type=block_type,
            sort_order=2000,
            text_content=content,
        )
        db = MagicMock()
        db.scalar.side_effect = [revision, block]
        return db, revision, block, content

    def _draft_db(self, scalar_values: list[object]) -> MagicMock:
        db = MagicMock()
        db.scalar.side_effect = scalar_values

        def assign_generated_values() -> None:
            instance = db.add.call_args.args[0]
            if getattr(instance, "id", None) is None:
                instance.id = uuid.uuid4()
            if isinstance(instance, QuestionRevision):
                instance.updated_at = NOW

        db.flush.side_effect = assign_generated_values
        return db

    def _create_full_draft(self):
        primary_topic_id = uuid.uuid4()
        related_topic_ids = [uuid.uuid4(), uuid.uuid4()]
        purpose_ids = [uuid.uuid4(), uuid.uuid4()]
        draft = QuestionDraftCreate(
            question_type_id=uuid.uuid4(),
            primary_topic_id=primary_topic_id,
            related_topic_ids=related_topic_ids,
            purpose_ids=purpose_ids,
        )
        db = self._draft_db([object()] * 6)
        response = QuestionEditorService(db).create_draft(
            draft=draft, actor_id=uuid.uuid4(),
        )
        return draft, db, response

    def test_valid_draft_creates_family_form_and_revision(self) -> None:
        draft, db, response = self._create_full_draft()
        created = [call.args[0] for call in db.add.call_args_list]

        self.assertEqual(len(created), 3)
        self.assertIsInstance(created[0], QuestionFamily)
        self.assertIsInstance(created[1], QuestionForm)
        self.assertIsInstance(created[2], QuestionRevision)
        self.assertEqual(response.question_type_id, draft.question_type_id)

    def test_draft_uses_server_owned_revision_values_and_actor(self) -> None:
        actor_id = uuid.uuid4()
        draft = QuestionDraftCreate(question_type_id=uuid.uuid4())
        db = self._draft_db([object()])

        response = QuestionEditorService(db).create_draft(
            draft=draft, actor_id=actor_id,
        )
        family, form, revision = [
            call.args[0] for call in db.add.call_args_list
        ]

        self.assertEqual(family.origin_kind, QuestionFamilyOriginKind.AUTHORED)
        self.assertEqual(family.created_by_user_id, actor_id)
        self.assertEqual(form.derivation_kind, QuestionFormDerivationKind.ORIGINAL)
        self.assertTrue(form.is_original)
        self.assertEqual(revision.revision_number, 1)
        self.assertEqual(revision.status, QuestionRevisionStatus.DRAFT)
        self.assertEqual(
            revision.provenance_kind,
            QuestionRevisionProvenanceKind.HUMAN_AUTHORED,
        )
        self.assertEqual(revision.created_by_user_id, actor_id)
        self.assertEqual(response.revision_number, 1)
        self.assertEqual(response.status, QuestionRevisionStatus.DRAFT)

    def test_optional_primary_topic_path_works(self) -> None:
        draft = QuestionDraftCreate(question_type_id=uuid.uuid4())
        db = self._draft_db([object()])

        response = QuestionEditorService(db).create_draft(
            draft=draft, actor_id=uuid.uuid4(),
        )

        revision = db.add.call_args_list[2].args[0]
        self.assertIsNone(revision.primary_topic_id)
        self.assertIsNone(response.primary_topic_id)

    def test_related_topics_and_purposes_create_links(self) -> None:
        draft, db, _response = self._create_full_draft()
        links = db.add_all.call_args.args[0]
        related = [
            link for link in links
            if isinstance(link, QuestionRevisionRelatedTopic)
        ]
        purposes = [
            link for link in links
            if isinstance(link, QuestionRevisionPurpose)
        ]

        self.assertEqual([link.topic_id for link in related], draft.related_topic_ids)
        self.assertEqual([link.purpose_id for link in purposes], draft.purpose_ids)
        self.assertTrue(all(link.question_revision_id for link in links))

    def test_success_commits_once_and_uses_three_required_flushes(self) -> None:
        _draft, db, _response = self._create_full_draft()
        db.commit.assert_called_once_with()
        self.assertEqual(db.flush.call_count, 3)
        db.rollback.assert_not_called()

    def test_question_type_query_requires_active_non_deleted_row(self) -> None:
        draft = QuestionDraftCreate(question_type_id=uuid.uuid4())
        db = self._draft_db([None])

        with self.assertRaises(QuestionTypeNotFoundError):
            QuestionEditorService(db).create_draft(
                draft=draft, actor_id=uuid.uuid4(),
            )

        statement = str(db.scalar.call_args.args[0])
        self.assertIn("question_types.is_active IS true", statement)
        self.assertIn("question_types.deleted_at IS NULL", statement)
        db.rollback.assert_called_once_with()
        db.commit.assert_not_called()
        db.add.assert_not_called()

    def test_missing_primary_topic_rejects_and_rolls_back(self) -> None:
        draft = QuestionDraftCreate(
            question_type_id=uuid.uuid4(), primary_topic_id=uuid.uuid4(),
        )
        db = self._draft_db([object(), None])
        with self.assertRaises(TopicNotFoundError):
            QuestionEditorService(db).create_draft(
                draft=draft, actor_id=uuid.uuid4(),
            )
        db.rollback.assert_called_once_with()
        db.commit.assert_not_called()

    def test_missing_related_topic_rejects_and_rolls_back(self) -> None:
        draft = QuestionDraftCreate(
            question_type_id=uuid.uuid4(),
            related_topic_ids=[uuid.uuid4()],
        )
        db = self._draft_db([object(), None])
        with self.assertRaises(TopicNotFoundError):
            QuestionEditorService(db).create_draft(
                draft=draft, actor_id=uuid.uuid4(),
            )
        db.rollback.assert_called_once_with()
        db.commit.assert_not_called()

    def test_missing_purpose_rejects_and_rolls_back(self) -> None:
        draft = QuestionDraftCreate(
            question_type_id=uuid.uuid4(), purpose_ids=[uuid.uuid4()],
        )
        db = self._draft_db([object(), None])
        with self.assertRaises(PurposeNotFoundError):
            QuestionEditorService(db).create_draft(
                draft=draft, actor_id=uuid.uuid4(),
            )
        db.rollback.assert_called_once_with()
        db.commit.assert_not_called()

    def test_topic_and_purpose_queries_require_active_non_deleted_rows(self) -> None:
        draft = QuestionDraftCreate(
            question_type_id=uuid.uuid4(),
            related_topic_ids=[uuid.uuid4()],
            purpose_ids=[uuid.uuid4()],
        )
        db = self._draft_db([object(), object(), object()])
        QuestionEditorService(db).create_draft(
            draft=draft, actor_id=uuid.uuid4(),
        )
        statements = [str(call.args[0]) for call in db.scalar.call_args_list]
        self.assertIn("topics.is_active IS true", statements[1])
        self.assertIn("topics.deleted_at IS NULL", statements[1])
        self.assertIn("purposes.is_active IS true", statements[2])
        self.assertIn("purposes.deleted_at IS NULL", statements[2])

    def _read_db(self, blocks: list[object]):
        family = SimpleNamespace(id=uuid.uuid4())
        form = SimpleNamespace(
            id=uuid.uuid4(),
            question_family_id=family.id,
            question_type_id=uuid.uuid4(),
            question_family=family,
        )
        revision = SimpleNamespace(
            id=uuid.uuid4(),
            question_form=form,
            revision_number=1,
            status=QuestionRevisionStatus.DRAFT,
            primary_topic_id=None,
            difficulty=None,
            updated_at=NOW,
        )
        db = MagicMock()
        db.scalar.return_value = revision
        db.scalars.side_effect = [
            scalar_result([]), scalar_result([]), scalar_result(blocks),
        ]
        return db, revision

    def test_existing_empty_draft_serializes_with_concurrency_token(self) -> None:
        db, revision = self._read_db([])
        response = QuestionEditorService(db).get_revision_for_editor(
            revision_id=revision.id,
        )
        self.assertIsInstance(response, QuestionRevisionEditorRead)
        self.assertEqual(response.blocks, [])
        self.assertEqual(response.updated_at, NOW)
        statement = str(db.scalar.call_args.args[0])
        self.assertIn("question_revisions.deleted_at IS NULL", statement)
        self.assertIn("question_forms.deleted_at IS NULL", statement)
        self.assertIn("question_families.deleted_at IS NULL", statement)

    def test_revision_not_found_is_rejected(self) -> None:
        db = MagicMock()
        db.scalar.return_value = None
        with self.assertRaises(RevisionNotFoundError):
            QuestionEditorService(db).get_revision_for_editor(
                revision_id=uuid.uuid4(),
            )
        db.scalars.assert_not_called()

    def test_blocks_are_queried_in_deterministic_order(self) -> None:
        db, revision = self._read_db([])
        QuestionEditorService(db).get_revision_for_editor(
            revision_id=revision.id,
        )
        statement = str(db.scalars.call_args_list[2].args[0])
        self.assertIn(
            "ORDER BY content_blocks.sort_order, content_blocks.id",
            statement,
        )
        self.assertIn("content_blocks.deleted_at IS NULL", statement)

    def test_legacy_text_block_normalizes_without_backfill(self) -> None:
        text_content = SimpleNamespace(
            source_text="Legacy $x$", document_data=None, format_version=1,
        )
        block = SimpleNamespace(
            id=uuid.uuid4(), block_type=ContentBlockType.TEXT,
            sort_order=0, text_content=text_content,
        )
        db, revision = self._read_db([block])
        response = QuestionEditorService(db).get_revision_for_editor(
            revision_id=revision.id,
        )
        payload = response.blocks[0].payload
        self.assertEqual(payload.source_text, "Legacy $x$")
        self.assertEqual(payload.document.content[0].content[0].text, "Legacy $x$")
        self.assertIsNone(text_content.document_data)
        db.commit.assert_not_called()

    def test_formula_image_and_geometry_blocks_serialize_safely(self) -> None:
        blocks = [
            SimpleNamespace(
                id=uuid.uuid4(), block_type=ContentBlockType.FORMULA,
                sort_order=0,
                formula_content=SimpleNamespace(source_latex="x^2", format_version=1),
            ),
            SimpleNamespace(
                id=uuid.uuid4(), block_type=ContentBlockType.IMAGE,
                sort_order=1,
                image_content=SimpleNamespace(media_asset_id=uuid.uuid4(), alt_text="Plot", storage_key="hidden"),
            ),
            SimpleNamespace(
                id=uuid.uuid4(), block_type=ContentBlockType.GEOMETRY,
                sort_order=2,
                geometry_content=SimpleNamespace(source_data={"objects": []}, format_version=1),
            ),
        ]
        db, revision = self._read_db(blocks)
        response = QuestionEditorService(db).get_revision_for_editor(
            revision_id=revision.id,
        )
        self.assertEqual(response.blocks[0].payload.source_latex, "x^2")
        self.assertEqual(response.blocks[1].payload.alt_text, "Plot")
        self.assertNotIn("storage_key", response.blocks[1].payload.model_dump())
        self.assertEqual(response.blocks[2].payload.source_data, {"objects": []})

    def test_unsupported_deferred_block_type_is_rejected(self) -> None:
        block = SimpleNamespace(
            id=uuid.uuid4(), block_type=ContentBlockType.GRAPH, sort_order=0,
        )
        db, revision = self._read_db([block])
        with self.assertRaises(UnsupportedEditorBlockTypeError):
            QuestionEditorService(db).get_revision_for_editor(
                revision_id=revision.id,
            )

    def test_draft_revision_is_editable(self) -> None:
        service = QuestionEditorService(MagicMock())
        service.ensure_revision_editable(SimpleNamespace(
            status=QuestionRevisionStatus.DRAFT,
        ))

    def test_non_draft_revision_is_not_editable(self) -> None:
        service = QuestionEditorService(MagicMock())
        for status in (
            QuestionRevisionStatus.PROPOSED,
            QuestionRevisionStatus.APPROVED,
            QuestionRevisionStatus.REJECTED,
        ):
            with self.subTest(status=status), self.assertRaises(
                RevisionNotEditableError
            ):
                service.ensure_revision_editable(SimpleNamespace(status=status))

    def test_matching_revision_timestamp_is_accepted(self) -> None:
        QuestionEditorService(MagicMock()).ensure_revision_timestamp_matches(
            SimpleNamespace(updated_at=NOW), NOW,
        )

    def test_stale_revision_timestamp_is_rejected(self) -> None:
        with self.assertRaises(RevisionConflictError):
            QuestionEditorService(MagicMock()).ensure_revision_timestamp_matches(
                SimpleNamespace(updated_at=NOW), NOW - timedelta(seconds=1),
            )

    def test_draft_revision_creates_canonical_text_block(self) -> None:
        db, revision = self._text_block_db()
        new_timestamp = NOW + timedelta(seconds=1)

        with patch(
            "app.services.question_editor_service._utc_now",
            return_value=new_timestamp,
        ):
            response = QuestionEditorService(db).create_text_block(
                revision_id=revision.id,
                request=self._text_block_request(),
            )

        created = [call.args[0] for call in db.add.call_args_list]
        block, content = created
        self.assertIsInstance(block, ContentBlock)
        self.assertEqual(block.question_revision_id, revision.id)
        self.assertEqual(block.block_type, ContentBlockType.TEXT)
        self.assertIsInstance(content, TextBlockContent)
        self.assertEqual(content.content_block_id, block.id)
        self.assertEqual(content.source_text, "Solve x^2")
        self.assertEqual(content.document_data["type"], "document")
        self.assertEqual(content.format_version, 1)
        self.assertIsInstance(response, TextBlockRead)
        self.assertEqual(response.payload.source_text, "Solve x^2")
        self.assertEqual(response.payload.document.type, "document")
        self.assertEqual(response.payload.format_version, 1)
        self.assertEqual(revision.updated_at, new_timestamp)
        db.commit.assert_called_once_with()
        db.rollback.assert_not_called()

    def test_revision_lookup_is_active_non_deleted_and_locked(self) -> None:
        db, revision = self._text_block_db()
        QuestionEditorService(db).create_text_block(
            revision_id=revision.id,
            request=self._text_block_request(),
        )
        statement = str(db.scalar.call_args_list[0].args[0])
        self.assertIn("question_revisions.deleted_at IS NULL", statement)
        self.assertIn("question_forms.deleted_at IS NULL", statement)
        self.assertIn("question_families.deleted_at IS NULL", statement)
        self.assertIn("FOR UPDATE", statement)

    def test_empty_active_block_list_starts_at_1000(self) -> None:
        db, revision = self._text_block_db(maximum_sort_order=None)
        response = QuestionEditorService(db).create_text_block(
            revision_id=revision.id,
            request=self._text_block_request(),
        )
        self.assertEqual(response.sort_order, 1000)

    def test_existing_maximum_appends_with_1000_spacing(self) -> None:
        db, revision = self._text_block_db(maximum_sort_order=1000)
        response = QuestionEditorService(db).create_text_block(
            revision_id=revision.id,
            request=self._text_block_request(),
        )
        self.assertEqual(response.sort_order, 2000)

    def test_maximum_query_uses_database_max_and_ignores_deleted_blocks(self) -> None:
        db, revision = self._text_block_db(maximum_sort_order=3000)
        QuestionEditorService(db).create_text_block(
            revision_id=revision.id,
            request=self._text_block_request(),
        )
        statement = str(db.scalar.call_args_list[1].args[0])
        self.assertIn("max(content_blocks.sort_order)", statement)
        self.assertIn("content_blocks.question_revision_id", statement)
        self.assertIn("content_blocks.deleted_at IS NULL", statement)
        db.scalars.assert_not_called()

    def test_content_block_is_flushed_before_shared_pk_payload_is_added(self) -> None:
        db, revision = self._text_block_db()
        QuestionEditorService(db).create_text_block(
            revision_id=revision.id,
            request=self._text_block_request(),
        )
        method_names = [call[0] for call in db.method_calls]
        first_add = method_names.index("add")
        flush = method_names.index("flush")
        second_add = method_names.index("add", first_add + 1)
        self.assertLess(first_add, flush)
        self.assertLess(flush, second_add)

    def test_revision_not_found_rolls_back_without_commit(self) -> None:
        db = MagicMock()
        db.scalar.return_value = None
        with self.assertRaises(RevisionNotFoundError):
            QuestionEditorService(db).create_text_block(
                revision_id=uuid.uuid4(), request=self._text_block_request(),
            )
        db.rollback.assert_called_once_with()
        db.commit.assert_not_called()
        db.add.assert_not_called()

    def test_non_draft_revision_rolls_back_without_commit(self) -> None:
        db, revision = self._text_block_db(
            status=QuestionRevisionStatus.APPROVED,
        )
        with self.assertRaises(RevisionNotEditableError):
            QuestionEditorService(db).create_text_block(
                revision_id=revision.id, request=self._text_block_request(),
            )
        db.rollback.assert_called_once_with()
        db.commit.assert_not_called()
        self.assertEqual(db.scalar.call_count, 1)

    def test_stale_concurrency_rolls_back_without_commit(self) -> None:
        db, revision = self._text_block_db(
            updated_at=NOW + timedelta(seconds=1),
        )
        with self.assertRaises(RevisionConflictError):
            QuestionEditorService(db).create_text_block(
                revision_id=revision.id, request=self._text_block_request(),
            )
        db.rollback.assert_called_once_with()
        db.commit.assert_not_called()
        self.assertEqual(db.scalar.call_count, 1)

    def test_invalid_structured_text_version_rolls_back(self) -> None:
        request = self._text_block_request()
        invalid_payload = request.payload.model_copy(update={"format_version": 2})
        invalid_request = request.model_copy(update={"payload": invalid_payload})
        db, revision = self._text_block_db()
        with self.assertRaises(UnsupportedStructuredTextVersionError):
            QuestionEditorService(db).create_text_block(
                revision_id=revision.id, request=invalid_request,
            )
        db.rollback.assert_called_once_with()
        db.commit.assert_not_called()
        db.add.assert_not_called()

    def test_payload_add_failure_rolls_back_partial_block(self) -> None:
        db, revision = self._text_block_db()

        def fail_second_add(instance: object) -> None:
            if isinstance(instance, TextBlockContent):
                raise RuntimeError("payload insert failed")

        db.add.side_effect = fail_second_add
        with self.assertRaises(RuntimeError):
            QuestionEditorService(db).create_text_block(
                revision_id=revision.id, request=self._text_block_request(),
            )
        db.rollback.assert_called_once_with()
        db.commit.assert_not_called()

    def test_integrity_conflict_is_translated_and_rolled_back(self) -> None:
        db, revision = self._text_block_db()
        db.commit.side_effect = IntegrityError(
            "insert", {}, Exception("active order conflict"),
        )
        with self.assertRaises(ContentBlockOrderConflictError):
            QuestionEditorService(db).create_text_block(
                revision_id=revision.id, request=self._text_block_request(),
            )
        db.rollback.assert_called_once_with()
        db.commit.assert_called_once_with()

    def test_existing_text_block_updates_in_place_and_returns_typed_read(self) -> None:
        db, revision, block, content = self._text_block_update_db()
        original_block_id = block.id
        original_sort_order = block.sort_order
        new_timestamp = NOW + timedelta(seconds=1)

        with patch(
            "app.services.question_editor_service._utc_now",
            return_value=new_timestamp,
        ):
            response = QuestionEditorService(db).update_text_block(
                revision_id=revision.id,
                block_id=block.id,
                request=self._text_block_update_request(),
            )

        self.assertIsInstance(response, TextBlockRead)
        self.assertEqual(response.id, original_block_id)
        self.assertEqual(response.sort_order, original_sort_order)
        self.assertEqual(response.block_type, ContentBlockType.TEXT)
        self.assertEqual(response.payload.source_text, "Updated y^2")
        self.assertEqual(response.payload.document.type, "document")
        self.assertEqual(response.payload.format_version, 1)
        self.assertEqual(content.source_text, "Updated y^2")
        self.assertEqual(content.document_data["type"], "document")
        self.assertEqual(content.format_version, 1)
        self.assertEqual(block.id, original_block_id)
        self.assertEqual(block.sort_order, original_sort_order)
        self.assertEqual(block.block_type, ContentBlockType.TEXT)
        self.assertEqual(revision.updated_at, new_timestamp)
        db.add.assert_not_called()
        db.flush.assert_not_called()
        db.commit.assert_called_once_with()
        db.rollback.assert_not_called()

    def test_update_revision_query_filters_eligibility_and_locks(self) -> None:
        db, revision, block, _content = self._text_block_update_db()
        QuestionEditorService(db).update_text_block(
            revision_id=revision.id,
            block_id=block.id,
            request=self._text_block_update_request(),
        )
        statement = str(db.scalar.call_args_list[0].args[0])
        self.assertIn("question_revisions.deleted_at IS NULL", statement)
        self.assertIn("question_forms.is_active IS true", statement)
        self.assertIn("question_forms.deleted_at IS NULL", statement)
        self.assertIn("question_families.is_active IS true", statement)
        self.assertIn("question_families.deleted_at IS NULL", statement)
        self.assertIn("FOR UPDATE", statement)

    def test_update_block_query_is_revision_scoped_active_and_locked(self) -> None:
        db, revision, block, _content = self._text_block_update_db()
        QuestionEditorService(db).update_text_block(
            revision_id=revision.id,
            block_id=block.id,
            request=self._text_block_update_request(),
        )
        statement = str(db.scalar.call_args_list[1].args[0])
        self.assertIn("content_blocks.id", statement)
        self.assertIn("content_blocks.question_revision_id", statement)
        self.assertIn("content_blocks.deleted_at IS NULL", statement)
        self.assertIn("FOR UPDATE", statement)

    def test_update_revision_not_found_rolls_back_without_commit(self) -> None:
        db = MagicMock()
        db.scalar.return_value = None
        with self.assertRaises(RevisionNotFoundError):
            QuestionEditorService(db).update_text_block(
                revision_id=uuid.uuid4(),
                block_id=uuid.uuid4(),
                request=self._text_block_update_request(),
            )
        db.rollback.assert_called_once_with()
        db.commit.assert_not_called()
        self.assertEqual(db.scalar.call_count, 1)

    def test_update_non_draft_revision_rejects_before_block_lookup(self) -> None:
        db, revision, block, _content = self._text_block_update_db(
            revision_status=QuestionRevisionStatus.APPROVED,
        )
        with self.assertRaises(RevisionNotEditableError):
            QuestionEditorService(db).update_text_block(
                revision_id=revision.id,
                block_id=block.id,
                request=self._text_block_update_request(),
            )
        db.rollback.assert_called_once_with()
        db.commit.assert_not_called()
        self.assertEqual(db.scalar.call_count, 1)

    def test_update_stale_timestamp_rejects_before_block_lookup(self) -> None:
        db, revision, block, content = self._text_block_update_db(
            revision_updated_at=NOW + timedelta(seconds=1),
        )
        with self.assertRaises(RevisionConflictError):
            QuestionEditorService(db).update_text_block(
                revision_id=revision.id,
                block_id=block.id,
                request=self._text_block_update_request(),
            )
        self.assertEqual(content.source_text, "Original")
        db.rollback.assert_called_once_with()
        db.commit.assert_not_called()
        self.assertEqual(db.scalar.call_count, 1)

    def test_missing_cross_revision_or_deleted_block_is_rejected(self) -> None:
        revision = SimpleNamespace(
            id=uuid.uuid4(), status=QuestionRevisionStatus.DRAFT,
            updated_at=NOW,
        )
        db = MagicMock()
        db.scalar.side_effect = [revision, None]
        with self.assertRaises(EditorBlockNotFoundError):
            QuestionEditorService(db).update_text_block(
                revision_id=revision.id,
                block_id=uuid.uuid4(),
                request=self._text_block_update_request(),
            )
        statement = str(db.scalar.call_args_list[1].args[0])
        self.assertIn("content_blocks.question_revision_id", statement)
        self.assertIn("content_blocks.deleted_at IS NULL", statement)
        db.rollback.assert_called_once_with()
        db.commit.assert_not_called()

    def test_non_text_block_is_rejected_without_mutation(self) -> None:
        db, revision, block, _content = self._text_block_update_db(
            block_type=ContentBlockType.FORMULA,
        )
        with self.assertRaises(EditorBlockTypeMismatchError):
            QuestionEditorService(db).update_text_block(
                revision_id=revision.id,
                block_id=block.id,
                request=self._text_block_update_request(),
            )
        db.add.assert_not_called()
        db.commit.assert_not_called()
        db.rollback.assert_called_once_with()

    def test_missing_text_payload_is_rejected(self) -> None:
        db, revision, block, _content = self._text_block_update_db(
            include_content=False,
        )
        with self.assertRaises(EditorBlockContentMissingError):
            QuestionEditorService(db).update_text_block(
                revision_id=revision.id,
                block_id=block.id,
                request=self._text_block_update_request(),
            )
        db.commit.assert_not_called()
        db.rollback.assert_called_once_with()

    def test_invalid_update_document_rolls_back_without_mutation(self) -> None:
        request = TextBlockUpdate.model_construct(
            document={"type": "document", "content": [{"type": "html"}]},
            format_version=1,
            expected_revision_updated_at=NOW,
        )
        db, revision, block, content = self._text_block_update_db()
        with self.assertRaises(ValidationError):
            QuestionEditorService(db).update_text_block(
                revision_id=revision.id, block_id=block.id, request=request,
            )
        self.assertEqual(content.source_text, "Original")
        db.commit.assert_not_called()
        db.rollback.assert_called_once_with()

    def test_unsupported_update_version_rolls_back_without_mutation(self) -> None:
        request = self._text_block_update_request().model_copy(
            update={"format_version": 2},
        )
        db, revision, block, content = self._text_block_update_db()
        with self.assertRaises(UnsupportedStructuredTextVersionError):
            QuestionEditorService(db).update_text_block(
                revision_id=revision.id, block_id=block.id, request=request,
            )
        self.assertEqual(content.source_text, "Original")
        db.commit.assert_not_called()
        db.rollback.assert_called_once_with()

    def test_update_commit_failure_rolls_back_and_propagates_integrity_error(self) -> None:
        db, revision, block, _content = self._text_block_update_db()
        db.commit.side_effect = IntegrityError(
            "update", {}, Exception("persistence conflict"),
        )
        with self.assertRaises(IntegrityError):
            QuestionEditorService(db).update_text_block(
                revision_id=revision.id,
                block_id=block.id,
                request=self._text_block_update_request(),
            )
        db.rollback.assert_called_once_with()
        db.commit.assert_called_once_with()

    def test_draft_revision_creates_formula_block_and_shared_pk_payload(self) -> None:
        db, revision = self._text_block_db()
        new_timestamp = NOW + timedelta(seconds=1)

        with patch(
            "app.services.question_editor_service._utc_now",
            return_value=new_timestamp,
        ):
            response = QuestionEditorService(db).create_formula_block(
                revision_id=revision.id,
                request=self._formula_block_request(),
            )

        block, content = [call.args[0] for call in db.add.call_args_list]
        self.assertIsInstance(block, ContentBlock)
        self.assertEqual(block.question_revision_id, revision.id)
        self.assertEqual(block.block_type, ContentBlockType.FORMULA)
        self.assertEqual(block.sort_order, 1000)
        self.assertIsInstance(content, FormulaBlockContent)
        self.assertEqual(content.content_block_id, block.id)
        self.assertEqual(content.source_latex, "x^2+1")
        self.assertEqual(content.format_version, 1)
        self.assertFalse(hasattr(content, "rendered_html"))
        self.assertFalse(hasattr(content, "rendered_svg"))
        self.assertFalse(hasattr(content, "rendered_mathml"))
        self.assertIsInstance(response, FormulaBlockRead)
        self.assertEqual(response.id, block.id)
        self.assertEqual(response.sort_order, 1000)
        self.assertEqual(response.payload.source_latex, "x^2+1")
        self.assertEqual(response.payload.format_version, 1)
        self.assertEqual(revision.updated_at, new_timestamp)
        db.commit.assert_called_once_with()
        db.rollback.assert_not_called()

    def test_formula_revision_query_filters_eligibility_and_locks(self) -> None:
        db, revision = self._text_block_db()
        QuestionEditorService(db).create_formula_block(
            revision_id=revision.id,
            request=self._formula_block_request(),
        )
        statement = str(db.scalar.call_args_list[0].args[0])
        self.assertIn("question_revisions.deleted_at IS NULL", statement)
        self.assertIn("question_forms.is_active IS true", statement)
        self.assertIn("question_forms.deleted_at IS NULL", statement)
        self.assertIn("question_families.is_active IS true", statement)
        self.assertIn("question_families.deleted_at IS NULL", statement)
        self.assertIn("FOR UPDATE", statement)

    def test_formula_append_uses_active_database_max_and_spacing(self) -> None:
        for maximum, expected in ((None, 1000), (1000, 2000), (5000, 6000)):
            with self.subTest(maximum=maximum):
                db, revision = self._text_block_db(
                    maximum_sort_order=maximum,
                )
                response = QuestionEditorService(db).create_formula_block(
                    revision_id=revision.id,
                    request=self._formula_block_request(),
                )
                self.assertEqual(response.sort_order, expected)
                statement = str(db.scalar.call_args_list[1].args[0])
                self.assertIn("max(content_blocks.sort_order)", statement)
                self.assertIn("content_blocks.question_revision_id", statement)
                self.assertIn("content_blocks.deleted_at IS NULL", statement)
                db.scalars.assert_not_called()

    def test_formula_content_block_is_flushed_before_payload_add(self) -> None:
        db, revision = self._text_block_db()
        QuestionEditorService(db).create_formula_block(
            revision_id=revision.id,
            request=self._formula_block_request(),
        )
        names = [call[0] for call in db.method_calls]
        first_add = names.index("add")
        flush = names.index("flush")
        second_add = names.index("add", first_add + 1)
        self.assertLess(first_add, flush)
        self.assertLess(flush, second_add)
        self.assertIsInstance(db.add.call_args_list[0].args[0], ContentBlock)
        self.assertIsInstance(
            db.add.call_args_list[1].args[0], FormulaBlockContent,
        )
        self.assertFalse(any(
            isinstance(call.args[0], TextBlockContent)
            for call in db.add.call_args_list
        ))

    def test_empty_formula_latex_is_valid_draft_content(self) -> None:
        db, revision = self._text_block_db()
        response = QuestionEditorService(db).create_formula_block(
            revision_id=revision.id,
            request=self._formula_block_request(""),
        )
        content = db.add.call_args_list[1].args[0]
        self.assertEqual(content.source_latex, "")
        self.assertEqual(response.payload.source_latex, "")

    def test_formula_revision_not_found_rolls_back_without_commit(self) -> None:
        db = MagicMock()
        db.scalar.return_value = None
        with self.assertRaises(RevisionNotFoundError):
            QuestionEditorService(db).create_formula_block(
                revision_id=uuid.uuid4(),
                request=self._formula_block_request(),
            )
        db.rollback.assert_called_once_with()
        db.commit.assert_not_called()
        db.add.assert_not_called()

    def test_formula_non_draft_and_stale_revision_reject_before_add(self) -> None:
        cases = (
            (
                {"status": QuestionRevisionStatus.APPROVED},
                RevisionNotEditableError,
            ),
            (
                {"updated_at": NOW + timedelta(seconds=1)},
                RevisionConflictError,
            ),
        )
        for changes, error in cases:
            with self.subTest(error=error.__name__):
                db, revision = self._text_block_db(
                    status=changes.get(
                        "status", QuestionRevisionStatus.DRAFT,
                    ),
                    updated_at=changes.get("updated_at", NOW),
                )
                with self.assertRaises(error):
                    QuestionEditorService(db).create_formula_block(
                        revision_id=revision.id,
                        request=self._formula_block_request(),
                    )
                db.rollback.assert_called_once_with()
                db.commit.assert_not_called()
                db.add.assert_not_called()
                self.assertEqual(db.scalar.call_count, 1)

    def test_formula_payload_add_failure_rolls_back_partial_block(self) -> None:
        db, revision = self._text_block_db()

        def fail_formula_payload(instance: object) -> None:
            if isinstance(instance, FormulaBlockContent):
                raise RuntimeError("formula payload insert failed")

        db.add.side_effect = fail_formula_payload
        with self.assertRaises(RuntimeError):
            QuestionEditorService(db).create_formula_block(
                revision_id=revision.id,
                request=self._formula_block_request(),
            )
        db.rollback.assert_called_once_with()
        db.commit.assert_not_called()

    def test_formula_integrity_conflict_is_translated_and_rolled_back(self) -> None:
        db, revision = self._text_block_db()
        db.commit.side_effect = IntegrityError(
            "insert", {}, Exception("active formula order conflict"),
        )
        with self.assertRaises(ContentBlockOrderConflictError):
            QuestionEditorService(db).create_formula_block(
                revision_id=revision.id,
                request=self._formula_block_request(),
            )
        db.rollback.assert_called_once_with()
        db.commit.assert_called_once_with()

    def test_existing_formula_updates_in_place_and_preserves_block_identity(self) -> None:
        db, revision, block, content = self._formula_block_update_db()
        original_block_id = block.id
        original_revision_id = block.question_revision_id
        original_sort_order = block.sort_order
        original_payload_id = content.content_block_id
        new_timestamp = NOW + timedelta(seconds=1)

        with patch(
            "app.services.question_editor_service._utc_now",
            return_value=new_timestamp,
        ):
            response = QuestionEditorService(db).update_formula_block(
                revision_id=revision.id,
                block_id=block.id,
                request=self._formula_block_update_request(),
            )

        self.assertIsInstance(response, FormulaBlockRead)
        self.assertEqual(response.id, original_block_id)
        self.assertEqual(response.block_type, ContentBlockType.FORMULA)
        self.assertEqual(response.sort_order, original_sort_order)
        self.assertEqual(response.payload.source_latex, "  y^2 + 1  ")
        self.assertEqual(response.payload.format_version, 1)
        self.assertEqual(content.source_latex, "  y^2 + 1  ")
        self.assertEqual(content.format_version, 1)
        self.assertEqual(content.content_block_id, original_payload_id)
        self.assertEqual(block.id, original_block_id)
        self.assertEqual(block.question_revision_id, original_revision_id)
        self.assertEqual(block.block_type, ContentBlockType.FORMULA)
        self.assertEqual(block.sort_order, original_sort_order)
        self.assertEqual(revision.updated_at, new_timestamp)
        self.assertFalse(hasattr(content, "rendered_html"))
        self.assertFalse(hasattr(content, "rendered_svg"))
        self.assertFalse(hasattr(content, "rendered_mathml"))
        db.add.assert_not_called()
        db.flush.assert_not_called()
        db.commit.assert_called_once_with()
        db.rollback.assert_not_called()

    def test_formula_update_revision_query_filters_eligibility_and_locks(self) -> None:
        db, revision, block, _content = self._formula_block_update_db()
        QuestionEditorService(db).update_formula_block(
            revision_id=revision.id,
            block_id=block.id,
            request=self._formula_block_update_request(),
        )
        statement = str(db.scalar.call_args_list[0].args[0])
        self.assertIn("question_revisions.deleted_at IS NULL", statement)
        self.assertIn("question_forms.is_active IS true", statement)
        self.assertIn("question_forms.deleted_at IS NULL", statement)
        self.assertIn("question_families.is_active IS true", statement)
        self.assertIn("question_families.deleted_at IS NULL", statement)
        self.assertIn("FOR UPDATE", statement)

    def test_formula_update_block_query_is_scoped_active_and_locked(self) -> None:
        db, revision, block, _content = self._formula_block_update_db()
        QuestionEditorService(db).update_formula_block(
            revision_id=revision.id,
            block_id=block.id,
            request=self._formula_block_update_request(),
        )
        statement = str(db.scalar.call_args_list[1].args[0])
        self.assertIn("content_blocks.id", statement)
        self.assertIn("content_blocks.question_revision_id", statement)
        self.assertIn("content_blocks.deleted_at IS NULL", statement)
        self.assertIn("FOR UPDATE", statement)

    def test_empty_formula_update_is_accepted_exactly(self) -> None:
        db, revision, block, content = self._formula_block_update_db()
        response = QuestionEditorService(db).update_formula_block(
            revision_id=revision.id,
            block_id=block.id,
            request=self._formula_block_update_request(""),
        )
        self.assertEqual(content.source_latex, "")
        self.assertEqual(response.payload.source_latex, "")

    def test_formula_update_revision_failures_prevent_block_lookup(self) -> None:
        cases = (
            (None, RevisionNotFoundError),
            (
                SimpleNamespace(
                    id=uuid.uuid4(),
                    status=QuestionRevisionStatus.APPROVED,
                    updated_at=NOW,
                ),
                RevisionNotEditableError,
            ),
            (
                SimpleNamespace(
                    id=uuid.uuid4(),
                    status=QuestionRevisionStatus.DRAFT,
                    updated_at=NOW + timedelta(seconds=1),
                ),
                RevisionConflictError,
            ),
        )
        for revision, error in cases:
            with self.subTest(error=error.__name__):
                db = MagicMock()
                db.scalar.return_value = revision
                with self.assertRaises(error):
                    QuestionEditorService(db).update_formula_block(
                        revision_id=(revision.id if revision else uuid.uuid4()),
                        block_id=uuid.uuid4(),
                        request=self._formula_block_update_request(),
                    )
                self.assertEqual(db.scalar.call_count, 1)
                db.rollback.assert_called_once_with()
                db.commit.assert_not_called()
                db.add.assert_not_called()

    def test_missing_cross_revision_or_deleted_formula_block_is_rejected(self) -> None:
        revision = SimpleNamespace(
            id=uuid.uuid4(), status=QuestionRevisionStatus.DRAFT,
            updated_at=NOW,
        )
        db = MagicMock()
        db.scalar.side_effect = [revision, None]
        with self.assertRaises(EditorBlockNotFoundError):
            QuestionEditorService(db).update_formula_block(
                revision_id=revision.id,
                block_id=uuid.uuid4(),
                request=self._formula_block_update_request(),
            )
        statement = str(db.scalar.call_args_list[1].args[0])
        self.assertIn("content_blocks.question_revision_id", statement)
        self.assertIn("content_blocks.deleted_at IS NULL", statement)
        db.rollback.assert_called_once_with()
        db.commit.assert_not_called()

    def test_non_formula_blocks_are_rejected_without_mutation(self) -> None:
        for block_type in (
            ContentBlockType.TEXT,
            ContentBlockType.IMAGE,
            ContentBlockType.GEOMETRY,
            ContentBlockType.GRAPH,
        ):
            with self.subTest(block_type=block_type):
                db, revision, block, content = self._formula_block_update_db(
                    block_type=block_type,
                )
                with self.assertRaises(EditorBlockTypeMismatchError):
                    QuestionEditorService(db).update_formula_block(
                        revision_id=revision.id,
                        block_id=block.id,
                        request=self._formula_block_update_request(),
                    )
                self.assertEqual(content.source_latex, "x^2")
                db.rollback.assert_called_once_with()
                db.commit.assert_not_called()
                db.add.assert_not_called()

    def test_missing_formula_payload_is_rejected(self) -> None:
        db, revision, block, _content = self._formula_block_update_db(
            include_content=False,
        )
        with self.assertRaises(EditorBlockContentMissingError):
            QuestionEditorService(db).update_formula_block(
                revision_id=revision.id,
                block_id=block.id,
                request=self._formula_block_update_request(),
            )
        db.rollback.assert_called_once_with()
        db.commit.assert_not_called()

    def test_formula_update_integrity_error_rolls_back_and_propagates(self) -> None:
        db, revision, block, _content = self._formula_block_update_db()
        failure = IntegrityError(
            "update", {}, Exception("formula persistence conflict"),
        )
        db.commit.side_effect = failure
        with self.assertRaises(IntegrityError) as raised:
            QuestionEditorService(db).update_formula_block(
                revision_id=revision.id,
                block_id=block.id,
                request=self._formula_block_update_request(),
            )
        self.assertIs(raised.exception, failure)
        db.rollback.assert_called_once_with()
        db.commit.assert_called_once_with()

    def test_delete_block_soft_deletes_container_only_and_touches_revision(self) -> None:
        db, revision, block = self._delete_block_db()
        text_payload = SimpleNamespace(document={"type": "document"})
        formula_payload = SimpleNamespace(source_latex="x^2", format_version=1)
        block.text_content = text_payload
        block.formula_content = formula_payload
        original = (
            block.id,
            block.question_revision_id,
            block.block_type,
            block.sort_order,
        )
        deleted_at = NOW + timedelta(seconds=1)

        with patch(
            "app.services.question_editor_service._utc_now",
            return_value=deleted_at,
        ):
            result = QuestionEditorService(db).delete_block(
                revision_id=revision.id,
                block_id=block.id,
                expected_revision_updated_at=NOW,
            )

        self.assertIsNone(result)
        self.assertEqual(block.deleted_at, deleted_at)
        self.assertIsNotNone(block.deleted_at.tzinfo)
        self.assertEqual(revision.updated_at, deleted_at)
        self.assertEqual(
            (block.id, block.question_revision_id, block.block_type, block.sort_order),
            original,
        )
        self.assertEqual(text_payload.document, {"type": "document"})
        self.assertEqual(formula_payload.source_latex, "x^2")
        self.assertEqual(formula_payload.format_version, 1)
        db.add.assert_not_called()
        db.delete.assert_not_called()
        db.flush.assert_not_called()
        db.commit.assert_called_once_with()
        db.rollback.assert_not_called()

    def test_delete_block_queries_are_active_scoped_and_locked(self) -> None:
        db, revision, block = self._delete_block_db()
        QuestionEditorService(db).delete_block(
            revision_id=revision.id,
            block_id=block.id,
            expected_revision_updated_at=NOW,
        )

        revision_statement = str(db.scalar.call_args_list[0].args[0])
        self.assertIn("question_revisions.id", revision_statement)
        self.assertIn("question_revisions.deleted_at IS NULL", revision_statement)
        self.assertIn("question_forms.is_active IS true", revision_statement)
        self.assertIn("question_forms.deleted_at IS NULL", revision_statement)
        self.assertIn("question_families.is_active IS true", revision_statement)
        self.assertIn("question_families.deleted_at IS NULL", revision_statement)
        self.assertIn("FOR UPDATE", revision_statement)

        block_statement = str(db.scalar.call_args_list[1].args[0])
        self.assertIn("content_blocks.id", block_statement)
        self.assertIn("content_blocks.question_revision_id", block_statement)
        self.assertIn("content_blocks.deleted_at IS NULL", block_statement)
        self.assertIn("FOR UPDATE", block_statement)

    def test_delete_block_accepts_every_content_block_type_without_payload(self) -> None:
        for block_type in ContentBlockType:
            with self.subTest(block_type=block_type):
                db, revision, block = self._delete_block_db(
                    block_type=block_type,
                )
                QuestionEditorService(db).delete_block(
                    revision_id=revision.id,
                    block_id=block.id,
                    expected_revision_updated_at=NOW,
                )
                self.assertIsNotNone(block.deleted_at)
                db.commit.assert_called_once_with()

    def test_delete_block_revision_failures_prevent_block_lookup(self) -> None:
        cases = (
            (None, RevisionNotFoundError),
            (
                SimpleNamespace(
                    id=uuid.uuid4(),
                    status=QuestionRevisionStatus.APPROVED,
                    updated_at=NOW,
                ),
                RevisionNotEditableError,
            ),
            (
                SimpleNamespace(
                    id=uuid.uuid4(),
                    status=QuestionRevisionStatus.DRAFT,
                    updated_at=NOW + timedelta(seconds=1),
                ),
                RevisionConflictError,
            ),
        )
        for revision, error in cases:
            with self.subTest(error=error.__name__):
                db = MagicMock()
                db.scalar.return_value = revision
                with self.assertRaises(error):
                    QuestionEditorService(db).delete_block(
                        revision_id=(revision.id if revision else uuid.uuid4()),
                        block_id=uuid.uuid4(),
                        expected_revision_updated_at=NOW,
                    )
                self.assertEqual(db.scalar.call_count, 1)
                db.rollback.assert_called_once_with()
                db.commit.assert_not_called()

    def test_delete_block_missing_cross_revision_or_deleted_is_rejected(self) -> None:
        revision = SimpleNamespace(
            id=uuid.uuid4(),
            status=QuestionRevisionStatus.DRAFT,
            updated_at=NOW,
        )
        db = MagicMock()
        db.scalar.side_effect = [revision, None]
        with self.assertRaises(EditorBlockNotFoundError):
            QuestionEditorService(db).delete_block(
                revision_id=revision.id,
                block_id=uuid.uuid4(),
                expected_revision_updated_at=NOW,
            )
        block_statement = str(db.scalar.call_args_list[1].args[0])
        self.assertIn("content_blocks.question_revision_id", block_statement)
        self.assertIn("content_blocks.deleted_at IS NULL", block_statement)
        db.rollback.assert_called_once_with()
        db.commit.assert_not_called()

    def test_delete_block_integrity_error_rolls_back_and_propagates(self) -> None:
        db, revision, block = self._delete_block_db()
        failure = IntegrityError(
            "update", {}, Exception("block soft-delete conflict"),
        )
        db.commit.side_effect = failure
        with self.assertRaises(IntegrityError) as raised:
            QuestionEditorService(db).delete_block(
                revision_id=revision.id,
                block_id=block.id,
                expected_revision_updated_at=NOW,
            )
        self.assertIs(raised.exception, failure)
        db.rollback.assert_called_once_with()
        db.commit.assert_called_once_with()


if __name__ == "__main__":
    unittest.main()

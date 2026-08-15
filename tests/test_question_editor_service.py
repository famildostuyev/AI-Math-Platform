from __future__ import annotations

import sys
import unittest
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

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
from app.models.text_block_content import TextBlockContent
from app.schemas.question_editor import (
    QuestionDraftCreate,
    QuestionRevisionEditorRead,
    TextBlockCreate,
    TextBlockRead,
)
from app.services.question_editor_service import (
    ContentBlockOrderConflictError,
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


if __name__ == "__main__":
    unittest.main()

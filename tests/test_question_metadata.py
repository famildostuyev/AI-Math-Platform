from __future__ import annotations

import unittest
import uuid
from copy import deepcopy
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import test_question_editor_api as support
from pydantic import ValidationError
from sqlalchemy.dialects import postgresql

from app.core.enums import QuestionDifficulty, QuestionRevisionStatus, RoleName
from app.schemas.question_editor import QuestionMetadataRead, QuestionMetadataUpdate
from app.services.question_editor_service import (
    QuestionEditorService, QuestionTypeNotFoundError, RevisionConflictError,
    RevisionNotEditableError, RevisionNotFoundError, SharedQuestionTypeConflictError,
)


class MetadataServiceTest(unittest.TestCase):
    def setUp(self):
        self.form = SimpleNamespace(id=uuid.uuid4(), question_type_id=uuid.uuid4(),
                                    question_type=SimpleNamespace(name="multiple_choice"),
                                    source_id=uuid.uuid4(), source_detail="source")
        self.revision = SimpleNamespace(id=uuid.uuid4(), question_form=self.form,
                                        status=QuestionRevisionStatus.DRAFT,
                                        difficulty=QuestionDifficulty.EASY, updated_at=support.NOW,
                                        blocks=[{"kind": k, "payload": {"value": k}} for k in ("text", "formula", "geometry", "image")],
                                        answer_options=[{"is_correct": True}], accepted_answers=[{"answer": "x"}],
                                        solution={"blocks": ["reasoning"]})
        self.db = MagicMock()
        self.db.scalar.side_effect = [self.revision, self.form.question_type, None]
        self.service = QuestionEditorService(self.db)

    def update(self, **fields):
        return self.service.update_metadata(revision_id=self.revision.id, request=QuestionMetadataUpdate(
            expected_revision_updated_at=support.NOW, **fields))

    def test_atomic_combined_update_preserves_content_and_uses_catalog(self):
        before = deepcopy(self.revision.__dict__)
        new_type = uuid.uuid4()
        result = self.update(question_type_id=new_type, difficulty="hard")
        self.assertEqual(result.question_type_id, new_type)
        self.assertEqual(result.difficulty, QuestionDifficulty.HARD)
        self.assertGreater(result.updated_at, support.NOW)
        self.assertEqual(result.updated_at, self.revision.updated_at)
        self.assertEqual(result.answer_policy.value, "option_single")
        for field in ("blocks", "answer_options", "accepted_answers", "solution"):
            self.assertEqual(getattr(self.revision, field), before[field])
        self.assertEqual(self.form.source_id, before["question_form"].source_id)
        self.assertEqual(self.form.source_detail, "source")
        statements = [str(call.args[0].compile(dialect=postgresql.dialect())) for call in self.db.scalar.call_args_list]
        self.assertIn("FOR UPDATE", statements[0])
        self.assertIn("question_types.is_active IS true", statements[1])
        self.assertIn("question_types.deleted_at IS NULL", statements[1])
        self.db.commit.assert_called_once()
        self.db.rollback.assert_not_called()
        self.db.delete.assert_not_called()
        self.db.add.assert_not_called()

    def test_type_only_preserves_difficulty(self):
        result = self.update(question_type_id=uuid.uuid4())
        self.assertEqual(result.difficulty, QuestionDifficulty.EASY)

    def test_difficulty_only_preserves_type(self):
        result = self.update(difficulty="medium")
        self.assertEqual(result.question_type_id, self.form.question_type_id)
        self.assertEqual(self.db.scalar.call_count, 1)

    def test_null_difficulty(self):
        self.assertIsNone(self.update(difficulty=None).difficulty)

    def test_unknown_or_inactive_type_rejects_entire_patch(self):
        self.db.scalar.side_effect = [self.revision, None]
        old_type = self.form.question_type_id
        with self.assertRaises(QuestionTypeNotFoundError):
            self.update(question_type_id=uuid.uuid4(), difficulty="hard")
        self.assertEqual(self.form.question_type_id, old_type)
        self.assertEqual(self.revision.difficulty, QuestionDifficulty.EASY)
        self.db.commit.assert_not_called()
        self.db.rollback.assert_called_once()

    def test_shared_type_rejects_without_changing_either_owner(self):
        self.db.scalar.side_effect = [self.revision, self.form.question_type, uuid.uuid4()]
        with self.assertRaises(SharedQuestionTypeConflictError):
            self.update(question_type_id=uuid.uuid4(), difficulty="hard")
        self.assertEqual(self.revision.difficulty, QuestionDifficulty.EASY)
        self.db.commit.assert_not_called()
        self.db.rollback.assert_called_once()

    def test_unchanged_shared_type_and_difficulty_are_allowed(self):
        self.update(question_type_id=self.form.question_type_id, difficulty="hard")
        self.assertEqual(self.db.scalar.call_count, 2)

    def test_missing_stale_and_noneditable_targets(self):
        for error in (RevisionNotFoundError, RevisionConflictError, RevisionNotEditableError):
            with self.subTest(error=error):
                self.setUp()
                if error is RevisionNotFoundError:
                    self.db.scalar.side_effect = [None]
                elif error is RevisionConflictError:
                    self.revision.updated_at += timedelta(seconds=1)
                else:
                    self.revision.status = QuestionRevisionStatus.APPROVED
                with self.assertRaises(error):
                    self.update(difficulty="hard")
                self.db.commit.assert_not_called()
                self.db.rollback.assert_called_once()

    def test_flush_and_commit_failures_rollback(self):
        for stage in ("flush", "commit"):
            with self.subTest(stage=stage):
                self.setUp()
                getattr(self.db, stage).side_effect = RuntimeError("synthetic failure")
                with self.assertRaises(RuntimeError):
                    self.update(question_type_id=uuid.uuid4(), difficulty="hard")
                self.db.rollback.assert_called_once()

    def test_invalid_schema(self):
        for fields in ({}, {"difficulty": "extreme"}, {"question_type_id": None}, {"question_type_id": "multiple_choice"}, {"other": True}):
            with self.subTest(fields=fields), self.assertRaises(ValidationError):
                QuestionMetadataUpdate(expected_revision_updated_at=support.NOW, **fields)
        with self.assertRaises(ValidationError):
            QuestionMetadataUpdate(expected_revision_updated_at=support.NOW.replace(tzinfo=None), difficulty="easy")


class MetadataApiTest(unittest.TestCase):
    def setUp(self):
        support.QuestionEditorApiTest.setUp(self)
        self.url = f"/api/v1/question-editor/revisions/{uuid.uuid4()}/metadata"
        self.request = {"difficulty": "medium", "expected_revision_updated_at": support.NOW.isoformat()}

    def tearDown(self):
        support.app.dependency_overrides.clear()

    @patch("app.api.question_editor.QuestionEditorService")
    def test_admin_response_and_timestamp(self, service):
        result = QuestionMetadataRead(revision_id=uuid.uuid4(), question_type_id=uuid.uuid4(),
                                      difficulty="medium", updated_at=support.NOW + timedelta(seconds=1), answer_policy="option_single")
        service.return_value.update_metadata.return_value = result
        response = self.client.patch(self.url, json=self.request)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), result.model_dump(mode="json"))
        request = service.return_value.update_metadata.call_args.kwargs["request"]
        self.assertNotIn("question_type_id", request.model_fields_set)

    @patch("app.api.question_editor.QuestionEditorService")
    def test_error_mapping(self, service):
        for error, code in ((RevisionNotFoundError, 404), (RevisionConflictError, 409), (RevisionNotEditableError, 409), (SharedQuestionTypeConflictError, 409), (QuestionTypeNotFoundError, 422)):
            service.return_value.update_metadata.side_effect = error("private diagnostic")
            response = self.client.patch(self.url, json=self.request)
            self.assertEqual(response.status_code, code)
            self.assertNotIn("private diagnostic", response.text)

    @patch("app.api.question_editor.QuestionEditorService")
    def test_auth_and_invalid_metadata(self, service):
        for fields in ({"difficulty": "extreme"}, {"question_type_id": "invalid"}, {"question_type_id": None}):
            self.assertEqual(self.client.patch(self.url, json={**self.request, **fields}).status_code, 422)
        self.db.scalar.return_value = RoleName.TEACHER.value
        self.assertEqual(self.client.patch(self.url, json=self.request).status_code, 403)
        del support.app.dependency_overrides[support.get_current_active_user]
        self.assertEqual(self.client.patch(self.url, json=self.request).status_code, 401)
        service.assert_not_called()

    def test_openapi_contract(self):
        schema = support.app.openapi()
        operation = schema["paths"]["/api/v1/question-editor/revisions/{revision_id}/metadata"]["patch"]
        self.assertIn("QuestionMetadataUpdate", str(operation["requestBody"]))
        self.assertIn("QuestionMetadataRead", str(operation["responses"]["200"]))
        properties = schema["components"]["schemas"]["QuestionMetadataUpdate"]
        self.assertEqual(properties["required"], ["expected_revision_updated_at"])
        self.assertEqual(properties["properties"]["question_type_id"]["type"], "string")
        self.assertNotIn("default", properties["properties"]["question_type_id"])
        self.assertEqual(properties["anyOf"], [{"required": ["question_type_id"]}, {"required": ["difficulty"]}])

"""Generic layout persistence must never rewrite Geometry semantic content."""
import copy
import unittest
from datetime import timedelta
from unittest.mock import patch
from pydantic import ValidationError
import test_question_editor_service as fixtures
import test_question_editor_api as api_fixtures
from app.schemas.question_editor import VisualPlacementV1, VisualPlacementUpdate
from app.services.question_editor_service import QuestionEditorService, RevisionConflictError


def placement():
    return dict(version=1, layoutMode="floating", anchor={"kind": "document"},
                position={"x": 700, "y": 300, "unit": "px"},
                size={"width": 480, "height": 320, "unit": "px"})


class VisualPlacementTest(unittest.TestCase):
    def test_migration_emits_only_additive_nullable_layout_ddl(self):
        import importlib.util
        import io
        from alembic.migration import MigrationContext
        from alembic.operations import Operations
        path = fixtures.BACKEND_DIR / 'alembic/versions/a8c0e2f4b619_add_visual_placement.py'
        spec = importlib.util.spec_from_file_location('visual_placement_migration', path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        output = io.StringIO()
        context = MigrationContext.configure(dialect_name='postgresql', opts={'as_sql': True, 'output_buffer': output})
        with Operations.context(context):
            module.upgrade()
        ddl = output.getvalue()
        self.assertIn('ADD COLUMN visual_placement JSONB', ddl)
        self.assertNotIn('NOT NULL', ddl)
        self.assertNotIn('DROP', ddl)
        self.assertNotIn('UPDATE', ddl)

    def test_storage_is_nullable_generic_json_without_geometry_model_change(self):
        from sqlalchemy.dialects.postgresql import JSONB
        from app.models.content_block import ContentBlock
        from app.models.geometry_block_content import GeometryBlockContent
        column = ContentBlock.__table__.c.visual_placement
        self.assertTrue(column.nullable)
        self.assertIsInstance(column.type, JSONB)
        self.assertTrue(column.type.none_as_null)
        self.assertNotIn("visual_placement", GeometryBlockContent.__table__.c)

    def test_api_layout_only_update_validation_and_authorization(self):
        fixture = api_fixtures.QuestionEditorApiTest()
        fixture.setUp()
        self.addCleanup(fixture.tearDown)
        result = fixture._geometry_response(fixtures.geometry_v1())
        result.visual_placement = VisualPlacementV1.model_validate(placement())
        url = f"/api/v1/question-editor/revisions/{fixtures.uuid.uuid4()}/blocks/{result.id}/visual-placement"
        body = {"visual_placement": placement(), "expected_revision_updated_at": fixtures.NOW.isoformat()}
        with patch("app.api.question_editor.QuestionEditorService") as service:
            service.return_value.update_visual_placement.return_value = result
            response = fixture.client.patch(url, json=body)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["visual_placement"], placement())
            request = service.return_value.update_visual_placement.call_args.kwargs["request"]
            self.assertFalse(hasattr(request, "source_data"))
            self.assertEqual(fixture.client.patch(url, json={**body, "source_data": {}}).status_code, 422)
            service.return_value.update_visual_placement.side_effect = RevisionConflictError("stale")
            self.assertEqual(fixture.client.patch(url, json=body).status_code, 409)
            fixture.db.scalar.return_value = "student"
            self.assertEqual(fixture.client.patch(url, json=body).status_code, 403)

    def test_rejects_invalid_or_unimplemented_layout(self):
        for field, value in [("version", 2), ("layoutMode", "anchored"), ("rotationDegrees", 30)]:
            with self.subTest(field=field), self.assertRaises(ValidationError):
                VisualPlacementV1.model_validate({**placement(), field: value})
        for field, value in [("width", 0), ("height", float("nan")), ("width", float("inf"))]:
            data = placement(); data["size"][field] = value
            with self.subTest(field=field, value=value), self.assertRaises(ValidationError):
                VisualPlacementV1.model_validate(data)

    def test_create_empty_valid_frame_and_reload_serialization(self):
        helper = fixtures.QuestionEditorServiceTest()
        geometry = fixtures.geometry_v1()
        for key in ("points", "segments", "polygons", "texts"):
            geometry[key] = []
        request = helper._geometry_block_request(geometry)
        request.visual_placement = VisualPlacementV1.model_validate(placement())
        db, revision = helper._geometry_create_db()
        service = QuestionEditorService(db)
        result = service.create_geometry_block(revision_id=revision.id, request=request)
        self.assertEqual(result.visual_placement.model_dump(), placement())
        block, content = [call.args[0] for call in db.add.call_args_list]
        block.geometry_content = content
        self.assertEqual(service._serialize_block(block).visual_placement, result.visual_placement)
        self.assertEqual(result.payload.source_data, geometry)
        self.assertEqual(db.add.call_count, 2)  # one block and its one payload
        db.commit.assert_called_once()

    def test_move_and_resize_round_trip_without_touching_geometry(self):
        helper = fixtures.QuestionEditorServiceTest()
        for size in [(480, 320), (700, 400)]:
            db, revision, block, content = helper._geometry_update_db()
            before = copy.deepcopy(content.source_data)
            original = content.source_data
            layout = placement(); layout["size"].update(width=size[0], height=size[1])
            request = VisualPlacementUpdate(visual_placement=layout, expected_revision_updated_at=fixtures.NOW)
            service = QuestionEditorService(db)
            result = service.update_visual_placement(revision_id=revision.id, block_id=block.id, request=request)
            self.assertIs(content.source_data, original)
            self.assertEqual(content.source_data, before)
            self.assertEqual(result.visual_placement.model_dump(), layout)
            self.assertEqual(service._serialize_block(block).visual_placement, result.visual_placement)
            db.commit.assert_called_once()
            for call in db.scalar.call_args_list:
                self.assertIn("FOR UPDATE", str(call.args[0]))

    def test_stale_move_rejected_before_block_mutation(self):
        helper = fixtures.QuestionEditorServiceTest()
        db, revision, block, content = helper._geometry_update_db()
        request = VisualPlacementUpdate(visual_placement=placement(), expected_revision_updated_at=fixtures.NOW - timedelta(seconds=1))
        with self.assertRaises(RevisionConflictError):
            QuestionEditorService(db).update_visual_placement(revision_id=revision.id, block_id=block.id, request=request)
        db.commit.assert_not_called(); db.rollback.assert_called_once()
        self.assertFalse(hasattr(block, "visual_placement"))

    def test_existing_geometry_update_preserves_layout(self):
        helper = fixtures.QuestionEditorServiceTest()
        db, revision, block, content = helper._geometry_update_db()
        block.visual_placement = placement()
        result = QuestionEditorService(db).update_geometry_block(revision_id=revision.id, block_id=block.id,
                                                               request=helper._geometry_block_update_request())
        self.assertEqual(result.visual_placement.model_dump(), placement())

    def test_two_frames_do_not_share_placement(self):
        helper = fixtures.QuestionEditorServiceTest()
        db, revision, first, _ = helper._geometry_update_db()
        _, _, second, _ = helper._geometry_update_db()
        second.visual_placement = placement()
        before = copy.deepcopy(second.visual_placement)
        moved = placement(); moved["position"]["x"] = 950
        QuestionEditorService(db).update_visual_placement(revision_id=revision.id, block_id=first.id,
            request=VisualPlacementUpdate(visual_placement=moved, expected_revision_updated_at=fixtures.NOW))
        self.assertEqual(second.visual_placement, before)


if __name__ == '__main__':
    unittest.main()

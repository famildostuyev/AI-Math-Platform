import copy
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from pydantic import ValidationError
from app.schemas.question_editor import GeometryBlockCreate, GeometryBlockUpdate, GeometryBlockRead
from tests.test_geometry_3d_contract import FIXTURES
from tests.test_geometry_v1_contract import NOW, geometry_v1

class Geometry3DM1BackendTest(unittest.TestCase):
    def test_create_update_read_roundtrip_mixed_versions(self):
        for source in (geometry_v1(), FIXTURES['scene']):
            created = GeometryBlockCreate.model_validate(dict(block_type='geometry', payload=dict(source_data=source), expected_revision_updated_at=NOW))
            canonical = created.payload.source_data.model_dump(mode='json')
            updated = GeometryBlockUpdate.model_validate(dict(source_data=canonical, expected_revision_updated_at=NOW))
            self.assertEqual(updated.source_data.model_dump(mode='json'), canonical)
            read = GeometryBlockRead.model_validate(dict(id='00000000-0000-0000-0000-000000000001', block_type='geometry', sort_order=0, payload=dict(source_data=canonical, format_version=1)))
            self.assertEqual(read.payload.source_data, canonical)

    def test_empty_and_print_camera_roundtrip(self):
        source = copy.deepcopy(FIXTURES['scene'])
        for key in ('points','linear_objects','planes','edges','faces','surfaces','solids','constructions','annotations','markings'):
            source[key] = []
        source['print_camera']['position'] = [6, 4, 2]
        update = GeometryBlockUpdate.model_validate(dict(source_data=source, expected_revision_updated_at=NOW))
        self.assertEqual(update.source_data.model_dump(mode='json'), source)

    def test_invalid_scene_and_required_concurrency_boundary(self):
        for change in ({'schema_version': 99}, {'editing_camera': {}}, {'print_camera': {}}):
            source = dict(copy.deepcopy(FIXTURES['scene']), **change)
            with self.assertRaises(ValidationError):
                GeometryBlockUpdate.model_validate(dict(source_data=source, expected_revision_updated_at=NOW))
        with self.assertRaises(ValidationError):
            GeometryBlockUpdate.model_validate(dict(source_data=FIXTURES['scene']))

if __name__ == '__main__': unittest.main()

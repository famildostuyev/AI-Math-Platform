import json
from pathlib import Path
import subprocess
import tempfile
import unittest

from tests.test_geometry_3d_contract import GeometryScene3D, normalize_scene_3d
from app.schemas.question_editor import GeometryBlockCreate, GeometryBlockUpdate
from tests.test_geometry_v1_contract import NOW


class CylinderSurfaceLabelTest(unittest.TestCase):
    def test_manual_label_payload_parity(self):
        root = Path(__file__).resolve().parents[1]
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp) / 'labels.json'
            subprocess.run(['node', 'tests/test_geometry_3d_cylinder_surface_labels.mjs', str(output)], cwd=root, check=True)
            scenes = json.loads(output.read_text(encoding='utf-8'))
        self.assertEqual(len(scenes), 84)
        self.assertEqual({p['label'] for scene in scenes for p in scene['points'] if p['id'] == 'attached'}, {None, 'P', 'M₁ & <Q>', 'Q', 'Free'})
        for scene in scenes:
            self.assertEqual(normalize_scene_3d(scene), scene)
            self.assertEqual(GeometryScene3D.model_validate(scene).model_dump(mode='json'), scene)
            created = GeometryBlockCreate.model_validate(dict(block_type='geometry', payload=dict(source_data=scene), expected_revision_updated_at=NOW))
            updated = GeometryBlockUpdate.model_validate(dict(source_data=created.payload.source_data.model_dump(mode='json'), expected_revision_updated_at=NOW))
            self.assertEqual(updated.source_data.model_dump(mode='json'), scene)


if __name__ == '__main__':
    unittest.main()

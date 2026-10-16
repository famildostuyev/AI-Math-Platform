import unittest
from tests.test_geometry_3d_contract import GeometryScene3D  # Initializes the backend import path.
from app.schemas.geometry_3d_solids import solid_topology


class PyramidBaseAlignmentTest(unittest.TestCase):
    def test_exact_source_vertices_on_all_working_planes(self):
        for plane in ('XY', 'XZ', 'YZ'):
            with self.subTest(plane=plane):
                pairs = [(1.3, -2.1), (3.7, -1.4), (4.1, 1.2), (.8, .6)]
                positions = [[x, y, 0] if plane == 'XY' else [x, 0, y] if plane == 'XZ' else [0, x, y] for x, y in pairs]
                ids = [f'p{i}' for i in range(4)]
                scene = dict(points=[dict(id=id, position=position) for id, position in zip(ids, positions)], faces=[dict(id='source', boundary=ids)])
                solid = dict(kind='pyramid', frame=dict(origin=[0,0,0], x_axis=[1,0,0], y_axis=[0,1,0]), parameters=dict(sides=4, height=2, apex_offset=[0,0], base=dict(kind='face', face_id='source', point_ids=ids)))
                topology = solid_topology(scene, solid)
                self.assertEqual(topology['vertices'][:4], positions)
                self.assertEqual(topology['source_ids'], ids)
                # Explicit saved placement is intentionally compatible with the legacy contract.
                solid['frame']['origin'] = [1, 0, 0]
                self.assertEqual(solid_topology(scene, solid)['vertices'][0], [positions[0][0]+1, *positions[0][1:]])


if __name__ == '__main__':
    unittest.main()

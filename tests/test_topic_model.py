from __future__ import annotations

import sys
import unittest
from pathlib import Path

from sqlalchemy import Boolean, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import RelationshipDirection


BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

import app.models  # noqa: F401
from app.models.section import Section
from app.models.topic import Topic


class TopicModelMetadataTest(unittest.TestCase):
    def test_metadata_matches_hierarchical_topic_contract(self) -> None:
        table = Topic.__table__

        self.assertEqual(table.name, "topics")
        self.assertEqual(
            set(table.columns.keys()),
            {
                "id", "section_id", "parent_id", "name", "display_name",
                "description", "sort_order", "is_active", "created_at",
                "updated_at", "deleted_at",
            },
        )
        self.assertTrue(table.c.id.primary_key)
        self.assertIn("created_at", table.c)
        self.assertIn("updated_at", table.c)
        self.assertTrue(table.c.deleted_at.nullable)

        expected_foreign_keys = {
            "section_id": ("sections.id", False),
            "parent_id": ("topics.id", True),
        }
        for column_name, (target, nullable) in expected_foreign_keys.items():
            column = table.c[column_name]
            foreign_key = next(iter(column.foreign_keys))
            self.assertEqual(column.nullable, nullable)
            self.assertTrue(column.index)
            self.assertEqual(foreign_key.target_fullname, target)
            self.assertEqual(foreign_key.ondelete, "RESTRICT")

        self.assertIsInstance(table.c.name.type, String)
        self.assertEqual(table.c.name.type.length, 100)
        self.assertFalse(table.c.name.nullable)
        self.assertFalse(bool(table.c.name.unique))
        self.assertIsInstance(table.c.display_name.type, String)
        self.assertEqual(table.c.display_name.type.length, 150)
        self.assertFalse(table.c.display_name.nullable)
        self.assertFalse(bool(table.c.display_name.unique))
        self.assertIsInstance(table.c.description.type, Text)
        self.assertTrue(table.c.description.nullable)

        self.assertIsInstance(table.c.sort_order.type, Integer)
        self.assertFalse(table.c.sort_order.nullable)
        self.assertEqual(table.c.sort_order.default.arg, 0)
        self.assertEqual(str(table.c.sort_order.server_default.arg), "0")
        self.assertIsInstance(table.c.is_active.type, Boolean)
        self.assertFalse(table.c.is_active.nullable)
        self.assertTrue(table.c.is_active.default.arg)
        self.assertEqual(str(table.c.is_active.server_default.arg), "true")

        unique_constraints = {
            constraint.name: constraint
            for constraint in table.constraints
            if isinstance(constraint, UniqueConstraint)
        }
        identity = unique_constraints["uq_topics_section_id_name"]
        self.assertEqual(
            [column.name for column in identity.columns],
            ["section_id", "name"],
        )
        self.assertNotIn("parent_id", identity.columns)
        self.assertNotIn("deleted_at", identity.columns)

        relationships = Topic.__mapper__.relationships
        self.assertEqual(
            set(relationships.keys()),
            {"section", "parent", "children"},
        )
        self.assertEqual(relationships.section.back_populates, "topics")
        self.assertEqual(
            Section.__mapper__.relationships.topics.back_populates,
            "section",
        )
        self.assertEqual(relationships.parent.back_populates, "children")
        self.assertEqual(relationships.children.back_populates, "parent")
        self.assertEqual(
            relationships.parent.direction,
            RelationshipDirection.MANYTOONE,
        )
        self.assertEqual(
            relationships.children.direction,
            RelationshipDirection.ONETOMANY,
        )
        self.assertEqual(
            relationships.parent.remote_side,
            {table.c.id},
        )
        for relationship in (
            relationships.section,
            relationships.parent,
            relationships.children,
            Section.__mapper__.relationships.topics,
        ):
            self.assertNotIn("delete", relationship.cascade)
            self.assertNotIn("delete-orphan", relationship.cascade)

        self.assertTrue(
            {
                "purpose_id", "workflow", "ksq", "bsq", "selection_limit",
                "embedding", "semantic_tags", "learning_objectives",
                "prerequisites", "difficulty", "ai_score", "generated",
            }.isdisjoint(table.c.keys())
        )


if __name__ == "__main__":
    unittest.main()

from __future__ import annotations

import sys
import unittest
from pathlib import Path

from sqlalchemy import (
    Boolean,
    ForeignKeyConstraint,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
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

        self.assertFalse(table.c.section_id.nullable)
        self.assertTrue(table.c.section_id.index)
        self.assertTrue(table.c.parent_id.nullable)
        self.assertTrue(table.c.parent_id.index)

        foreign_key_constraints = {
            constraint.name: constraint
            for constraint in table.constraints
            if isinstance(constraint, ForeignKeyConstraint)
        }
        section_fk = next(
            constraint
            for constraint in foreign_key_constraints.values()
            if [element.target_fullname for element in constraint.elements]
            == ["sections.id"]
        )
        self.assertEqual(section_fk.ondelete, "RESTRICT")
        parent_fk = foreign_key_constraints[
            "fk_topics_section_id_parent_id_topics"
        ]
        self.assertEqual(
            [column.name for column in parent_fk.columns],
            ["section_id", "parent_id"],
        )
        self.assertEqual(
            [element.target_fullname for element in parent_fk.elements],
            ["topics.section_id", "topics.id"],
        )
        self.assertEqual(parent_fk.ondelete, "RESTRICT")
        self.assertFalse(
            any(
                constraint
                for constraint in foreign_key_constraints.values()
                if [column.name for column in constraint.columns]
                == ["parent_id"]
            )
        )

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
        parent_key = unique_constraints["uq_topics_section_id_id"]
        self.assertEqual(
            [column.name for column in parent_key.columns],
            ["section_id", "id"],
        )

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
            {table.c.section_id, table.c.id},
        )
        self.assertTrue(relationships.children.passive_deletes)
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

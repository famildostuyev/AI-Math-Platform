"""Generalize AI proposals for validated capability bundles.

Revision ID: c7e9f1a3b524
Revises: a5c7e9f1b302
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "c7e9f1a3b524"
down_revision: Union[str, Sequence[str], None] = "a5c7e9f1b302"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("ai_authoring_proposals", sa.Column("proposal_kind", sa.String(length=32), nullable=True))
    op.add_column("ai_authoring_proposals", sa.Column("result_kind", sa.String(length=32), nullable=True))
    op.add_column("ai_authoring_proposals", sa.Column("capability_bundle_schema_version", sa.Integer(), nullable=True))
    op.add_column("ai_authoring_proposals", sa.Column("capability_bundle", postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column("ai_authoring_proposals", sa.Column("capability_bundle_hash", sa.String(length=64), nullable=True))
    op.execute("UPDATE ai_authoring_proposals SET proposal_kind = 'authoring_actions', result_kind = 'mutation_proposal'")
    op.alter_column("ai_authoring_proposals", "proposal_kind", nullable=False)
    op.alter_column("ai_authoring_proposals", "result_kind", nullable=False)
    op.alter_column("ai_authoring_proposals", "action_schema_version", nullable=True)
    op.alter_column("ai_authoring_proposals", "actions", nullable=True)
    op.create_check_constraint("ai_authoring_proposal_kind", "ai_authoring_proposals", "proposal_kind IN ('authoring_actions', 'capability_bundle')")
    op.create_check_constraint("admin_ai_result_kind", "ai_authoring_proposals", "result_kind IN ('informational', 'mutation_proposal', 'unsupported')")
    op.create_check_constraint("ck_ai_authoring_proposals_result_kind_consistent", "ai_authoring_proposals", "result_kind = 'mutation_proposal'")
    op.drop_constraint("ck_ai_authoring_proposals_action_schema_version_positive", "ai_authoring_proposals", type_="check")
    op.create_check_constraint("ck_ai_authoring_proposals_action_schema_version_positive", "ai_authoring_proposals", "action_schema_version IS NULL OR action_schema_version > 0")
    op.create_check_constraint("ck_ai_authoring_proposals_bundle_schema_version_positive", "ai_authoring_proposals", "capability_bundle_schema_version IS NULL OR capability_bundle_schema_version > 0")
    op.create_check_constraint("ck_ai_authoring_proposals_bundle_hash_sha256", "ai_authoring_proposals", "capability_bundle_hash IS NULL OR capability_bundle_hash ~ '^[0-9a-f]{64}$'")
    op.create_check_constraint(
        "ck_ai_authoring_proposals_payload_kind_consistent", "ai_authoring_proposals",
        "(proposal_kind = 'authoring_actions' AND action_schema_version IS NOT NULL AND actions IS NOT NULL "
        "AND capability_bundle_schema_version IS NULL AND capability_bundle IS NULL AND capability_bundle_hash IS NULL) OR "
        "(proposal_kind = 'capability_bundle' AND action_schema_version IS NULL AND actions IS NULL "
        "AND capability_bundle_schema_version IS NOT NULL AND capability_bundle IS NOT NULL AND capability_bundle_hash IS NOT NULL)",
    )


def downgrade() -> None:
    # Capability-bundle proposals have no representation in the legacy schema,
    # whose action payload columns are both required. Remove only those
    # post-upgrade rows before restoring the legacy NOT NULL contract; existing
    # authoring-action proposals remain losslessly representable.
    op.execute("DELETE FROM ai_authoring_proposals WHERE proposal_kind = 'capability_bundle'")
    op.drop_constraint("ck_ai_authoring_proposals_payload_kind_consistent", "ai_authoring_proposals", type_="check")
    op.drop_constraint("ck_ai_authoring_proposals_bundle_hash_sha256", "ai_authoring_proposals", type_="check")
    op.drop_constraint("ck_ai_authoring_proposals_bundle_schema_version_positive", "ai_authoring_proposals", type_="check")
    op.drop_constraint("ck_ai_authoring_proposals_action_schema_version_positive", "ai_authoring_proposals", type_="check")
    op.create_check_constraint("ck_ai_authoring_proposals_action_schema_version_positive", "ai_authoring_proposals", "action_schema_version > 0")
    op.drop_constraint("ck_ai_authoring_proposals_result_kind_consistent", "ai_authoring_proposals", type_="check")
    op.drop_constraint("admin_ai_result_kind", "ai_authoring_proposals", type_="check")
    op.drop_constraint("ai_authoring_proposal_kind", "ai_authoring_proposals", type_="check")
    op.alter_column("ai_authoring_proposals", "actions", nullable=False)
    op.alter_column("ai_authoring_proposals", "action_schema_version", nullable=False)
    op.drop_column("ai_authoring_proposals", "capability_bundle_hash")
    op.drop_column("ai_authoring_proposals", "capability_bundle")
    op.drop_column("ai_authoring_proposals", "capability_bundle_schema_version")
    op.drop_column("ai_authoring_proposals", "result_kind")
    op.drop_column("ai_authoring_proposals", "proposal_kind")

"""Add optional generic document visual placement; existing blocks remain unchanged."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "a8c0e2f4b619"
down_revision = "f1c3e5a7b902"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("content_blocks", sa.Column("visual_placement", postgresql.JSONB(none_as_null=True), nullable=True))
    op.create_check_constraint(
        "ck_content_blocks_visual_placement_object", "content_blocks",
        "visual_placement IS NULL OR jsonb_typeof(visual_placement) = 'object'",
    )


def downgrade() -> None:
    op.drop_constraint("ck_content_blocks_visual_placement_object", "content_blocks", type_="check")
    op.drop_column("content_blocks", "visual_placement")

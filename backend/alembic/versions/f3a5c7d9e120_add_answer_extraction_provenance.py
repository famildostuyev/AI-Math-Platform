"""Add explicit extraction provenance to canonical answer options."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "f3a5c7d9e120"
down_revision = "e1f3a5c7d908"
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.add_column("answer_options", sa.Column("source_extraction_result_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("answer_options", sa.Column("source_extraction_question_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("answer_options", sa.Column("source_option_index", sa.Integer(), nullable=True))
    op.add_column("answer_options", sa.Column("source_provenance", postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.create_foreign_key("fk_answer_options_extraction_result", "answer_options", "question_extraction_results", ["source_extraction_result_id"], ["id"], ondelete="RESTRICT")
    op.create_check_constraint("ck_answer_options_source_option_index_positive", "answer_options", "source_option_index IS NULL OR source_option_index > 0")
    op.create_check_constraint("ck_answer_options_extraction_identity_complete", "answer_options", "(source_extraction_result_id IS NULL AND source_extraction_question_id IS NULL AND source_option_index IS NULL) OR (source_extraction_result_id IS NOT NULL AND source_extraction_question_id IS NOT NULL AND source_option_index IS NOT NULL)")
    op.create_index("ix_answer_options_source_extraction_result_id", "answer_options", ["source_extraction_result_id"])
    op.create_index("uq_answer_options_extraction_mapping", "answer_options", ["revision_id", "source_extraction_result_id", "source_extraction_question_id", "source_option_index"], unique=True, postgresql_where=sa.text("deleted_at IS NULL AND source_extraction_result_id IS NOT NULL"))

def downgrade() -> None:
    op.drop_index("uq_answer_options_extraction_mapping", table_name="answer_options")
    op.drop_index("ix_answer_options_source_extraction_result_id", table_name="answer_options")
    op.drop_constraint("ck_answer_options_extraction_identity_complete", "answer_options", type_="check")
    op.drop_constraint("ck_answer_options_source_option_index_positive", "answer_options", type_="check")
    op.drop_constraint("fk_answer_options_extraction_result", "answer_options", type_="foreignkey")
    op.drop_column("answer_options", "source_provenance")
    op.drop_column("answer_options", "source_option_index")
    op.drop_column("answer_options", "source_extraction_question_id")
    op.drop_column("answer_options", "source_extraction_result_id")

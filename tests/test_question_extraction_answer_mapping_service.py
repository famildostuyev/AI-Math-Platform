from __future__ import annotations
import os, sys, unittest, uuid
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

os.environ["DATABASE_URL"]="postgresql+psycopg2://unused:unused@127.0.0.1:1/unused"; os.environ["APP_ENV"]="testing"; os.environ["DEBUG"]="false"
os.environ["JWT_SECRET_KEY"]="test-jwt-secret-key-00000000000001"; os.environ["REFRESH_TOKEN_HASH_KEY"]="test-refresh-token-hash-key-000001"; os.environ["VERIFICATION_CODE_HASH_KEY"]="test-verification-code-hash-key-01"
sys.path.insert(0, str(Path(__file__).resolve().parents[1]/"backend"))

from app.core.enums import QuestionRevisionStatus
from app.models.answer_option import AnswerOption
from app.models.question_extraction_result import QuestionExtractionResult
from app.models.question_revision import QuestionRevision
from app.schemas.question_editor import QuestionRevisionEditorRead
from app.services.question_extraction_answer_mapping_service import (
    QuestionExtractionAnswerMappingService, ExtractionMappingExistingAnswersConflictError,
    ExtractionMappingInvalidPayloadError, ExtractionMappingPolicyError,
    ExtractionMappingRevisionConflictError,
)

NOW=datetime(2026,8,25,12,0,tzinfo=timezone.utc)
def scalar_result(values): result=MagicMock(); result.all.return_value=values; return result

def question(question_id=None, sequence=1, option_count=4):
    labels=["a","B","C","D"][:option_count]
    options=[]
    for index,label in enumerate(labels):
        item={"label":label,"text":f"Option {index+1}"}
        if index==0: item["content"]={"format_version":1,"segments":[{"type":"text","text":"Value "},{"type":"math","latex":r"\frac{1}{2}","source_text":"1/2","display_mode":False}]}
        options.append(item)
    return {"id":str(question_id or uuid.uuid4()),"sequence_number":sequence,"question_number":f"Variant C / {sequence}","variant":"Variant C","source_pages":[{"source_document_page_id":str(uuid.uuid4()),"page_number":1}],"question_text":"Question","answer_options":options,"confidence":"0.99","needs_review":False,"corrections":[],"visual_required":False}

def analysis(questions):
    return {"detected_language":"az","total_questions":len(questions),"blocks":[],"needs_review_count":0,"corrections_count":0,"visual_required_count":0,"multi_page_question_count":0,"questions":questions}

class ExtractionAnswerMappingTest(unittest.TestCase):
    def setup_case(self, *, type_name="multiple_choice", data=None):
        revision=QuestionRevision(id=uuid.uuid4(),status=QuestionRevisionStatus.DRAFT,updated_at=NOW)
        revision.question_form=SimpleNamespace(question_type=SimpleNamespace(name=type_name))
        result=QuestionExtractionResult(id=uuid.uuid4(),question_extraction_run_id=uuid.uuid4(),schema_version=1,processor_name="document-analysis",processor_version="1",processing_version="1",analysis_data=data or analysis([question()]))
        db=MagicMock(); db.scalar.side_effect=[revision,result]; db.scalars.side_effect=[scalar_result([]),scalar_result([])]
        return db,revision,result

    def map(self,db,revision,result,question_id):
        return QuestionExtractionAnswerMappingService(db).map_options_to_revision(extraction_result_id=result.id,extraction_question_id=question_id,target_revision_id=revision.id,expected_revision_updated_at=revision.updated_at)

    def test_four_options_preserve_label_order_content_and_never_infer_correctness(self):
        q=question(); db,revision,result=self.setup_case(data=analysis([q])); mapped=self.map(db,revision,result,uuid.UUID(q["id"]))
        self.assertEqual([item.label for item in mapped],["a","B","C","D"])
        self.assertEqual([item.order_index for item in mapped],[1000,2000,3000,4000])
        self.assertTrue(all(not item.is_correct for item in mapped))
        self.assertEqual(mapped[0].document.content[0].content[1].latex,r"\frac{1}{2}")
        self.assertEqual(mapped[1].source_text,"Option 2")
        self.assertNotEqual(revision.updated_at,NOW); db.commit.assert_called_once()

    def test_explicit_identity_is_deterministic_and_provenance_is_preserved(self):
        q=question(); db,revision,result=self.setup_case(data=analysis([q])); self.map(db,revision,result,uuid.UUID(q["id"]))
        created=[call.args[0] for call in db.add.call_args_list]
        self.assertEqual(len({item.id for item in created}),4)
        self.assertEqual(created[0].source_provenance["original_label"],"a")
        self.assertEqual(created[0].source_provenance["source_pages"][0]["page_number"],1)

    def test_second_mapping_returns_existing_without_duplicates(self):
        q=question(); db,revision,result=self.setup_case(data=analysis([q])); first=self.map(db,revision,result,uuid.UUID(q["id"]))
        created=[call.args[0] for call in db.add.call_args_list]; db.reset_mock(); db.scalar.side_effect=[revision,result]; db.scalars.side_effect=[scalar_result(created)]
        second=self.map(db,revision,result,uuid.UUID(q["id"]))
        self.assertEqual([item.id for item in first],[item.id for item in second]); db.add.assert_not_called(); db.commit.assert_not_called()

    def test_existing_manual_options_conflict(self):
        q=question(); db,revision,result=self.setup_case(data=analysis([q])); manual=AnswerOption(id=uuid.uuid4(),revision_id=revision.id,label="A",order_index=1000,source_text="Manual",document_data={"type":"document","content":[]},format_version=1,is_correct=False)
        db.scalars.side_effect=[scalar_result([]),scalar_result([manual])]
        with self.assertRaises(ExtractionMappingExistingAnswersConflictError): self.map(db,revision,result,uuid.UUID(q["id"]))
        db.rollback.assert_called_once(); db.add.assert_not_called()

    def test_wrong_policy_and_stale_timestamp_reject(self):
        q=question(); db,revision,result=self.setup_case(type_name="open_response",data=analysis([q]))
        with self.assertRaises(ExtractionMappingPolicyError): self.map(db,revision,result,uuid.UUID(q["id"]))
        db,revision,result=self.setup_case(data=analysis([q])); revision.updated_at=NOW.replace(second=1)
        with self.assertRaises(ExtractionMappingRevisionConflictError): QuestionExtractionAnswerMappingService(db).map_options_to_revision(extraction_result_id=result.id,extraction_question_id=uuid.UUID(q["id"]),target_revision_id=revision.id,expected_revision_updated_at=NOW)

    def test_invalid_option_rolls_back_before_partial_creation(self):
        q=question(); q["answer_options"][2]["text"]=""; db,revision,result=self.setup_case(data=analysis([q]))
        with self.assertRaises(ExtractionMappingInvalidPayloadError): self.map(db,revision,result,uuid.UUID(q["id"]))
        db.add.assert_not_called(); db.commit.assert_not_called(); db.rollback.assert_called_once()

    def test_mapping_output_is_editor_projection_compatible(self):
        q=question(); db,revision,result=self.setup_case(data=analysis([q])); mapped=self.map(db,revision,result,uuid.UUID(q["id"]))
        read=QuestionRevisionEditorRead.model_validate({"question_family_id":uuid.uuid4(),"question_form_id":uuid.uuid4(),"revision_id":revision.id,"revision_number":1,"status":"draft","question_type_id":uuid.uuid4(),"source_id":None,"source_detail":None,"source_display_name":None,"primary_topic_id":None,"related_topic_ids":[],"purpose_ids":[],"difficulty":None,"updated_at":revision.updated_at,"blocks":[],"answer_policy":"option_single","answer_options":[item.model_dump() for item in mapped],"accepted_answers":[]})
        self.assertEqual(len(read.answer_options),4)

    def test_run14_shape_24_questions_90_content_none_options_validates(self):
        questions=[question(sequence=i+1,option_count=4 if i<18 else 3) for i in range(24)]
        for item in questions:
            for option in item["answer_options"]: option.pop("content",None)
        db,revision,result=self.setup_case(data=analysis(questions)); target=questions[0]
        mapped=self.map(db,revision,result,uuid.UUID(target["id"]))
        self.assertEqual(sum(len(item["answer_options"]) for item in questions),90); self.assertEqual(len(mapped),4)

if __name__=="__main__": unittest.main()

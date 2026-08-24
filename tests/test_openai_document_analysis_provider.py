from __future__ import annotations

import os
import sys
import unittest
import uuid
import base64
import json
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import httpx
from openai import APIConnectionError, APIError, APITimeoutError, RateLimitError
from openai.lib._parsing._responses import type_to_text_format_param
from pydantic import ValidationError


BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))
os.environ["DEBUG"] = "false"

from app.core.config import Settings, settings
from app.services.document_analysis_provider import (
    DocumentAnalysis,
    DocumentAnalysisPageReference,
    DocumentAnalysisPageVisual,
    DocumentAnalysisProvider,
    DocumentAnalysisProviderAPIError,
    DocumentAnalysisProviderError,
    DocumentAnalysisProviderInvalidResponseError,
    DocumentAnalysisProviderNetworkError,
    DocumentAnalysisProviderRateLimitError,
    DocumentAnalysisProviderTimeoutError,
)
from app.services.openai_document_analysis_provider import (
    DOCUMENT_ANALYSIS_INSTRUCTIONS,
    OPENAI_PROVIDER_NAME,
    OpenAIDocumentAnalysisProvider,
    _OpenAIAnswerOption,
    _OpenAICorrection,
    _OpenAIDocumentAnalysis,
    _OpenAIMathSegment,
    _OpenAIPageReference,
    _OpenAIQuestion,
    _OpenAIStructuredContent,
    _OpenAITextSegment,
    build_document_analysis_request,
)
from app.services.raw_document import RawDocument, RawDocumentPage


class FakeResponses:
    def __init__(self, output_parsed: object = None) -> None:
        self.output_parsed = output_parsed
        self.calls: list[dict[str, object]] = []
        self.error: Exception | None = None

    def parse(self, **kwargs: object) -> object:
        self.calls.append(kwargs)
        if self.error is not None:
            raise self.error
        return SimpleNamespace(output_parsed=self.output_parsed)


class FakeClient:
    def __init__(self, output_parsed: object = None) -> None:
        self.responses = FakeResponses(output_parsed)


class SafeStatusError(Exception):
    status_code = 422


class OpenAIDocumentAnalysisProviderTest(unittest.TestCase):
    def setUp(self) -> None:
        self.document_id = uuid.uuid4()
        self.page_id = uuid.uuid4()
        self.raw_document = RawDocument(
            source_document_id=self.document_id,
            pages=(
                RawDocumentPage(
                    source_document_page_id=self.page_id,
                    page_number=1,
                    raw_text="1. Find x.",
                    visual_content=DocumentAnalysisPageVisual(
                        mime_type="image/png", content=b"image-bytes",
                    ),
                    extraction_method="pdf_text_layer",
                    extraction_version="1",
                ),
            ),
        )
        self.request = build_document_analysis_request(self.raw_document)

    def _parsed(self, **overrides: object) -> _OpenAIDocumentAnalysis:
        values: dict[str, object] = {
            "detected_language": "az",
            "questions": [
                _OpenAIQuestion(
                    question_number="1",
                    question_text="Find x.",
                    answer_options=[
                        _OpenAIAnswerOption(label="A", text="2"),
                    ],
                    source_pages=[
                        _OpenAIPageReference(
                            source_document_page_id=str(self.page_id),
                            page_number=1,
                        ),
                    ],
                    visual_required=True,
                    confidence=Decimal("0.9"),
                    needs_review=False,
                    corrections=[
                        _OpenAICorrection(
                            original_value="l",
                            normalized_value="1",
                            reason="Visual OCR correction",
                        ),
                    ],
                )
            ],
        }
        values.update(overrides)
        return _OpenAIDocumentAnalysis.model_validate(values)

    @staticmethod
    def _provider(
        client: FakeClient,
        **kwargs: object,
    ) -> OpenAIDocumentAnalysisProvider:
        return OpenAIDocumentAnalysisProvider(client=client, **kwargs)

    def test_valid_request_maps_to_responses_multimodal_input(self) -> None:
        client = FakeClient(self._parsed())
        self._provider(client).analyze_document(self.request)

        call = client.responses.calls[0]
        self.assertEqual(call["model"], settings.OPENAI_DOCUMENT_ANALYSIS_MODEL)
        self.assertEqual(call["text_format"], _OpenAIDocumentAnalysis)
        self.assertFalse(call["store"])
        content = call["input"][0]["content"]  # type: ignore[index]
        self.assertEqual([item["type"] for item in content], [
            "input_text", "input_image",
        ])
        self.assertIn(str(self.page_id), content[0]["text"])
        self.assertTrue(content[1]["image_url"].startswith("data:image/png;base64,"))

    def test_text_only_and_multimodal_requests_differ_only_by_one_visual(self) -> None:
        text_only_document = RawDocument(
            source_document_id=self.raw_document.source_document_id,
            pages=(
                self.raw_document.pages[0].model_copy(
                    update={"visual_content": None}
                ),
            ),
        )
        text_only_request = build_document_analysis_request(text_only_document)
        multimodal_request = build_document_analysis_request(self.raw_document)
        text_only_client = FakeClient(self._parsed())
        multimodal_client = FakeClient(self._parsed())

        self._provider(text_only_client).analyze_document(text_only_request)
        self._provider(multimodal_client).analyze_document(multimodal_request)

        text_only_call = text_only_client.responses.calls[0]
        multimodal_call = multimodal_client.responses.calls[0]
        text_only_content = text_only_call["input"][0]["content"]  # type: ignore[index]
        multimodal_content = multimodal_call["input"][0]["content"]  # type: ignore[index]
        self.assertEqual(
            [item["type"] for item in text_only_content],
            ["input_text"],
        )
        self.assertEqual(
            [item["type"] for item in multimodal_content],
            ["input_text", "input_image"],
        )
        self.assertEqual(text_only_content[0], multimodal_content[0])
        self.assertEqual(text_only_request.pages[0].source_document_page_id,
                         multimodal_request.pages[0].source_document_page_id)
        self.assertEqual(text_only_request.pages[0].page_number,
                         multimodal_request.pages[0].page_number)
        self.assertEqual(text_only_request.prompt_version,
                         multimodal_request.prompt_version)
        self.assertEqual(text_only_request.processing_version,
                         multimodal_request.processing_version)
        self.assertEqual(text_only_request.schema_version,
                         multimodal_request.schema_version)

        image_items = [
            item for item in multimodal_content if item["type"] == "input_image"
        ]
        self.assertEqual(len(image_items), 1)
        self.assertEqual(image_items[0]["detail"], "high")
        prefix = "data:image/png;base64,"
        image_url = image_items[0]["image_url"]
        self.assertTrue(image_url.startswith(prefix))
        encoded = image_url.removeprefix(prefix)
        self.assertEqual(base64.b64decode(encoded), b"image-bytes")
        self.assertEqual(encoded, base64.b64encode(b"image-bytes").decode("ascii"))

        for key in (
            "model", "instructions", "text_format", "timeout", "store",
        ):
            self.assertEqual(text_only_call[key], multimodal_call[key])
        self.assertEqual(multimodal_call["timeout"], 180.0)

    def test_provider_name_is_openai(self) -> None:
        result = self._provider(FakeClient(self._parsed())).analyze_document(
            self.request
        )
        self.assertEqual(result.provenance.provider_name, OPENAI_PROVIDER_NAME)
        self.assertEqual(OPENAI_PROVIDER_NAME, "openai")

    def test_model_comes_from_injected_configuration(self) -> None:
        client = FakeClient(self._parsed())
        result = self._provider(client, model="configured-model").analyze_document(
            self.request
        )
        self.assertEqual(client.responses.calls[0]["model"], "configured-model")
        self.assertEqual(result.provenance.model_name, "configured-model")

    def test_document_analysis_timeout_default_and_environment_override(self) -> None:
        self.assertEqual(
            Settings.model_fields[
                "OPENAI_DOCUMENT_ANALYSIS_TIMEOUT_SECONDS"
            ].default,
            180.0,
        )
        with patch.dict(
            os.environ,
            {"OPENAI_DOCUMENT_ANALYSIS_TIMEOUT_SECONDS": "45.5"},
        ):
            self.assertEqual(
                Settings().OPENAI_DOCUMENT_ANALYSIS_TIMEOUT_SECONDS,
                45.5,
            )

    def test_real_client_configuration_disables_retries(self) -> None:
        fake_client = FakeClient(self._parsed())
        with patch(
            "app.services.openai_document_analysis_provider.OpenAI",
            return_value=fake_client,
        ) as openai_constructor:
            provider = OpenAIDocumentAnalysisProvider(
                api_key="test-key",
                timeout_seconds=120.0,
            )

        openai_constructor.assert_called_once_with(
            api_key="test-key",
            timeout=120.0,
            max_retries=0,
        )
        provider.analyze_document(self.request)
        self.assertEqual(
            fake_client.responses.calls[0]["timeout"],
            120.0,
        )

    def test_prompt_processing_and_schema_versions_fill_provenance(self) -> None:
        result = self._provider(FakeClient(self._parsed())).analyze_document(
            self.request
        )
        self.assertEqual(result.provenance.prompt_version, "question-analysis-v3")
        self.assertEqual(result.provenance.processor_version, "1")
        self.assertEqual(result.provenance.schema_version, 1)
        self.assertEqual(result.schema_version, 1)

    def test_production_instruction_contract_is_complete_and_canonical(self) -> None:
        for required in (
            "every separate question",
            "Do not omit questions",
            "Variant C",
            "Variant D",
            "question_number",
            "source order",
            "page visual",
            "OCR",
            "visual_required=true",
            "correction",
            "needs_review=true",
            "assign A, B, C, and D",
            "matching structures",
        ):
            with self.subTest(required=required):
                self.assertIn(required, DOCUMENT_ANALYSIS_INSTRUCTIONS)

    def test_instructions_request_math_only_structured_content(self) -> None:
        for required in (
            "only for question text",
            "ordinary prose-only question",
            "content=null",
            "fractions",
            "roots",
            "powers",
            "subscripts",
            "Greek letters",
            "angles",
            "equations",
            "ordered text/math segments",
            "valid",
            "LaTeX and source_text",
            "Return answer options as label and plain text only",
            "do not segment answer option text",
            "Always keep question_text and",
        ):
            with self.subTest(required=required):
                self.assertIn(required, DOCUMENT_ANALYSIS_INSTRUCTIONS)

    def test_instructions_require_corrections_for_every_question(self) -> None:
        for required in (
            "Every question object must include the corrections field",
            "corrections=[]",
            "structured",
            "correction objects",
            "Never omit corrections",
            "never return corrections=null",
        ):
            with self.subTest(required=required):
                self.assertIn(required, DOCUMENT_ANALYSIS_INSTRUCTIONS)

    def test_canonical_instructions_are_sent_unchanged(self) -> None:
        client = FakeClient(self._parsed())
        self._provider(client).analyze_document(self.request)
        self.assertEqual(
            client.responses.calls[0]["instructions"],
            DOCUMENT_ANALYSIS_INSTRUCTIONS,
        )

    def test_structured_response_maps_to_document_analysis(self) -> None:
        result = self._provider(FakeClient(self._parsed())).analyze_document(
            self.request
        )
        self.assertIsInstance(result, DocumentAnalysis)
        self.assertEqual(result.questions[0].question_text, "Find x.")
        self.assertEqual(result.questions[0].source_pages[0].page_number, 1)
        self.assertEqual(result.questions[0].confidence, Decimal("0.9"))

    def test_structured_math_content_maps_with_order_and_legacy_fallbacks(self) -> None:
        parsed = self._parsed()
        parsed.questions[0].content = _OpenAIStructuredContent(
            format_version=1,
            segments=[
                _OpenAITextSegment(type="text", text="Simplify: "),
                _OpenAIMathSegment(
                    type="math",
                    latex=r"\frac{\sin\alpha + 2\cos\alpha}{\cos\alpha}",
                    source_text="(sin alpha + 2 cos alpha) / cos alpha",
                    display_mode=False,
                ),
                _OpenAITextSegment(type="text", text=" then choose."),
            ],
        )

        result = self._provider(FakeClient(parsed)).analyze_document(self.request)
        question = result.questions[0]

        self.assertEqual(question.question_text, "Find x.")
        self.assertEqual(
            [segment.type for segment in question.content.segments],
            ["text", "math", "text"],
        )
        self.assertEqual(
            question.content.segments[1].latex,
            r"\frac{\sin\alpha + 2\cos\alpha}{\cos\alpha}",
        )
        self.assertEqual(
            question.content.segments[1].source_text,
            "(sin alpha + 2 cos alpha) / cos alpha",
        )
        self.assertEqual(question.answer_options[0].label, "A")
        self.assertEqual(question.answer_options[0].text, "2")
        self.assertIsNone(question.answer_options[0].content)

    def test_legacy_structured_response_maps_missing_content_to_none(self) -> None:
        result = self._provider(FakeClient(self._parsed())).analyze_document(
            self.request
        )

        self.assertIsNone(result.questions[0].content)
        self.assertIsNone(result.questions[0].answer_options[0].content)

    def test_sdk_strict_schema_uses_supported_ordered_segment_union(self) -> None:
        schema = type_to_text_format_param(_OpenAIDocumentAnalysis)["schema"]
        definitions = schema["$defs"]
        content_schema = definitions["_OpenAIStructuredContent"]
        option_schema = definitions["_OpenAIAnswerOption"]
        segment_items = content_schema["properties"]["segments"]["items"]
        serialized = json.dumps(schema, sort_keys=True)

        self.assertIn("anyOf", segment_items)
        self.assertNotIn("oneOf", serialized)
        self.assertNotIn("discriminator", serialized)
        self.assertNotIn("default", serialized)
        self.assertNotIn("content", option_schema["properties"])
        self.assertNotIn("content", option_schema["required"])
        question_schema = definitions["_OpenAIQuestion"]
        self.assertIn("corrections", question_schema["required"])
        self.assertNotIn(
            "default",
            question_schema["properties"]["corrections"],
        )
        self.assertEqual(
            set(definitions["_OpenAITextSegment"]["required"]),
            {"type", "text"},
        )
        self.assertEqual(
            set(definitions["_OpenAIMathSegment"]["required"]),
            {"type", "latex", "source_text", "display_mode"},
        )
        self.assertEqual(
            set(content_schema["required"]),
            {"format_version", "segments"},
        )
        for model_name in (
            "_OpenAITextSegment",
            "_OpenAIMathSegment",
            "_OpenAIStructuredContent",
        ):
            self.assertIs(
                definitions[model_name]["additionalProperties"],
                False,
            )

    def test_corrections_collection_is_required_non_null_and_mappable(self) -> None:
        empty = self._parsed()
        empty.questions[0].corrections = []
        self.assertEqual(empty.questions[0].corrections, [])
        empty_result = self._provider(FakeClient(empty)).analyze_document(
            self.request
        )
        self.assertEqual(empty_result.questions[0].corrections, ())

        populated = self._parsed()
        self.assertEqual(len(populated.questions[0].corrections), 1)
        populated_result = self._provider(FakeClient(populated)).analyze_document(
            self.request
        )
        self.assertEqual(len(populated_result.questions[0].corrections), 1)

        for invalid_corrections in (None, "missing"):
            payload = self._parsed().model_dump(mode="json")
            if invalid_corrections == "missing":
                del payload["questions"][0]["corrections"]
            else:
                payload["questions"][0]["corrections"] = None
            with self.subTest(corrections=invalid_corrections), self.assertRaises(
                ValidationError
            ):
                _OpenAIDocumentAnalysis.model_validate(payload)

    def test_invalid_structured_response_raises_typed_error(self) -> None:
        parsed = self._parsed()
        parsed.questions[0].source_pages[0].source_document_page_id = str(
            uuid.uuid4()
        )
        with self.assertRaises(DocumentAnalysisProviderInvalidResponseError):
            self._provider(FakeClient(parsed)).analyze_document(self.request)

    def test_timeout_maps_to_provider_neutral_timeout(self) -> None:
        client = FakeClient()
        client.responses.error = APITimeoutError(
            request=httpx.Request("POST", "https://api.openai.com/v1/responses")
        )
        with self.assertRaises(DocumentAnalysisProviderTimeoutError):
            self._provider(client).analyze_document(self.request)

    def test_rate_limit_maps_to_provider_neutral_rate_limit(self) -> None:
        client = FakeClient()
        request = httpx.Request("POST", "https://api.openai.com/v1/responses")
        client.responses.error = RateLimitError(
            "rate limited",
            response=httpx.Response(429, request=request),
            body=None,
        )
        with self.assertRaises(DocumentAnalysisProviderRateLimitError):
            self._provider(client).analyze_document(self.request)

    def test_network_and_generic_errors_are_provider_neutral(self) -> None:
        errors = (
            APIConnectionError(
                request=httpx.Request(
                    "POST", "https://api.openai.com/v1/responses"
                )
            ),
            RuntimeError("private provider failure"),
        )
        for error in errors:
            with self.subTest(error=type(error).__name__):
                client = FakeClient()
                client.responses.error = error
                with self.assertRaises(DocumentAnalysisProviderError) as captured:
                    self._provider(client).analyze_document(self.request)
                self.assertNotIn("private provider failure", str(captured.exception))

    def test_unknown_failure_logs_only_allowlisted_metadata(self) -> None:
        secrets = (
            "api-key-like-secret",
            "private raw source content",
        )
        cases = (
            (RuntimeError(secrets[0]), "RuntimeError", "unknown"),
            (SafeStatusError(secrets[1]), "SafeStatusError", "422"),
        )
        for error, exception_type, status_code in cases:
            with self.subTest(exception_type=exception_type):
                client = FakeClient()
                client.responses.error = error
                with self.assertLogs(
                    "app.services.openai_document_analysis_provider",
                    level="WARNING",
                ) as captured, self.assertRaises(
                    DocumentAnalysisProviderError
                ):
                    self._provider(client).analyze_document(self.request)

                output = " ".join(captured.output)
                self.assertIn("provider=openai", output)
                self.assertIn("category=unknown_provider_error", output)
                self.assertIn(f"exception_type={exception_type}", output)
                self.assertIn(f"status_code={status_code}", output)
                self.assertIn("retry_count=unknown", output)
                for secret in secrets:
                    self.assertNotIn(secret, output)

    def test_managed_client_unknown_failure_logs_zero_retries(self) -> None:
        fake_client = FakeClient()
        fake_client.responses.error = RuntimeError("credential-secret")
        with patch(
            "app.services.openai_document_analysis_provider.OpenAI",
            return_value=fake_client,
        ):
            provider = OpenAIDocumentAnalysisProvider(api_key="test-key")

        with self.assertLogs(
            "app.services.openai_document_analysis_provider",
            level="WARNING",
        ) as captured, self.assertRaises(DocumentAnalysisProviderError):
            provider.analyze_document(self.request)
        output = " ".join(captured.output)
        self.assertIn("exception_type=RuntimeError", output)
        self.assertIn("status_code=unknown", output)
        self.assertIn("retry_count=0", output)
        self.assertNotIn("credential-secret", output)

    def test_network_and_api_failures_have_safe_categories(self) -> None:
        request = httpx.Request("POST", "https://api.openai.com/v1/responses")
        cases = (
            (
                APIConnectionError(message="source-secret", request=request),
                DocumentAnalysisProviderNetworkError,
                "provider_network_error",
            ),
            (
                APIError("response-secret", request, body={"secret": "body"}),
                DocumentAnalysisProviderAPIError,
                "provider_api_error",
            ),
        )
        for error, expected_type, category in cases:
            with self.subTest(category=category):
                client = FakeClient()
                client.responses.error = error
                with self.assertLogs(
                    "app.services.openai_document_analysis_provider",
                    level="WARNING",
                ) as captured, self.assertRaises(expected_type) as raised:
                    self._provider(client).analyze_document(self.request)
                log_output = " ".join(captured.output)
                self.assertIn(f"category={category}", log_output)
                self.assertIn("provider=openai", log_output)
                self.assertNotIn("source-secret", log_output)
                self.assertNotIn("response-secret", log_output)
                self.assertNotIn("secret", repr(raised.exception))

    def test_timeout_rate_limit_and_invalid_response_logs_are_safe(self) -> None:
        request = httpx.Request("POST", "https://api.openai.com/v1/responses")
        cases = (
            (
                APITimeoutError(request=request),
                "timeout",
            ),
            (
                RateLimitError(
                    "response-body-secret",
                    response=httpx.Response(429, request=request),
                    body={"secret": "body"},
                ),
                "rate_limit",
            ),
        )
        for error, category in cases:
            with self.subTest(category=category):
                client = FakeClient()
                client.responses.error = error
                with self.assertLogs(
                    "app.services.openai_document_analysis_provider",
                    level="WARNING",
                ) as captured, self.assertRaises(DocumentAnalysisProviderError):
                    self._provider(client).analyze_document(self.request)
                output = " ".join(captured.output)
                self.assertIn(f"category={category}", output)
                self.assertNotIn("secret", output)

        with self.assertLogs(
            "app.services.openai_document_analysis_provider",
            level="WARNING",
        ) as captured, self.assertRaises(
            DocumentAnalysisProviderInvalidResponseError
        ):
            self._provider(FakeClient(None)).analyze_document(self.request)
        self.assertIn("category=invalid_response", " ".join(captured.output))

    def test_parse_validation_errors_log_only_bounded_paths_and_types(self) -> None:
        cases = (
            (
                {"format_version": 1, "segments": [{
                    "type": "math", "latex": "secret-latex",
                    "source_text": "private-source-text",
                }]},
                "display_mode",
                "missing",
            ),
            (
                {"segments": [{"type": "text", "text": "private-question"}]},
                "format_version",
                "missing",
            ),
            (
                {"format_version": 1, "segments": [{
                    "type": "formula", "latex": "x", "source_text": "x",
                    "display_mode": False,
                }]},
                "type",
                "literal_error",
            ),
            (
                {"format_version": 1, "segments": []},
                "segments",
                "too_short",
            ),
            (
                {"format_version": 1, "segments": [{
                    "type": "text", "text": "source-secret",
                    "unexpected": "api-key-like-secret",
                }]},
                "unexpected",
                "extra_forbidden",
            ),
        )
        for content, expected_path, expected_type in cases:
            with self.subTest(expected_type=expected_type):
                payload = self._parsed().model_dump(mode="json")
                payload["questions"][0]["content"] = content
                with self.assertRaises(ValidationError) as invalid:
                    _OpenAIDocumentAnalysis.model_validate(payload)
                client = FakeClient()
                client.responses.error = invalid.exception

                with self.assertLogs(
                    "app.services.openai_document_analysis_provider",
                    level="WARNING",
                ) as captured, self.assertRaises(
                    DocumentAnalysisProviderInvalidResponseError
                ):
                    self._provider(client).analyze_document(self.request)

                output = " ".join(captured.output)
                self.assertIn("category=invalid_response", output)
                self.assertIn("exception_type=ValidationError", output)
                self.assertIn("validation_error_count=", output)
                self.assertIn(expected_path, output)
                self.assertIn(expected_type, output)
                for secret in (
                    "secret-latex",
                    "private-source-text",
                    "private-question",
                    "source-secret",
                    "api-key-like-secret",
                ):
                    self.assertNotIn(secret, output)

    def test_validation_error_log_count_and_paths_are_bounded(self) -> None:
        payload = self._parsed().model_dump(mode="json")
        question = payload["questions"][0]
        question["content"] = {
            "segments": [{"type": "text", "text": "secret-value"}],
        }
        payload["questions"] = [
            json.loads(json.dumps(question)) for _ in range(8)
        ]
        with self.assertRaises(ValidationError) as invalid:
            _OpenAIDocumentAnalysis.model_validate(payload)
        client = FakeClient()
        client.responses.error = invalid.exception

        with self.assertLogs(
            "app.services.openai_document_analysis_provider",
            level="WARNING",
        ) as captured, self.assertRaises(
            DocumentAnalysisProviderInvalidResponseError
        ):
            self._provider(client).analyze_document(self.request)

        output = " ".join(captured.output)
        self.assertIn("validation_error_count=8", output)
        paths = output.split("validation_paths=", 1)[1].split(" ", 1)[0]
        self.assertEqual(len(paths.split(",")), 5)
        self.assertTrue(all(len(path) <= 160 for path in paths.split(",")))
        self.assertNotIn("secret-value", output)

    def test_mapping_validation_error_uses_safe_metadata(self) -> None:
        parsed = self._parsed()
        parsed.questions[0].content = _OpenAIStructuredContent(
            format_version=1,
            segments=[
                _OpenAITextSegment(
                    type="text",
                    text="private question/source content   ",
                ),
                _OpenAIMathSegment(
                    type="math",
                    latex=" ",
                    source_text="secret-source-text",
                    display_mode=False,
                ),
            ],
        )

        with self.assertLogs(
            "app.services.openai_document_analysis_provider",
            level="WARNING",
        ) as captured, self.assertRaises(
            DocumentAnalysisProviderInvalidResponseError
        ):
            self._provider(FakeClient(parsed)).analyze_document(self.request)

        output = " ".join(captured.output)
        self.assertIn("category=invalid_response", output)
        self.assertIn("exception_type=ValidationError", output)
        self.assertIn("validation_error_count=1", output)
        self.assertIn("validation_paths=latex", output)
        self.assertIn("validation_types=value_error", output)
        self.assertNotIn("private question/source content", output)
        self.assertNotIn("secret-source-text", output)

    def test_openai_objects_do_not_leak_into_domain_result(self) -> None:
        result = self._provider(FakeClient(self._parsed())).analyze_document(
            self.request
        )
        self.assertEqual(
            type(result).__module__, "app.services.document_analysis_provider"
        )
        self.assertTrue(all(
            type(question).__module__
            == "app.services.document_analysis_provider"
            for question in result.questions
        ))

    def test_api_key_is_not_stored_in_request_result_or_adapter(self) -> None:
        secret = "secret-api-key-value"
        client = FakeClient(self._parsed())
        provider = self._provider(client, api_key=secret)
        result = provider.analyze_document(self.request)
        self.assertNotIn(secret, repr(self.request))
        self.assertNotIn(secret, repr(result))
        self.assertNotIn(secret, repr(provider.__dict__))
        self.assertNotIn(secret, repr(client.responses.calls))

    def test_empty_model_response_is_safely_rejected(self) -> None:
        for output in (None, "", {}, SimpleNamespace()):
            with self.subTest(output=output), self.assertRaises(
                DocumentAnalysisProviderInvalidResponseError
            ):
                self._provider(FakeClient(output)).analyze_document(self.request)

    def test_provider_implements_document_analysis_protocol(self) -> None:
        provider = self._provider(FakeClient(self._parsed()))
        self.assertIsInstance(provider, DocumentAnalysisProvider)

    def test_tests_use_injected_fake_and_never_construct_real_client(self) -> None:
        client = FakeClient(self._parsed())
        provider = self._provider(client, api_key=None)
        provider.analyze_document(self.request)
        self.assertEqual(len(client.responses.calls), 1)


if __name__ == "__main__":
    unittest.main()

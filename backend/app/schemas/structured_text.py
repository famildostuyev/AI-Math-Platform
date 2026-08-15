from __future__ import annotations

from enum import StrEnum
from typing import Annotated, Literal, Union

from pydantic import BaseModel, ConfigDict, Field, model_validator


STRUCTURED_TEXT_FORMAT_VERSION = 1


class StrictSchema(BaseModel):
    """Base contract for platform-owned structured-text data."""

    model_config = ConfigDict(extra="forbid")


class FontFamilyToken(StrEnum):
    DEFAULT = "default"
    SERIF = "serif"
    SANS = "sans"
    MATH_COMPATIBLE = "math-compatible"


class FontSizeToken(StrEnum):
    SMALL = "small"
    NORMAL = "normal"
    LARGE = "large"
    X_LARGE = "x-large"


class AlignmentToken(StrEnum):
    START = "start"
    CENTER = "center"
    END = "end"
    JUSTIFY = "justify"


class BoldMark(StrictSchema):
    type: Literal["bold"]


class ItalicMark(StrictSchema):
    type: Literal["italic"]


class UnderlineMark(StrictSchema):
    type: Literal["underline"]


class FontFamilyMark(StrictSchema):
    type: Literal["font_family"]
    value: FontFamilyToken


class FontSizeMark(StrictSchema):
    type: Literal["font_size"]
    value: FontSizeToken


TextMark = Annotated[
    Union[
        BoldMark,
        ItalicMark,
        UnderlineMark,
        FontFamilyMark,
        FontSizeMark,
    ],
    Field(discriminator="type"),
]


class TextNode(StrictSchema):
    type: Literal["text"]
    text: str
    marks: list[TextMark] = Field(default_factory=list)

    @model_validator(mode="after")
    def reject_duplicate_marks(self) -> "TextNode":
        mark_types = [mark.type for mark in self.marks]
        if len(mark_types) != len(set(mark_types)):
            raise ValueError("Text marks must have unique types.")
        return self


class InlineMathNode(StrictSchema):
    type: Literal["inline_math"]
    latex: str


class HardBreakNode(StrictSchema):
    type: Literal["hard_break"]


InlineNode = Annotated[
    Union[TextNode, InlineMathNode, HardBreakNode],
    Field(discriminator="type"),
]


class ParagraphAttrs(StrictSchema):
    alignment: AlignmentToken


class ParagraphNode(StrictSchema):
    type: Literal["paragraph"]
    attrs: ParagraphAttrs | None = None
    content: list[InlineNode] = Field(default_factory=list)


class ListItemNode(StrictSchema):
    type: Literal["list_item"]
    content: list[ParagraphNode] = Field(min_length=1)


class BulletListNode(StrictSchema):
    type: Literal["bullet_list"]
    content: list[ListItemNode] = Field(default_factory=list)


class OrderedListNode(StrictSchema):
    type: Literal["ordered_list"]
    content: list[ListItemNode] = Field(default_factory=list)


BlockNode = Annotated[
    Union[ParagraphNode, BulletListNode, OrderedListNode],
    Field(discriminator="type"),
]


class StructuredTextDocument(StrictSchema):
    """Version 1 platform-owned structured-text document."""

    type: Literal["document"]
    content: list[BlockNode] = Field(default_factory=list)


def project_source_text(document: StructuredTextDocument) -> str:
    """Project a validated V1 document to deterministic plain text."""

    return "\n".join(_project_block(block) for block in document.content)


def legacy_source_text_to_document(source_text: str) -> StructuredTextDocument:
    """Wrap legacy plain text in a single V1 paragraph without parsing it."""

    return StructuredTextDocument(
        type="document",
        content=[
            ParagraphNode(
                type="paragraph",
                content=[TextNode(type="text", text=source_text)],
            ),
        ],
    )


def _project_block(block: BlockNode) -> str:
    if isinstance(block, ParagraphNode):
        return _project_paragraph(block)
    if isinstance(block, BulletListNode):
        return "\n".join(
            _project_list_item(item, "-") for item in block.content
        )
    return "\n".join(
        _project_list_item(item, f"{index}.")
        for index, item in enumerate(block.content, start=1)
    )


def _project_paragraph(paragraph: ParagraphNode) -> str:
    parts: list[str] = []
    for node in paragraph.content:
        if isinstance(node, TextNode):
            parts.append(node.text)
        elif isinstance(node, InlineMathNode):
            parts.append(node.latex)
        else:
            parts.append("\n")
    return "".join(parts)


def _project_list_item(item: ListItemNode, marker: str) -> str:
    paragraphs = [_project_paragraph(paragraph) for paragraph in item.content]
    first, *remaining = paragraphs
    lines = [f"{marker} {first}"]
    lines.extend(f"  {paragraph}" for paragraph in remaining)
    return "\n".join(lines)

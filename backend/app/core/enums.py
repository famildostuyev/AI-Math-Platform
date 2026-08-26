from enum import Enum


class RoleName(str, Enum):
    STUDENT = "student"
    PARENT = "parent"
    TEACHER = "teacher"
    ADMIN = "admin"


class VerificationChannel(str, Enum):
    EMAIL = "email"
    PHONE = "phone"


class VerificationPurpose(str, Enum):
    VERIFY_EMAIL = "verify_email"
    VERIFY_PHONE = "verify_phone"
    RESET_PASSWORD = "reset_password"
    CHANGE_EMAIL = "change_email"
    CHANGE_PHONE = "change_phone"
    MAGIC_LOGIN = "magic_login"
    MULTI_FACTOR_AUTHENTICATION = "multi_factor_authentication"


class RelationshipType(str, Enum):
    TEACHER_TO_STUDENT = "teacher_to_student"
    STUDENT_TO_TEACHER = "student_to_teacher"

    TEACHER_TO_TEACHER = "teacher_to_teacher"

    PARENT_TO_STUDENT = "parent_to_student"
    STUDENT_TO_PARENT = "student_to_parent"

    PARENT_TO_TEACHER = "parent_to_teacher"
    TEACHER_TO_PARENT = "teacher_to_parent"


class RelationshipStatus(str, Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    ENDED = "ended"
    BLOCKED = "blocked"


class GroupMemberCategory(str, Enum):
    STUDENT = "student"
    TEACHER = "teacher"


class GroupMemberRole(str, Enum):
    OWNER = "owner"
    MEMBER = "member"


class GroupMembershipStatus(str, Enum):
    PENDING = "pending"
    ACTIVE = "active"
    REJECTED = "rejected"
    LEFT = "left"
    REMOVED = "removed"


class QuestionFamilyOriginKind(str, Enum):
    AUTHORED = "authored"
    IMPORTED = "imported"
    AI_GENERATED_SIMILAR = "ai_generated_similar"


class QuestionFormDerivationKind(str, Enum):
    ORIGINAL = "original"
    TRANSFORMED = "transformed"


class OpenResponseMode(str, Enum):
    SHORT_ANSWER = "short_answer"
    DETAILED_SOLUTION = "detailed_solution"


class AnswerPolicy(str, Enum):
    OPTION_SINGLE = "option_single"
    OPTION_MULTIPLE = "option_multiple"
    ACCEPTED_ANSWER = "accepted_answer"
    NONE = "none"
    UNSUPPORTED = "unsupported"


class QuestionRevisionStatus(str, Enum):
    DRAFT = "draft"
    PROPOSED = "proposed"
    APPROVED = "approved"
    REJECTED = "rejected"


class QuestionRevisionProvenanceKind(str, Enum):
    HUMAN_AUTHORED = "human_authored"
    IMPORTED = "imported"
    AI_GENERATED = "ai_generated"
    AI_TRANSFORMED = "ai_transformed"
    ADMIN_EDITED = "admin_edited"


class AIAuthoringProposalStatus(str, Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    OBSOLETE = "obsolete"


class AIAuthoringConversationStatus(str, Enum):
    ACTIVE = "active"
    CLOSED = "closed"


class AIAuthoringMessageRole(str, Enum):
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"


class QuestionDifficulty(str, Enum):
    EASY = "easy"
    MEDIUM = "medium"
    HARD = "hard"


class ContentBlockType(str, Enum):
    TEXT = "text"
    FORMULA = "formula"
    IMAGE = "image"
    GEOMETRY = "geometry"
    GRAPH = "graph"
    TABLE = "table"
    DIAGRAM = "diagram"


class SourcePreAnalysisRunStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


class SourcePreAnalysisFindingSeverity(str, Enum):
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"


class QuestionExtractionRunStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"

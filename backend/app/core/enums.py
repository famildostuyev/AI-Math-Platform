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
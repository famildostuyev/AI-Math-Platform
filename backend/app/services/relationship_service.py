from __future__ import annotations

import uuid

from sqlalchemy import and_, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.enums import (
    RelationshipStatus,
    RelationshipType,
    RoleName,
)
from app.core.security import utc_now
from app.models.role import Role
from app.models.user import User
from app.models.user_relationship import UserRelationship
from app.models.user_role import UserRole


class RelationshipServiceError(Exception):
    """Base exception for relationship-service failures."""


class RelationshipUserNotFoundError(RelationshipServiceError):
    """Raised when a required active user cannot be found."""


class InvalidRelationshipParticipantsError(RelationshipServiceError):
    """Raised when users do not have the roles required by the relationship."""


class RelationshipConflictError(RelationshipServiceError):
    """Raised when a pending or accepted equivalent relationship already exists."""


class RelationshipNotFoundError(RelationshipServiceError):
    """Raised when the requested relationship does not exist."""


class RelationshipPermissionError(RelationshipServiceError):
    """Raised when a user cannot perform an action on a relationship."""


class RelationshipContextError(RelationshipServiceError):
    """Raised when relationship context is missing or invalid."""


class RelationshipBlockedError(RelationshipServiceError):
    """Raised when a blocked relationship prevents a new request."""


class InvalidRelationshipStateError(RelationshipServiceError):
    """Raised when an action is invalid for the relationship's current state."""


class RelationshipService:
    """
    Application service responsible for user-to-user relationship workflows.

    Responsibilities:

    - validate requester and recipient roles;
    - create relationship requests;
    - prevent duplicate pending/accepted relationships;
    - accept or reject requests;
    - end accepted relationships;
    - block relationships;
    - enforce student context for parent-teacher relationships.

    Transaction boundaries are controlled by this service.
    """

    _ROLE_PAIRS: dict[RelationshipType, tuple[RoleName, RoleName]] = {
        RelationshipType.TEACHER_TO_STUDENT: (
            RoleName.TEACHER,
            RoleName.STUDENT,
        ),
        RelationshipType.STUDENT_TO_TEACHER: (
            RoleName.STUDENT,
            RoleName.TEACHER,
        ),
        RelationshipType.TEACHER_TO_TEACHER: (
            RoleName.TEACHER,
            RoleName.TEACHER,
        ),
        RelationshipType.PARENT_TO_STUDENT: (
            RoleName.PARENT,
            RoleName.STUDENT,
        ),
        RelationshipType.STUDENT_TO_PARENT: (
            RoleName.STUDENT,
            RoleName.PARENT,
        ),
        RelationshipType.PARENT_TO_TEACHER: (
            RoleName.PARENT,
            RoleName.TEACHER,
        ),
        RelationshipType.TEACHER_TO_PARENT: (
            RoleName.TEACHER,
            RoleName.PARENT,
        ),
    }

    _TEACHER_STUDENT_TYPES = (
        RelationshipType.TEACHER_TO_STUDENT,
        RelationshipType.STUDENT_TO_TEACHER,
    )

    _PARENT_STUDENT_TYPES = (
        RelationshipType.PARENT_TO_STUDENT,
        RelationshipType.STUDENT_TO_PARENT,
    )

    _PARENT_TEACHER_TYPES = (
        RelationshipType.PARENT_TO_TEACHER,
        RelationshipType.TEACHER_TO_PARENT,
    )

    def __init__(self, db: Session) -> None:
        self.db = db

    def _get_active_user(
        self,
        *,
        user_id: uuid.UUID,
    ) -> User:
        statement = select(User).where(
            User.id == user_id,
            User.is_active.is_(True),
            User.deleted_at.is_(None),
        )

        user = self.db.scalar(statement)

        if user is None:
            raise RelationshipUserNotFoundError(
                "Active user was not found."
            )

        return user

    def _user_has_role(
        self,
        *,
        user_id: uuid.UUID,
        role_name: RoleName,
    ) -> bool:
        statement = (
            select(UserRole.id)
            .join(
                Role,
                Role.id == UserRole.role_id,
            )
            .where(
                UserRole.user_id == user_id,
                UserRole.is_active.is_(True),
                UserRole.deleted_at.is_(None),
                Role.is_active.is_(True),
                Role.deleted_at.is_(None),
                func.lower(Role.name) == role_name.value.lower(),
            )
            .limit(1)
        )

        return self.db.scalar(statement) is not None

    def _validate_participant_roles(
        self,
        *,
        requester_id: uuid.UUID,
        recipient_id: uuid.UUID,
        relationship_type: RelationshipType,
    ) -> None:
        required_roles = self._ROLE_PAIRS.get(relationship_type)

        if required_roles is None:
            raise InvalidRelationshipParticipantsError(
                "Unsupported relationship type."
            )

        requester_role, recipient_role = required_roles

        if not self._user_has_role(
            user_id=requester_id,
            role_name=requester_role,
        ):
            raise InvalidRelationshipParticipantsError(
                "Requester does not have the required role."
            )

        if not self._user_has_role(
            user_id=recipient_id,
            role_name=recipient_role,
        ):
            raise InvalidRelationshipParticipantsError(
                "Recipient does not have the required role."
            )

    @classmethod
    def _relationship_family(
        cls,
        relationship_type: RelationshipType,
    ) -> tuple[RelationshipType, ...]:
        if relationship_type in cls._TEACHER_STUDENT_TYPES:
            return cls._TEACHER_STUDENT_TYPES

        if relationship_type in cls._PARENT_STUDENT_TYPES:
            return cls._PARENT_STUDENT_TYPES

        if relationship_type in cls._PARENT_TEACHER_TYPES:
            return cls._PARENT_TEACHER_TYPES

        if relationship_type == RelationshipType.TEACHER_TO_TEACHER:
            return (RelationshipType.TEACHER_TO_TEACHER,)

        raise InvalidRelationshipParticipantsError(
            "Unsupported relationship type."
        )

    def _semantic_relationships(
        self,
        *,
        requester_id: uuid.UUID,
        recipient_id: uuid.UUID,
        relationship_type: RelationshipType,
        context_student_id: uuid.UUID | None,
        lock_for_update: bool = False,
    ) -> list[UserRelationship]:
        family = self._relationship_family(relationship_type)

        pair_condition = or_(
            and_(
                UserRelationship.requester_id == requester_id,
                UserRelationship.recipient_id == recipient_id,
            ),
            and_(
                UserRelationship.requester_id == recipient_id,
                UserRelationship.recipient_id == requester_id,
            ),
        )

        statement = select(UserRelationship).where(
            pair_condition,
            UserRelationship.relationship_type.in_(family),
            UserRelationship.deleted_at.is_(None),
        )

        if relationship_type in self._PARENT_TEACHER_TYPES:
            statement = statement.where(
                UserRelationship.context_student_id == context_student_id,
            )
        else:
            statement = statement.where(
                UserRelationship.context_student_id.is_(None),
            )

        if lock_for_update:
            statement = statement.with_for_update()

        return list(self.db.scalars(statement).all())

    def _has_accepted_pair(
        self,
        *,
        first_user_id: uuid.UUID,
        second_user_id: uuid.UUID,
        relationship_types: tuple[RelationshipType, ...],
    ) -> bool:
        pair_condition = or_(
            and_(
                UserRelationship.requester_id == first_user_id,
                UserRelationship.recipient_id == second_user_id,
            ),
            and_(
                UserRelationship.requester_id == second_user_id,
                UserRelationship.recipient_id == first_user_id,
            ),
        )

        statement = (
            select(UserRelationship.id)
            .where(
                pair_condition,
                UserRelationship.relationship_type.in_(
                    relationship_types
                ),
                UserRelationship.status == RelationshipStatus.ACCEPTED,
                UserRelationship.context_student_id.is_(None),
                UserRelationship.deleted_at.is_(None),
            )
            .limit(1)
        )

        return self.db.scalar(statement) is not None

    def _validate_parent_teacher_context(
        self,
        *,
        requester_id: uuid.UUID,
        recipient_id: uuid.UUID,
        relationship_type: RelationshipType,
        context_student_id: uuid.UUID | None,
    ) -> None:
        if relationship_type not in self._PARENT_TEACHER_TYPES:
            if context_student_id is not None:
                raise RelationshipContextError(
                    "Student context is only valid for parent-teacher relationships."
                )
            return

        if context_student_id is None:
            raise RelationshipContextError(
                "Parent-teacher relationships require a student context."
            )

        self._get_active_user(user_id=context_student_id)

        if not self._user_has_role(
            user_id=context_student_id,
            role_name=RoleName.STUDENT,
        ):
            raise RelationshipContextError(
                "Relationship context user must be a student."
            )

        if relationship_type == RelationshipType.PARENT_TO_TEACHER:
            parent_id = requester_id
            teacher_id = recipient_id
        else:
            teacher_id = requester_id
            parent_id = recipient_id

        parent_is_linked = self._has_accepted_pair(
            first_user_id=parent_id,
            second_user_id=context_student_id,
            relationship_types=self._PARENT_STUDENT_TYPES,
        )

        if not parent_is_linked:
            raise RelationshipContextError(
                "Parent must have an accepted relationship with the context student."
            )

        teacher_is_linked = self._has_accepted_pair(
            first_user_id=teacher_id,
            second_user_id=context_student_id,
            relationship_types=self._TEACHER_STUDENT_TYPES,
        )

        if not teacher_is_linked:
            raise RelationshipContextError(
                "Teacher must have an accepted relationship with the context student."
            )

    def _get_relationship_for_update(
        self,
        *,
        relationship_id: uuid.UUID,
    ) -> UserRelationship:
        statement = (
            select(UserRelationship)
            .where(
                UserRelationship.id == relationship_id,
                UserRelationship.deleted_at.is_(None),
            )
            .with_for_update()
        )

        relationship = self.db.scalar(statement)

        if relationship is None:
            raise RelationshipNotFoundError(
                "Relationship was not found."
            )

        return relationship

    def send_request(
        self,
        *,
        requester_id: uuid.UUID,
        recipient_id: uuid.UUID,
        relationship_type: RelationshipType,
        context_student_id: uuid.UUID | None = None,
    ) -> UserRelationship:
        if requester_id == recipient_id:
            raise InvalidRelationshipParticipantsError(
                "A user cannot create a relationship with themselves."
            )

        self._get_active_user(user_id=requester_id)
        self._get_active_user(user_id=recipient_id)

        self._validate_participant_roles(
            requester_id=requester_id,
            recipient_id=recipient_id,
            relationship_type=relationship_type,
        )

        self._validate_parent_teacher_context(
            requester_id=requester_id,
            recipient_id=recipient_id,
            relationship_type=relationship_type,
            context_student_id=context_student_id,
        )

        now = utc_now()

        try:
            existing_relationships = self._semantic_relationships(
                requester_id=requester_id,
                recipient_id=recipient_id,
                relationship_type=relationship_type,
                context_student_id=context_student_id,
                lock_for_update=True,
            )

            for existing in existing_relationships:
                if existing.status == RelationshipStatus.BLOCKED:
                    raise RelationshipBlockedError(
                        "A blocked relationship prevents this request."
                    )

                if existing.status in (
                    RelationshipStatus.PENDING,
                    RelationshipStatus.ACCEPTED,
                ):
                    raise RelationshipConflictError(
                        "An equivalent pending or accepted relationship already exists."
                    )

            exact_existing = next(
                (
                    item
                    for item in existing_relationships
                    if item.requester_id == requester_id
                    and item.recipient_id == recipient_id
                    and item.relationship_type == relationship_type
                    and item.context_student_id == context_student_id
                ),
                None,
            )

            if exact_existing is not None:
                exact_existing.status = RelationshipStatus.PENDING
                exact_existing.requested_at = now
                exact_existing.responded_at = None
                exact_existing.ended_at = None
                exact_existing.blocked_by_id = None

                self.db.commit()
                self.db.refresh(exact_existing)

                return exact_existing

            relationship = UserRelationship(
                requester_id=requester_id,
                recipient_id=recipient_id,
                relationship_type=relationship_type,
                context_student_id=context_student_id,
                status=RelationshipStatus.PENDING,
                requested_at=now,
            )

            self.db.add(relationship)
            self.db.commit()
            self.db.refresh(relationship)

            return relationship

        except IntegrityError as exc:
            self.db.rollback()

            raise RelationshipConflictError(
                "An equivalent relationship already exists."
            ) from exc
        except Exception:
            self.db.rollback()
            raise

    def accept_request(
        self,
        *,
        relationship_id: uuid.UUID,
        actor_id: uuid.UUID,
    ) -> UserRelationship:
        try:
            relationship = self._get_relationship_for_update(
                relationship_id=relationship_id,
            )

            if actor_id != relationship.recipient_id:
                raise RelationshipPermissionError(
                    "Only the request recipient can accept this relationship."
                )

            if relationship.status != RelationshipStatus.PENDING:
                raise InvalidRelationshipStateError(
                    "Only pending relationships can be accepted."
                )

            self._validate_parent_teacher_context(
                requester_id=relationship.requester_id,
                recipient_id=relationship.recipient_id,
                relationship_type=relationship.relationship_type,
                context_student_id=relationship.context_student_id,
            )

            relationship.status = RelationshipStatus.ACCEPTED
            relationship.responded_at = utc_now()
            relationship.ended_at = None
            relationship.blocked_by_id = None

            self.db.commit()
            self.db.refresh(relationship)

            return relationship

        except Exception:
            self.db.rollback()
            raise

    def reject_request(
        self,
        *,
        relationship_id: uuid.UUID,
        actor_id: uuid.UUID,
    ) -> UserRelationship:
        try:
            relationship = self._get_relationship_for_update(
                relationship_id=relationship_id,
            )

            if actor_id != relationship.recipient_id:
                raise RelationshipPermissionError(
                    "Only the request recipient can reject this relationship."
                )

            if relationship.status != RelationshipStatus.PENDING:
                raise InvalidRelationshipStateError(
                    "Only pending relationships can be rejected."
                )

            relationship.status = RelationshipStatus.REJECTED
            relationship.responded_at = utc_now()
            relationship.ended_at = None
            relationship.blocked_by_id = None

            self.db.commit()
            self.db.refresh(relationship)

            return relationship

        except Exception:
            self.db.rollback()
            raise

    def end_relationship(
        self,
        *,
        relationship_id: uuid.UUID,
        actor_id: uuid.UUID,
    ) -> UserRelationship:
        try:
            relationship = self._get_relationship_for_update(
                relationship_id=relationship_id,
            )

            if actor_id not in (
                relationship.requester_id,
                relationship.recipient_id,
            ):
                raise RelationshipPermissionError(
                    "Only a relationship participant can end it."
                )

            if relationship.status != RelationshipStatus.ACCEPTED:
                raise InvalidRelationshipStateError(
                    "Only accepted relationships can be ended."
                )

            relationship.status = RelationshipStatus.ENDED
            relationship.ended_at = utc_now()
            relationship.blocked_by_id = None

            self.db.commit()
            self.db.refresh(relationship)

            return relationship

        except Exception:
            self.db.rollback()
            raise

    def block_relationship(
        self,
        *,
        relationship_id: uuid.UUID,
        actor_id: uuid.UUID,
    ) -> UserRelationship:
        try:
            relationship = self._get_relationship_for_update(
                relationship_id=relationship_id,
            )

            if actor_id not in (
                relationship.requester_id,
                relationship.recipient_id,
            ):
                raise RelationshipPermissionError(
                    "Only a relationship participant can block it."
                )

            if relationship.status == RelationshipStatus.BLOCKED:
                raise InvalidRelationshipStateError(
                    "Relationship is already blocked."
                )

            relationship.status = RelationshipStatus.BLOCKED
            relationship.blocked_by_id = actor_id
            relationship.responded_at = (
                relationship.responded_at or utc_now()
            )
            relationship.ended_at = utc_now()

            self.db.commit()
            self.db.refresh(relationship)

            return relationship

        except Exception:
            self.db.rollback()
            raise
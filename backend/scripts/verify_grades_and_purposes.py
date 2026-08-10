from __future__ import annotations

from sqlalchemy import select

from app.database.session import SessionLocal
from app.models.grade import Grade
from app.models.purpose import Purpose


def main() -> None:
    db = SessionLocal()

    try:
        grades = list(
            db.scalars(
                select(Grade)
                .where(
                    Grade.deleted_at.is_(None),
                    Grade.is_active.is_(True),
                )
                .order_by(
                    Grade.sort_order.asc(),
                    Grade.display_name.asc(),
                )
            ).all()
        )

        top_level_purposes = list(
            db.scalars(
                select(Purpose)
                .where(
                    Purpose.parent_id.is_(None),
                    Purpose.deleted_at.is_(None),
                    Purpose.is_active.is_(True),
                )
                .order_by(
                    Purpose.sort_order.asc(),
                    Purpose.display_name.asc(),
                )
            ).all()
        )

        print("=== GRADES ===")
        for grade in grades:
            print(f"- {grade.display_name} [{grade.name}]")

        print()
        print("=== PURPOSE TREE ===")

        total_purposes = 0

        for parent in top_level_purposes:
            total_purposes += 1
            print(f"- {parent.display_name} [{parent.name}]")

            children = list(
                db.scalars(
                    select(Purpose)
                    .where(
                        Purpose.parent_id == parent.id,
                        Purpose.deleted_at.is_(None),
                        Purpose.is_active.is_(True),
                    )
                    .order_by(
                        Purpose.sort_order.asc(),
                        Purpose.display_name.asc(),
                    )
                ).all()
            )

            for child in children:
                total_purposes += 1
                print(f"  └─ {child.display_name} [{child.name}]")

        print()
        print(f"[CHECK] Active grades: {len(grades)}")
        print(f"[CHECK] Active purposes: {total_purposes}")

        if len(grades) != 7:
            raise AssertionError(
                f"Expected 7 active grades, found {len(grades)}."
            )

        if total_purposes != 23:
            raise AssertionError(
                f"Expected 23 active purposes, found {total_purposes}."
            )

        print("[OK] Grade and Purpose verification passed.")

    finally:
        db.close()


if __name__ == "__main__":
    main()
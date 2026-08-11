from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database.session import SessionLocal
from app.models.grade import Grade
from app.models.purpose import Purpose


GRADES = [
    ("grade_5", "5-ci sinif", 5),
    ("grade_6", "6-cı sinif", 6),
    ("grade_7", "7-ci sinif", 7),
    ("grade_8", "8-ci sinif", 8),
    ("grade_9", "9-cu sinif", 9),
    ("grade_10", "10-cu sinif", 10),
    ("grade_11", "11-ci sinif", 11),
]


PURPOSES = [
    {
        "name": "ksq",
        "display_name": "KSQ — Kiçik Summativ Qiymətləndirmə",
        "sort_order": 10,
        "children": [],
    },
    {
        "name": "bsq",
        "display_name": "BSQ — Böyük Summativ Qiymətləndirmə",
        "sort_order": 20,
        "children": [],
    },
    {
        "name": "buraxilis",
        "display_name": "Buraxılış imtahanı",
        "sort_order": 30,
        "children": [
            (
                "buraxilis_9",
                "9-cu sinif buraxılış imtahanı",
                10,
            ),
            (
                "buraxilis_11",
                "11-ci sinif buraxılış imtahanı",
                20,
            ),
        ],
    },
    {
        "name": "blok",
        "display_name": "Blok imtahanı",
        "sort_order": 40,
        "children": [
            (
                "blok_i_qrup",
                "I ixtisas qrupu üzrə blok imtahanı",
                10,
            ),
            (
                "blok_ii_qrup",
                "II ixtisas qrupu üzrə blok imtahanı",
                20,
            ),
        ],
    },
    {
        "name": "lisey_qebul",
        "display_name": "Liseylərə qəbul",
        "sort_order": 50,
        "children": [
            (
                "deyanet_5_qebul",
                "5-ci sinif şagirdləri üçün Dəyanət Liseyinə qəbul imtahanı",
                10,
            ),
            (
                "deyanet_8_qebul",
                "8-ci sinif şagirdləri üçün Dəyanət Liseyinə qəbul imtahanı",
                20,
            ),
            (
                "merkezlesdirilmis_lisey_qebul",
                "Mərkəzləşdirilmiş liseylərə qəbul imtahanı",
                30,
            ),
            (
                "diger_lisey_qebul",
                "Digər liseylərə qəbul imtahanları",
                40,
            ),
        ],
    },
    {
        "name": "rfm",
        "display_name": "RFM",
        "sort_order": 60,
        "children": [
            (
                "rfm_i_tur",
                "I tur — Rayon (şəhər) mərhələsi",
                10,
            ),
            (
                "rfm_ii_tur",
                "II tur — Respublika yarımfinal mərhələsi",
                20,
            ),
            (
                "rfm_iii_tur",
                "III tur — Respublika final mərhələsi",
                30,
            ),
        ],
    },
    {
        "name": "rfo",
        "display_name": "RFO — Respublika Fənn Olimpiadaları",
        "sort_order": 70,
        "children": [
            (
                "rfo_i_tur",
                "I tur — Rayon (şəhər) mərhələsi",
                10,
            ),
            (
                "rfo_ii_tur",
                "II tur — Respublika yarımfinal mərhələsi",
                20,
            ),
            (
                "rfo_iii_tur",
                "III tur — Respublika final mərhələsi",
                30,
            ),
        ],
    },
    {
        "name": "miq",
        "display_name": "MİQ — Müəllimlərin İşə Qəbulu imtahanı",
        "sort_order": 80,
        "children": [],
    },
    {
        "name": "sertifikatlasdirma",
        "display_name": "Sertifikasiya",
        "sort_order": 90,
        "children": [],
    },
]


def upsert_grade(
    db: Session,
    *,
    name: str,
    display_name: str,
    sort_order: int,
) -> Grade:
    grade = db.scalar(select(Grade).where(Grade.name == name))

    if grade is None:
        grade = Grade(
            name=name,
            display_name=display_name,
            sort_order=sort_order,
            is_active=True,
        )
        db.add(grade)
    else:
        grade.display_name = display_name
        grade.sort_order = sort_order
        grade.is_active = True

    db.flush()
    return grade


def upsert_purpose(
    db: Session,
    *,
    name: str,
    display_name: str,
    sort_order: int,
    parent: Purpose | None,
) -> Purpose:
    purpose = db.scalar(
        select(Purpose).where(Purpose.name == name)
    )

    if purpose is None:
        purpose = Purpose(
            name=name,
            display_name=display_name,
            description=None,
            sort_order=sort_order,
            is_system=True,
            is_active=True,
            parent_id=parent.id if parent else None,
        )
        db.add(purpose)
    else:
        purpose.display_name = display_name
        purpose.sort_order = sort_order
        purpose.is_system = True
        purpose.is_active = True
        purpose.parent_id = parent.id if parent else None

    db.flush()
    return purpose


def seed_grades(db: Session) -> None:
    for name, display_name, sort_order in GRADES:
        upsert_grade(
            db,
            name=name,
            display_name=display_name,
            sort_order=sort_order,
        )


def seed_purposes(db: Session) -> None:
    for item in PURPOSES:
        parent = upsert_purpose(
            db,
            name=item["name"],
            display_name=item["display_name"],
            sort_order=item["sort_order"],
            parent=None,
        )

        for child_name, child_display_name, child_sort_order in item["children"]:
            upsert_purpose(
                db,
                name=child_name,
                display_name=child_display_name,
                sort_order=child_sort_order,
                parent=parent,
            )


def main() -> None:
    db = SessionLocal()

    try:
        seed_grades(db)
        seed_purposes(db)
        db.commit()

        grade_count = len(GRADES)
        purpose_count = sum(
            1 + len(item["children"])
            for item in PURPOSES
        )

        print(f"[OK] Grades seeded: {grade_count}")
        print(f"[OK] Purposes seeded: {purpose_count}")
        print("[OK] Grade and Purpose seed completed successfully.")

    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()

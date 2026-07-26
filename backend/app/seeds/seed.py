from app.database.session import SessionLocal
from app.seeds.roles import seed_roles


def run_seeds() -> None:
    """
    Run all database seeds.
    """
    db = SessionLocal()

    try:
        seed_roles(db)
        print("Database seeds completed successfully.")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    run_seeds()

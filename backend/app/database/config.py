from dotenv import load_dotenv
import os

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise ValueError("DATABASE_URL tapÄ±lmadÄ±. .env faylÄ±nÄ± yoxlayÄ±n.")

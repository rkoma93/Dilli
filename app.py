import os
import logging
from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy.orm import DeclarativeBase
from supabase import create_client

# Configure logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

class Base(DeclarativeBase):
    pass

db = SQLAlchemy(model_class=Base)
app = Flask(__name__)

# Log environment variable presence
logger.info("Checking environment variables...")
required_vars = ['DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_KEY', 'SESSION_SECRET']
for var in required_vars:
    logger.info(f"Environment variable {var} is {'present' if os.environ.get(var) else 'missing'}")

# Configure app
app.secret_key = os.environ.get("SESSION_SECRET")
app.config["SQLALCHEMY_DATABASE_URI"] = os.environ.get("DATABASE_URL")
app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {
    "pool_recycle": 300,
    "pool_pre_ping": True,
}

logger.info("Initializing Supabase client...")
# Initialize Supabase client
try:
    supabase = create_client(
        os.environ.get("SUPABASE_URL"),
        os.environ.get("SUPABASE_KEY")
    )
    logger.info("Supabase client initialized successfully")
except Exception as e:
    logger.error(f"Failed to initialize Supabase client: {str(e)}")
    raise

logger.info("Initializing database...")
# Initialize extensions
db.init_app(app)

with app.app_context():
    try:
        import models
        import routes
        db.create_all()
        logger.info("Database tables created successfully")
    except Exception as e:
        logger.error(f"Failed to initialize database: {str(e)}")
        raise
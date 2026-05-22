import json
import os
import secrets

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"), override=True)

from flask import Flask, request

from db import db


def _camel_to_snake_request():
    if request.content_type and "json" in request.content_type:
        body = request.get_json(force=True, silent=True)
        if isinstance(body, dict):
            from api.utils import to_snake
            converted = to_snake(body)
            request._cached_json = (converted, converted)


def create_app():
    app = Flask(__name__)
    app.secret_key = os.getenv("BRIDGE_SECRET_KEY", secrets.token_hex(32))

    _db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "bridge_removal.db").replace("\\", "/")
    app.config["SQLALCHEMY_DATABASE_URI"] = os.getenv(
        "DATABASE_URL",
        f"sqlite:///{_db_path}"
    )
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
    db.init_app(app)

    app.before_request(_camel_to_snake_request)

    @app.after_request
    def _add_cors_headers(response):
        origin = request.headers.get("Origin", "")
        allowed_origins = os.getenv("CORS_ORIGINS", "http://127.0.0.1:5173,http://127.0.0.1:5174,http://localhost:5173,http://localhost:5174")
        if origin and origin in allowed_origins.split(","):
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Credentials"] = "true"
            response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
            response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
            response.headers["Access-Control-Max-Age"] = "86400"
        if request.method == "OPTIONS":
            response.status_code = 200
        return response

    from api.auth import auth_bp
    from api.projects import projects_bp
    from api.tasks import tasks_bp
    from api.shapefiles import shapefiles_bp
    from api.upm import upm_bp
    from api.system import system_bp, health_bp
    from api.jobs import jobs_bp

    app.register_blueprint(health_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(projects_bp)
    app.register_blueprint(tasks_bp)
    app.register_blueprint(shapefiles_bp)
    app.register_blueprint(upm_bp)
    app.register_blueprint(system_bp)
    app.register_blueprint(jobs_bp)

    with app.app_context():
        from db.models import ProjectModel, JobModel, SessionModel
        db.create_all()

    return app


if __name__ == "__main__":
    app = create_app()
    port = int(os.getenv("BRIDGE_REMOVAL_PORT", "5050"))
    with app.app_context():
        from services.callback_service import register_with_task_management, start_tms_retry_thread
        register_with_task_management()
        start_tms_retry_thread()
    app.run(host="0.0.0.0", port=port, threaded=True)

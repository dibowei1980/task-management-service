import json
import os
import secrets

from flask import Flask, request

from db import db


def _camel_to_snake_request():
    if request.content_type and "json" in request.content_type:
        body = request.get_json(force=True, silent=True)
        if isinstance(body, dict):
            from api.utils import to_snake
            request._cached_json = (to_snake(body), True)


def create_app():
    app = Flask(__name__)
    app.secret_key = os.getenv("BRIDGE_SECRET_KEY", secrets.token_hex(32))

    app.config["SQLALCHEMY_DATABASE_URI"] = os.getenv(
        "DATABASE_URL",
        f"sqlite:///{os.path.join(os.path.dirname(os.path.abspath(__file__)), 'bridge_removal.db')}"
    )
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
    db.init_app(app)

    app.before_request(_camel_to_snake_request)

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
        from db.models import ProjectModel, JobModel, SessionModel, LocalUserModel
        db.create_all()
        _migrate_local_users_to_db()

    return app


LOCAL_USERS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "local_users.json")


def _migrate_local_users_to_db():
    from db.repository import LocalUserRepository
    if not os.path.exists(LOCAL_USERS_FILE):
        return
    if LocalUserRepository.find_all():
        return
    if os.path.exists(LOCAL_USERS_FILE):
        with open(LOCAL_USERS_FILE, "r", encoding="utf-8") as f:
            users = json.load(f)
    else:
        return
    for username, data in users.items():
        LocalUserRepository.save({
            "username": username,
            "password_hash": data.get("password_hash", ""),
            "display_name": data.get("display_name", username),
            "role": data.get("role", "user"),
            "permissions": json.dumps(data.get("permissions", [])),
        })


if __name__ == "__main__":
    app = create_app()
    from services.callback_service import register_with_task_management
    register_with_task_management()
    port = int(os.getenv("BRIDGE_REMOVAL_PORT", "5050"))
    app.run(host="0.0.0.0", port=port)

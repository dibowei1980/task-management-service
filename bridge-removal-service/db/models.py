from datetime import datetime
from db import db


class ProjectModel(db.Model):
    __tablename__ = "projects"
    id = db.Column(db.String(64), primary_key=True)
    name = db.Column(db.String(256), nullable=False)
    type = db.Column(db.String(64), nullable=False, default="BRIDGE_REMOVAL_BATCH")
    status = db.Column(db.String(32), nullable=False, default="PENDING")
    workflow_status = db.Column(db.String(64))
    source = db.Column(db.String(16), nullable=False, default="local")
    tms_synced = db.Column(db.Boolean, nullable=False, default=False)
    tms_task_id = db.Column(db.String(64))
    input_params = db.Column(db.Text)
    output_results = db.Column(db.Text)
    progress = db.Column(db.Integer, default=0)
    category = db.Column(db.String(32), default="PROJECT")
    priority = db.Column(db.Integer, default=1)
    department_id = db.Column(db.String(64))
    department_name = db.Column(db.String(256))
    project_leader_id = db.Column(db.String(64))
    assignee_id = db.Column(db.String(64))
    assignee_name = db.Column(db.String(128))
    created_by_name = db.Column(db.String(128))
    created_department_id = db.Column(db.String(64))
    created_department_name = db.Column(db.String(256))
    external_system = db.Column(db.String(128))
    external_task_id = db.Column(db.String(64))
    external_url = db.Column(db.String(512))
    operator_ids = db.Column(db.Text, default="[]")
    inspector_ids = db.Column(db.Text, default="[]")
    callback_url = db.Column(db.String(512))
    job_id = db.Column(db.String(64))
    parent_task_id = db.Column(db.String(64))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    received_at = db.Column(db.DateTime)


class JobModel(db.Model):
    __tablename__ = "jobs"
    id = db.Column(db.String(64), primary_key=True)
    project_id = db.Column(db.String(64), db.ForeignKey("projects.id"), nullable=False)
    task_id = db.Column(db.String(64))
    task_type = db.Column(db.String(64))
    status = db.Column(db.String(32), nullable=False, default="PENDING")
    input_params = db.Column(db.Text)
    output_results = db.Column(db.Text)
    progress = db.Column(db.Integer, default=0)
    error = db.Column(db.Text)
    started_at = db.Column(db.DateTime)
    completed_at = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class SessionModel(db.Model):
    __tablename__ = "sessions"
    id = db.Column(db.String(128), primary_key=True)
    user_id = db.Column(db.String(64))
    username = db.Column(db.String(128))
    display_name = db.Column(db.String(256))
    role = db.Column(db.String(32))
    permissions = db.Column(db.Text)
    department_id = db.Column(db.String(64))
    department_name = db.Column(db.String(256))
    email = db.Column(db.String(256))
    roles = db.Column(db.Text)
    sso_session_id = db.Column(db.String(128))
    upm_token = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    expires_at = db.Column(db.DateTime)


class LocalUserModel(db.Model):
    __tablename__ = "local_users"
    username = db.Column(db.String(128), primary_key=True)
    password_hash = db.Column(db.String(256), nullable=False)
    display_name = db.Column(db.String(256))
    role = db.Column(db.String(32), default="user")
    permissions = db.Column(db.Text, default="[]")

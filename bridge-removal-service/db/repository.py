import json
from datetime import datetime
from db import db
from db.models import ProjectModel, JobModel, SessionModel, LocalUserModel


def model_to_dict(model):
    if model is None:
        return None
    result = {}
    for col in model.__table__.columns:
        val = getattr(model, col.name)
        if isinstance(val, datetime):
            val = val.isoformat()
        result[col.name] = val
    return result


class ProjectRepository:
    @staticmethod
    def find_all():
        return ProjectModel.query.order_by(ProjectModel.created_at.desc()).all()

    @staticmethod
    def find_by_id(project_id):
        return ProjectModel.query.get(project_id)

    @staticmethod
    def save(project_dict):
        pid = project_dict.get("id") or project_dict.get("project_id")
        try:
            model = ProjectModel.query.get(pid) if pid else None
            if model:
                for k, v in project_dict.items():
                    if hasattr(model, k):
                        setattr(model, k, v)
            else:
                project_dict = dict(project_dict)
                project_dict.setdefault("id", pid)
                if "project_id" in project_dict and project_dict.get("id") != project_dict.get("project_id"):
                    project_dict["id"] = project_dict.pop("project_id")
                else:
                    project_dict.pop("project_id", None)
                model = ProjectModel(**project_dict)
            db.session.add(model)
            db.session.commit()
            return model
        except Exception:
            db.session.rollback()
            raise

    @staticmethod
    def find_by_parent(parent_task_id):
        return ProjectModel.query.filter_by(parent_task_id=parent_task_id).all()

    @staticmethod
    def delete(project_id):
        model = ProjectModel.query.get(project_id)
        if model:
            JobModel.query.filter_by(project_id=project_id).delete()
            db.session.delete(model)
            db.session.commit()
            return True
        return False


class JobRepository:
    @staticmethod
    def find_by_project(project_id):
        return JobModel.query.filter_by(project_id=project_id).all()

    @staticmethod
    def find_by_id(job_id):
        return JobModel.query.get(job_id)

    @staticmethod
    def find_by_task(task_id):
        return JobModel.query.filter_by(task_id=task_id).all()

    @staticmethod
    def save(job_dict):
        jid = job_dict.get("id") or job_dict.get("job_id")
        model = JobModel.query.get(jid) if jid else None
        if model:
            for k, v in job_dict.items():
                if hasattr(model, k):
                    setattr(model, k, v)
        else:
            job_dict = dict(job_dict)
            job_dict.setdefault("id", jid)
            if "job_id" in job_dict and job_dict.get("id") != job_dict.get("job_id"):
                job_dict["id"] = job_dict.pop("job_id")
            else:
                job_dict.pop("job_id", None)
            model = JobModel(**job_dict)
        db.session.add(model)
        db.session.commit()
        return model

    @staticmethod
    def delete_by_project(project_id):
        JobModel.query.filter_by(project_id=project_id).delete()
        db.session.commit()


class SessionRepository:
    @staticmethod
    def find_by_id(session_id):
        return SessionModel.query.get(session_id)

    @staticmethod
    def save(session_dict):
        model = SessionModel.query.get(session_dict.get("id"))
        if model:
            for k, v in session_dict.items():
                if hasattr(model, k):
                    setattr(model, k, v)
        else:
            model = SessionModel(**session_dict)
        db.session.add(model)
        db.session.commit()
        return model

    @staticmethod
    def delete(session_id):
        model = SessionModel.query.get(session_id)
        if model:
            db.session.delete(model)
            db.session.commit()


class LocalUserRepository:
    @staticmethod
    def find_all():
        return LocalUserModel.query.all()

    @staticmethod
    def find_by_username(username):
        return LocalUserModel.query.get(username)

    @staticmethod
    def save(user_dict):
        model = LocalUserModel.query.get(user_dict.get("username"))
        if model:
            for k, v in user_dict.items():
                if hasattr(model, k):
                    setattr(model, k, v)
        else:
            model = LocalUserModel(**user_dict)
        db.session.add(model)
        db.session.commit()
        return model

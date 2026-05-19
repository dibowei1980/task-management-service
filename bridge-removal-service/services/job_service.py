import json
import uuid
from datetime import datetime
from typing import Optional

from db.repository import JobRepository, model_to_dict


def db_model_to_job_dict(model) -> dict:
    data = model_to_dict(model)
    data["job_id"] = data.get("id")
    input_params = data.get("input_params", "{}")
    if isinstance(input_params, str):
        try:
            input_params = json.loads(input_params)
        except (json.JSONDecodeError, TypeError):
            input_params = {}
    data["input_params"] = input_params
    output_results = data.get("output_results")
    if isinstance(output_results, str):
        try:
            output_results = json.loads(output_results)
        except (json.JSONDecodeError, TypeError):
            output_results = None
    data["results"] = output_results
    return data


def create_job_record(task_id: str, task_type: str, input_params: dict) -> str:
    job_id = str(uuid.uuid4())
    if isinstance(input_params, dict):
        input_params = json.dumps(input_params, ensure_ascii=False)
    JobRepository.save({
        "id": job_id,
        "project_id": task_id,
        "task_id": task_id,
        "task_type": task_type,
        "input_params": input_params,
        "status": "PENDING",
    })
    return job_id


def update_job_status(job_id: str, status: str, results: Optional[dict] = None, error: Optional[str] = None):
    update_dict = {"id": job_id, "status": status}
    if status == "IN_PROGRESS":
        update_dict["started_at"] = datetime.utcnow()
    if status in ("COMPLETED", "FAILED"):
        update_dict["completed_at"] = datetime.utcnow()
    if results is not None:
        update_dict["output_results"] = json.dumps(results, ensure_ascii=False) if isinstance(results, dict) else results
    if error is not None:
        update_dict["error"] = error
    JobRepository.save(update_dict)


def find_latest_job_by_task(task_id: str, job_type: str):
    jobs = JobRepository.find_by_task(task_id)
    for j in reversed(jobs):
        if getattr(j, 'task_type', None) == job_type:
            return db_model_to_job_dict(j)
    return None


def get_job(job_id: str):
    model = JobRepository.find_by_id(job_id)
    if model:
        return db_model_to_job_dict(model)
    return None


def get_all_jobs():
    from db.repository import ProjectRepository
    all_jobs = []
    projects = ProjectRepository.find_all()
    for p in projects:
        jobs = JobRepository.find_by_project(p.id)
        for j in jobs:
            all_jobs.append(db_model_to_job_dict(j))
    return {j["job_id"]: j for j in all_jobs}


def find_jobs_by_project(project_id: str):
    models = JobRepository.find_by_project(project_id)
    return [db_model_to_job_dict(m) for m in models]

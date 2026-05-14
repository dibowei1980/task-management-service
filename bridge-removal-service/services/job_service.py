import json
import uuid
from datetime import datetime
from typing import Optional

from db.repository import JobRepository

_jobs: dict = {}


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
    _jobs[job_id] = {
        "job_id": job_id,
        "task_id": task_id,
        "task_type": task_type,
        "input_params": input_params,
        "status": "PENDING",
        "created_at": datetime.utcnow().isoformat(),
        "started_at": None,
        "completed_at": None,
        "results": None,
        "error": None,
    }
    return job_id


def update_job_status(job_id: str, status: str, results: Optional[dict] = None, error: Optional[str] = None):
    job = _jobs.get(job_id)
    if not job:
        return
    job["status"] = status
    if status == "IN_PROGRESS" and not job["started_at"]:
        job["started_at"] = datetime.utcnow().isoformat()
    if status in ("COMPLETED", "FAILED"):
        job["completed_at"] = datetime.utcnow().isoformat()
    if results is not None:
        job["results"] = results
    if error is not None:
        job["error"] = error
    update_dict = {"id": job_id, "status": status}
    if results is not None:
        update_dict["output_results"] = json.dumps(results, ensure_ascii=False) if isinstance(results, dict) else results
    if error is not None:
        update_dict["error"] = error
    JobRepository.save(update_dict)


def find_latest_job_by_task(task_id: str, job_type: str):
    for job in reversed(list(_jobs.values())):
        if job.get("task_id") == task_id and job.get("task_type") == job_type:
            return job
    return None


def get_job(job_id: str):
    return _jobs.get(job_id)


def get_all_jobs():
    return _jobs

import os
import shutil
import tempfile
import logging
from typing import List, Optional, Tuple

logger = logging.getLogger(__name__)


class DecomposeTransaction:
    def __init__(self, operation_name: str = "decompose"):
        self.operation_name = operation_name
        self._delete_staging_dir: Optional[str] = None
        self._create_staging_dir: Optional[str] = None
        self._moved_for_delete: List[Tuple[str, str]] = []
        self._created_in_staging: List[str] = []
        self._created_task_ids: List[str] = []
        self._committed = False
        self._rolled_back = False

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type is not None and not self._committed and not self._rolled_back:
            self.rollback()
        self.cleanup()

    def begin(self):
        self._delete_staging_dir = tempfile.mkdtemp(prefix=f"brs_del_{self.operation_name}_")
        self._create_staging_dir = tempfile.mkdtemp(prefix=f"brs_new_{self.operation_name}_")
        logger.info(
            "[%s] Transaction started: delete_staging=%s, create_staging=%s",
            self.operation_name,
            self._delete_staging_dir,
            self._create_staging_dir,
        )

    def stage_delete_path(self, path: str) -> bool:
        if not path or not os.path.exists(path):
            return False
        if not self._delete_staging_dir:
            raise RuntimeError("Transaction not started; call begin() first")
        basename = os.path.basename(path)
        dest = os.path.join(self._delete_staging_dir, basename)
        counter = 1
        while os.path.exists(dest):
            dest = os.path.join(self._delete_staging_dir, f"{basename}_{counter}")
            counter += 1
        try:
            shutil.move(path, dest)
            self._moved_for_delete.append((path, dest))
            logger.debug("[%s] Staged delete: %s -> %s", self.operation_name, path, dest)
            return True
        except Exception as e:
            logger.error("[%s] Failed to stage delete for %s: %s", self.operation_name, path, e)
            raise

    def stage_delete_db_records(self, task_ids: List[str], api_url: Optional[str], headers: Optional[dict]) -> List[str]:
        from bridge_removal_task import _api_delete_task, _delete_task_local

        if not self._delete_staging_dir:
            raise RuntimeError("Transaction not started; call begin() first")

        deleted_ids = []
        snapshot_path = os.path.join(self._delete_staging_dir, "deleted_db_snapshots.jsonl")
        for task_id in task_ids:
            if not api_url:
                try:
                    from services.project_service import get_project
                    project = get_project(task_id)
                    if project:
                        with open(snapshot_path, "a", encoding="utf-8") as f:
                            f.write(json.dumps(project, ensure_ascii=False, default=str) + "\n")
                except Exception as snap_ex:
                    logger.warning("[%s] Failed to snapshot DB record %s: %s", self.operation_name, task_id, snap_ex)
            try:
                _api_delete_task(api_url, headers, task_id)
                if not api_url:
                    _delete_task_local(task_id)
                deleted_ids.append(task_id)
            except Exception as e:
                logger.error("[%s] Failed to delete DB record %s: %s", self.operation_name, task_id, e)
                raise
        return deleted_ids

    def get_create_staging_dir(self) -> str:
        if not self._create_staging_dir:
            raise RuntimeError("Transaction not started; call begin() first")
        return self._create_staging_dir

    def commit(self):
        if self._committed or self._rolled_back:
            return
        logger.info("[%s] Committing transaction...", self.operation_name)

        if self._create_staging_dir and os.path.isdir(self._create_staging_dir):
            items = os.listdir(self._create_staging_dir)
            if items:
                logger.warning(
                    "[%s] Create staging dir has %d items but no target dir set; "
                    "items will be cleaned up on cleanup()",
                    self.operation_name,
                    len(items),
                )

        if self._delete_staging_dir and os.path.isdir(self._delete_staging_dir):
            try:
                shutil.rmtree(self._delete_staging_dir, ignore_errors=True)
                logger.info("[%s] Delete staging dir cleaned up", self.operation_name)
            except Exception as e:
                logger.warning("[%s] Failed to clean delete staging dir: %s", self.operation_name, e)

        self._moved_for_delete.clear()
        self._committed = True
        logger.info("[%s] Transaction committed", self.operation_name)

    def commit_create_to_target(self, target_dir: str):
        if not self._create_staging_dir or not os.path.isdir(self._create_staging_dir):
            return
        items = os.listdir(self._create_staging_dir)
        if not items:
            return
        os.makedirs(target_dir, exist_ok=True)
        for item in items:
            src = os.path.join(self._create_staging_dir, item)
            dst = os.path.join(target_dir, item)
            if os.path.exists(dst):
                if os.path.isdir(dst):
                    shutil.rmtree(dst)
                else:
                    os.remove(dst)
            shutil.move(src, dst)
            logger.debug("[%s] Moved created item: %s -> %s", self.operation_name, src, dst)

    def rollback(self):
        if self._committed or self._rolled_back:
            return
        self._rolled_back = True
        logger.info("[%s] Rolling back transaction...", self.operation_name)

        snapshot_path = os.path.join(self._delete_staging_dir or "", "deleted_db_snapshots.jsonl")
        if self._delete_staging_dir and os.path.exists(snapshot_path):
            try:
                from services.project_service import set_project
                with open(snapshot_path, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if not line:
                            continue
                        try:
                            project = json.loads(line)
                            project_id = project.get("project_id") or project.get("id")
                            if project_id:
                                set_project(project_id, project)
                                logger.debug("[%s] Restored DB record: %s", self.operation_name, project_id)
                        except Exception as rec_ex:
                            logger.error("[%s] Failed to restore DB record from snapshot: %s", self.operation_name, rec_ex)
                logger.info("[%s] DB records restored from snapshot", self.operation_name)
            except Exception as snap_ex:
                logger.error("[%s] Failed to read DB snapshot for rollback: %s", self.operation_name, snap_ex)

        for original_path, staging_path in reversed(self._moved_for_delete):
            if os.path.exists(staging_path):
                try:
                    if os.path.exists(original_path):
                        if os.path.isdir(original_path):
                            shutil.rmtree(original_path)
                        else:
                            os.remove(original_path)
                    shutil.move(staging_path, original_path)
                    logger.debug("[%s] Restored: %s <- %s", self.operation_name, original_path, staging_path)
                except Exception as e:
                    logger.error(
                        "[%s] CRITICAL: Failed to restore %s from %s: %s",
                        self.operation_name,
                        original_path,
                        staging_path,
                        e,
                    )

        if self._created_task_ids:
            from bridge_removal_task import _api_delete_task, _delete_task_local
            for tid in self._created_task_ids:
                try:
                    _api_delete_task(None, None, tid)
                    _delete_task_local(tid)
                    logger.debug("[%s] Cleaned up newly created task on rollback: %s", self.operation_name, tid)
                except Exception as cleanup_ex:
                    logger.warning("[%s] Failed to clean up newly created task %s on rollback: %s", self.operation_name, tid, cleanup_ex)
            logger.info("[%s] Cleaned up %d newly created tasks on rollback", self.operation_name, len(self._created_task_ids))

        if self._create_staging_dir and os.path.isdir(self._create_staging_dir):
            try:
                shutil.rmtree(self._create_staging_dir, ignore_errors=True)
                logger.info("[%s] Create staging dir cleaned up on rollback", self.operation_name)
            except Exception as e:
                logger.warning("[%s] Failed to clean create staging dir on rollback: %s", self.operation_name, e)

        logger.info("[%s] Transaction rolled back", self.operation_name)

    def cleanup(self):
        if not self._committed and not self._rolled_back:
            self.rollback()
        for d in (self._delete_staging_dir, self._create_staging_dir):
            if d and os.path.isdir(d):
                try:
                    shutil.rmtree(d, ignore_errors=True)
                except Exception:
                    pass
        self._delete_staging_dir = None
        self._create_staging_dir = None

    @property
    def is_committed(self) -> bool:
        return self._committed

    @property
    def is_rolled_back(self) -> bool:
        return self._rolled_back

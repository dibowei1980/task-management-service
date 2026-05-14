import logging
from abc import ABC, abstractmethod

logger = logging.getLogger("brs.task")


class BaseTask(ABC):

    def __init__(self, task_id, input_params):
        self.task_id = task_id
        self.input_params = input_params
        self.status = "PENDING"
        self.results = {}

    @abstractmethod
    def execute(self) -> None:
        pass

    def get_status(self) -> str:
        return self.status

    def get_results(self) -> dict:
        return self.results

    def _log(self, message):
        logger.info("[%s] %s", self.task_id, message)

    def run(self) -> None:
        self.status = "IN_PROGRESS"
        self._log("任务开始执行...")
        try:
            self.execute()
            self.status = "COMPLETED"
            self._log("任务执行成功。")
        except Exception as e:
            self.status = "FAILED"
            self.results["error"] = str(e)
            self._log(f"任务执行失败: {e}")

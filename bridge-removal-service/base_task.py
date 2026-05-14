
import json
from abc import ABC, abstractmethod

class BaseTask(ABC):
    """
    所有自动化任务脚本的抽象基类。
    定义了任务执行的标准接口，确保所有任务都能被Java主服务以统一的方式调用。
    """

    def __init__(self, task_id, input_params):
        """
        构造函数

        :param task_id: 任务的唯一标识符 (UUID)
        :param input_params: 从Java服务传递过来的输入参数 (dict)
        """
        self.task_id = task_id
        self.input_params = input_params
        self.status = "PENDING"
        self.results = {}

    @abstractmethod
    def execute(self):
        """
        核心执行方法，所有子类必须实现此方法。
        该方法应包含任务的主要业务逻辑。
        """
        pass

    def get_status(self):
        """
        获取当前任务状态。
        """
        return self.status

    def get_results(self):
        """
        获取任务执行的结果。
        结果应该是一个可以被序列化为JSON的字典。
        """
        return self.results

    def _log(self, message):
        """
        内部日志记录方法。
        将日志信息以特定格式打印到标准输出，以便于外部进程捕获。
        """
        print(f"[LOG] {self.task_id}: {message}")

    def run(self):
        """
        任务的统一入口方法。
        它负责执行任务、处理异常并返回最终结果。
        """
        self._log("任务开始执行...")
        self.status = "IN_PROGRESS"
        try:
            self.execute()
            self.status = "COMPLETED"
            self._log("任务执行成功。")
        except Exception as e:
            self.status = "FAILED"
            self.results["error"] = str(e)
            self._log(f"任务执行失败: {e}")
        
        final_output = {
            "taskId": self.task_id,
            "status": self.status,
            "results": self.results
        }
        
        # 将最终结果以JSON格式打印到标准输出
        print(json.dumps(final_output))


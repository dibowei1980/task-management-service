import http.client
import json
import sys
import time
import requests
import threading
import os
import hashlib
import uuid

_DEFAULT_API_BASE = "https://www.runninghub.cn"

def _get_api_base():
    base = os.getenv("RUNNINGHUB_API_BASE", "").strip()
    return base if base else _DEFAULT_API_BASE

def _parse_api_base(base):
    if base.startswith("https://"):
        scheme = "https"
        host = base[len("https://"):].rstrip("/")
    elif base.startswith("http://"):
        scheme = "http"
        host = base[len("http://"):].rstrip("/")
    else:
        scheme = "https"
        host = base.rstrip("/")
    return scheme, host

def _make_connection(host, scheme="https"):
    if scheme == "https":
        return http.client.HTTPSConnection(host)
    return http.client.HTTPConnection(host)

def _make_url(base, path):
    return f"{base.rstrip('/')}/{path.lstrip('/')}"
def get_nodo(webappId,Api_Key):
    scheme, host = _parse_api_base(_get_api_base())
    conn = _make_connection(host, scheme)
    payload = ''
    headers = {'Host': host}
    conn.request("GET", f"/api/webapp/apiCallDemo?apiKey={Api_Key}&webappId={webappId}", payload, headers)
    res = conn.getresponse()
    # 读取响应内容
    data = res.read()
    # 转成 Python 字典
    data_json = json.loads(data.decode("utf-8"))
    # 取出 nodeInfoList
    node_info_list = data_json.get("data", {}).get("nodeInfoList", [])
    print("✅ 提取的 nodeInfoList:")
    print(json.dumps(node_info_list, indent=2, ensure_ascii=False))
    return node_info_list
def upload_file(API_KEY, file_path):
    """
    上传文件到 RunningHub 平台
    """
    base = _get_api_base()
    scheme, host = _parse_api_base(base)
    url = _make_url(base, "/task/openapi/upload")
    headers = {
        'Host': host
    }
    data = {
        'apiKey': API_KEY,
        'fileType': 'input'
    }
    with open(file_path, 'rb') as f:
        files = {'file': f}
        response = requests.post(url, headers=headers, files=files, data=data)
    return response.json()
# 1️⃣ 提交任务
def submit_task(webapp_id, node_info_list,API_KEY):
    scheme, host = _parse_api_base(_get_api_base())
    conn = _make_connection(host, scheme)
    payload = json.dumps({
        "webappId": webapp_id,
        "apiKey": API_KEY,
        # "quickCreateCode": quick_create_code,
        "nodeInfoList": node_info_list
    })
    headers = {
        'Host': host,
        'Content-Type': 'application/json'
    }
    conn.request("POST", "/task/openapi/ai-app/run", payload, headers)
    res = conn.getresponse()
    data = json.loads(res.read().decode("utf-8"))
    conn.close()
    return data
def query_task_outputs(task_id,API_KEY):
    scheme, host = _parse_api_base(_get_api_base())
    conn = _make_connection(host, scheme)
    payload = json.dumps({
        "apiKey": API_KEY,
        "taskId": task_id
    })
    headers = {
        'Host': host,
        'Content-Type': 'application/json'
    }
    conn.request("POST", "/task/openapi/outputs", payload, headers)
    res = conn.getresponse()
    data = json.loads(res.read().decode("utf-8"))
    conn.close()
    return data

def query_task_status(task_id, API_KEY):
    scheme, host = _parse_api_base(_get_api_base())
    conn = _make_connection(host, scheme)
    payload = json.dumps({
        "apiKey": API_KEY,
        "taskId": task_id
    })
    headers = {
        'Host': host,
        'Content-Type': 'application/json'
    }
    conn.request("POST", "/task/openapi/status", payload, headers)
    res = conn.getresponse()
    data = json.loads(res.read().decode("utf-8"))
    conn.close()
    return data

def cancel_task(task_id, API_KEY):
    scheme, host = _parse_api_base(_get_api_base())
    conn = _make_connection(host, scheme)
    payload = json.dumps({
        "apiKey": API_KEY,
        "taskId": task_id
    })
    headers = {
        'Host': host,
        'Content-Type': 'application/json'
    }
    conn.request("POST", "/task/openapi/cancel", payload, headers)
    data = json.loads(conn.getresponse().read().decode("utf-8"))
    conn.close()
    return data

class TaskPollError(Exception):
    def __init__(self, task_id, status, reason, source=None):
        super().__init__(reason)
        self.task_id = task_id
        self.status = status
        self.reason = reason
        self.source = source

def _payload_text(payload):
    if payload is None:
        return ""
    if isinstance(payload, (dict, list)):
        try:
            return json.dumps(payload, ensure_ascii=False)
        except Exception:
            return str(payload)
    return str(payload)

def _is_task_not_found(payload):
    text = _payload_text(payload)
    return "APIKEY_TASK_NOT_FOUN" in text or "APIKEY_TASK_NOT_FOUND" in text

def _resolve_download_url(file_url, api_key):
    if file_url.startswith("http://") or file_url.startswith("https://"):
        url = file_url
    else:
        base = _get_api_base()
        url = f"{base.rstrip('/')}/{file_url.lstrip('/')}"
    sep = "&" if "?" in url else "?"
    url = f"{url}{sep}apiKey={api_key}"
    return url

def _poll_task_result(api_key, task_id, output_path, timeout=600, poll_interval=5):
    start_time = time.time()
    last_error = None
    while True:
        if not is_task_tracked(task_id, api_key):
            raise TaskPollError(task_id, "cancelled", "任务已取消", "local")
        status_payload = None
        try:
            status_payload = query_task_status(task_id, api_key)
        except Exception as e:
            last_error = str(e)
        if _is_task_not_found(status_payload):
            raise TaskPollError(task_id, "cancelled", "远程取消", "runninghub")
        outputs_payload = None
        try:
            outputs_payload = query_task_outputs(task_id, api_key)
        except Exception as e:
            last_error = str(e)
        if _is_task_not_found(outputs_payload):
            raise TaskPollError(task_id, "cancelled", "远程取消", "runninghub")
        if outputs_payload:
            code = outputs_payload.get("code") if isinstance(outputs_payload, dict) else None
            data = outputs_payload.get("data") if isinstance(outputs_payload, dict) else None
            if code == 0 and data:
                file_url = data[0].get("fileUrl") if isinstance(data, list) and data else None
                if not file_url:
                    last_error = f"未返回fileUrl: {outputs_payload}"
                else:
                    try:
                        download_url = _resolve_download_url(file_url, api_key)
                        response = requests.get(download_url, timeout=60)
                        response.raise_for_status()
                        with open(output_path, "wb") as f:
                            f.write(response.content)
                        return output_path
                    except Exception as e:
                        last_error = str(e)
            if code == 805:
                failed_reason = data.get("failedReason") if isinstance(data, dict) else None
                raise TaskPollError(task_id, "failed", failed_reason or "任务失败", "runninghub")
        if time.time() - start_time > timeout:
            reason = last_error or "等待超时（超过10分钟），任务未完成"
            raise TaskPollError(task_id, "failed", reason, "timeout")
        time.sleep(poll_interval)

class TaskPool:
    def __init__(self, max_slots=3):
        self.max_slots = max_slots
        self._semaphore = threading.Semaphore(max_slots)
        self._queue = []
        self._lock = threading.Lock()
        self._threads = []

    def add_task(self, func, *args, **kwargs):
        with self._lock:
            self._queue.append((func, args, kwargs))
        self.run_pending()

    def run_pending(self):
        while self._try_start_one():
            pass

    def _try_start_one(self):
        if not self._semaphore.acquire(blocking=False):
            return False
        with self._lock:
            if not self._queue:
                self._semaphore.release()
                return False
            func, args, kwargs = self._queue.pop(0)
        thread = threading.Thread(target=self._run_task, args=(func, args, kwargs))
        with self._lock:
            self._threads.append(thread)
        thread.start()
        return True

    def _run_task(self, func, args, kwargs):
        try:
            func(*args, **kwargs)
        finally:
            self._semaphore.release()
            self.run_pending()

    def wait_all(self):
        while True:
            with self._lock:
                threads = list(self._threads)
                pending = bool(self._queue)
            for thread in threads:
                thread.join()
            with self._lock:
                running = any(t.is_alive() for t in self._threads)
            if not pending and not running:
                return
            time.sleep(0.1)

    def clear_pending(self):
        with self._lock:
            self._queue.clear()

_MAX_SLOTS = int(os.getenv("RUNNINGHUB_MAX_SLOTS", "3"))
_GLOBAL_POOL = TaskPool(max_slots=_MAX_SLOTS)
_SUBMITTED_TASKS = set()
_SUBMITTED_LOCK = threading.Lock()

def _task_cache_path(api_key):
    base_dir = os.path.dirname(os.path.abspath(__file__))
    key_hash = hashlib.sha256(api_key.encode("utf-8")).hexdigest()
    return os.path.join(base_dir, f".runninghub_tasks_{key_hash}.json")

def _load_task_cache(api_key):
    path = _task_cache_path(api_key)
    if not os.path.exists(path):
        return []
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, list):
            return data
    except Exception:
        return []
    return []

def _save_task_cache(api_key, items):
    path = _task_cache_path(api_key)
    tmp_path = f"{path}.tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=False)
    os.replace(tmp_path, path)

def register_task(task_id, api_key=None, job_id=None):
    with _SUBMITTED_LOCK:
        _SUBMITTED_TASKS.add(task_id)
    if api_key:
        items = _load_task_cache(api_key)
        exists = any(str(i.get("task_id")) == str(task_id) for i in items if isinstance(i, dict))
        if not exists:
            entry = {"task_id": str(task_id)}
            if job_id:
                entry["job_id"] = str(job_id)
            entry["created_at"] = int(time.time())
            items.append(entry)
            _save_task_cache(api_key, items)

def unregister_task(task_id, api_key=None):
    with _SUBMITTED_LOCK:
        _SUBMITTED_TASKS.discard(task_id)
    if api_key:
        items = _load_task_cache(api_key)
        items = [i for i in items if not (isinstance(i, dict) and str(i.get("task_id")) == str(task_id))]
        _save_task_cache(api_key, items)

def is_task_tracked(task_id, api_key=None):
    if api_key:
        items = _load_task_cache(api_key)
        exists = any(str(i.get("task_id")) == str(task_id) for i in items if isinstance(i, dict))
        if not exists:
            with _SUBMITTED_LOCK:
                _SUBMITTED_TASKS.discard(task_id)
        else:
            with _SUBMITTED_LOCK:
                _SUBMITTED_TASKS.add(task_id)
        return exists
    with _SUBMITTED_LOCK:
        return task_id in _SUBMITTED_TASKS

def list_tracked_tasks(api_key=None, job_id=None):
    if api_key:
        items = _load_task_cache(api_key)
        tasks = []
        for item in items:
            if not isinstance(item, dict):
                continue
            if job_id and str(item.get("job_id")) != str(job_id):
                continue
            task = item.get("task_id")
            if task:
                tasks.append(str(task))
        return tasks
    with _SUBMITTED_LOCK:
        return list(_SUBMITTED_TASKS)

def run_with_pool(func, *args, **kwargs):
    result = {"value": None, "error": None}
    done = threading.Event()
    def runner():
        try:
            result["value"] = func(*args, **kwargs)
        except Exception as e:
            result["error"] = e
        finally:
            done.set()
    _GLOBAL_POOL.add_task(runner)
    done.wait()
    if result["error"] is not None:
        raise result["error"]
    return result["value"]

def run_batch_with_pool(func, args_list):
    results = [None] * len(args_list)
    errors = [None] * len(args_list)
    events = [threading.Event() for _ in args_list]
    for idx, args in enumerate(args_list):
        def runner(i=idx, a=args):
            try:
                results[i] = func(*a)
            except Exception as e:
                errors[i] = e
            finally:
                events[i].set()
        _GLOBAL_POOL.add_task(runner)
    for ev in events:
        ev.wait()
    return results, errors

def _summarize_errors(errors):
    summary = []
    for err in errors:
        if err is None:
            continue
        if isinstance(err, TaskPollError):
            if err.status == "cancelled":
                summary.append({
                    "task_id": err.task_id or "",
                    "status": "cancelled",
                    "source": err.source or "unknown"
                })
            else:
                summary.append({
                    "task_id": err.task_id or "",
                    "status": "failed",
                    "reason": err.reason
                })
            continue
        summary.append({
            "task_id": "",
            "status": "failed",
            "reason": str(err)
        })
    return summary

def _aggregate_batch_results(batch_id, results, errors):
    output_paths = [r for r in results if r]
    summary = _summarize_errors(errors)
    if not output_paths:
        message = f"批次{batch_id}全部失败或取消，任务列表:{summary}"
        payload = {
            "error_code": "BATCH_ALL_FAILED",
            "error_message": message,
            "batch_id": batch_id,
            "failed_tasks": summary
        }
        return False, payload
    payload = {"output_paths": output_paths}
    if summary:
        payload["failed_summary"] = summary
    return True, payload

def clear_pool_and_cancel_runninghub_tasks(api_key, job_id=None):
    _GLOBAL_POOL.clear_pending()
    tasks = list_tracked_tasks(api_key, job_id)
    results = []
    for task_id in tasks:
        try:
            res = cancel_task(task_id, api_key)
        except Exception as e:
            res = {"error": str(e)}
        results.append({"task_id": task_id, "result": res})
        unregister_task(task_id, api_key)
    return results

def qwen_bridge_removal(api_key, original_image_path, removal_mask_path, crop_mask_path, output_path, seed="",  job_id=""):
    webapp_id = "2029163935819108353"
    node_info_list = get_nodo(webapp_id, api_key)
    if not node_info_list:
        raise RuntimeError("无法获取节点信息")

    uploads = {
        "15": original_image_path,
        "37": removal_mask_path,
        "45": crop_mask_path,
        # "73": 1,
        # "74": 0,
    }
    if seed:
        uploads["70"] = seed
    for node_id, value in uploads.items():
        if(node_id in ["15","37","45"]):
            file_path = value
            upload_result = upload_file(api_key, file_path)
            if not upload_result or upload_result.get("msg") != "success":
                raise RuntimeError(f"上传失败 nodeId={node_id}: {upload_result}")
            file_name = upload_result.get("data", {}).get("fileName")
            if not file_name:
                raise RuntimeError(f"上传结果缺少fileName nodeId={node_id}: {upload_result}")
            data = file_name
        else:
            data = value
        matched = False
        for node in node_info_list:
            if str(node.get("nodeId")) == str(node_id):
                node["fieldValue"] = data
                matched = True
        if not matched:
            raise RuntimeError(f"未找到可写入的节点 nodeId={node_id}")

    max_retries = int(os.getenv("RUNNINGHUB_QUEUE_RETRY", "60"))
    retry_interval = float(os.getenv("RUNNINGHUB_QUEUE_RETRY_INTERVAL", "5"))
    submit_result = None
    attempt = 0
    while True:
        submit_result = submit_task(webapp_id, node_info_list, api_key)
        code = submit_result.get("code") if isinstance(submit_result, dict) else None
        msg = submit_result.get("msg") if isinstance(submit_result, dict) else None
        if code == 0:
            break
        if code == 421 and msg == "TASK_QUEUE_MAXED" and attempt < max_retries:
            attempt += 1
            time.sleep(retry_interval)
            continue
        raise RuntimeError(f"任务提交失败: {submit_result}")
    task_id = submit_result["data"]["taskId"]
    register_task(task_id, api_key, job_id)

    try:
        return _poll_task_result(api_key, task_id, output_path)
    finally:
        unregister_task(task_id, api_key)

def main():
    if len(sys.argv) < 6:
        if len(sys.argv) >= 3 and sys.argv[1] == "cancel":
            api_key = sys.argv[2]
            job_id = sys.argv[3] if len(sys.argv) > 3 else ""
            result = clear_pool_and_cancel_runninghub_tasks(api_key, job_id or None)
            print(json.dumps({"cancelled": result}, ensure_ascii=False))
            return
        raise RuntimeError("参数不足: api_key original_image_path removal_mask_path crop_mask_path output_path_or_dir [count] [seed]")
    if sys.argv[1] == "cancel":
        api_key = sys.argv[2] if len(sys.argv) > 2 else ""
        if not api_key:
            raise RuntimeError("参数不足: cancel api_key")
        job_id = sys.argv[3] if len(sys.argv) > 3 else ""
        result = clear_pool_and_cancel_runninghub_tasks(api_key, job_id or None)
        print(json.dumps({"cancelled": result}, ensure_ascii=False))
        return
    api_key = sys.argv[1]
    original_image_path = sys.argv[2]
    removal_mask_path = sys.argv[3]
    crop_mask_path = sys.argv[4]
    output_arg = sys.argv[5]
    count = 1
    seed = ""
    job_id = ""
    if len(sys.argv) > 6:
        if sys.argv[6].isdigit():
            count = max(1, int(sys.argv[6]))
            if len(sys.argv) > 7:
                seed = sys.argv[7]
            if len(sys.argv) > 8:
                job_id = sys.argv[8]
        else:
            seed = sys.argv[6]
            if len(sys.argv) > 7:
                job_id = sys.argv[7]
    if count <= 1:
        try:
            result_path = run_with_pool(qwen_bridge_removal, api_key, original_image_path, removal_mask_path, crop_mask_path, output_arg, seed, job_id)
            print(json.dumps({"output_path": result_path}, ensure_ascii=False))
            return
        except TaskPollError as e:
            if e.status == "cancelled" and e.reason == "远程取消":
                payload = {
                    "error_code": "REMOTE_CANCELLED",
                    "error_message": "远程取消",
                    "task_id": e.task_id or ""
                }
                print(json.dumps(payload, ensure_ascii=False))
                return
            payload = {
                "error_code": "TASK_FAILED",
                "error_message": e.reason,
                "task_id": e.task_id or ""
            }
            print(json.dumps(payload, ensure_ascii=False))
            return
    os.makedirs(output_arg, exist_ok=True)
    args_list = []
    for i in range(1, count + 1):
        out_path = os.path.join(output_arg, f"{i}.png")
        args_list.append((api_key, original_image_path, removal_mask_path, crop_mask_path, out_path, seed, job_id))
    results, errors = run_batch_with_pool(qwen_bridge_removal, args_list)
    batch_id = job_id or str(uuid.uuid4())
    success, payload = _aggregate_batch_results(batch_id, results, errors)
    print(json.dumps(payload, ensure_ascii=False))
    if success:
        return
    return

if __name__ == "__main__":
    main()


# RunningHub 云端 API 接口规范

> 基地址：`https://www.runninghub.cn`（可通过 `RUNNINGHUB_API_BASE` 环境变量覆盖）
> 认证方式：所有请求通过 `apiKey` 参数传递，无需 Cookie/Session

---

## 1. 获取节点信息

**用途**：获取 WebApp 的工作流节点列表（nodeInfoList），后续上传和提交都需要此列表。

```http
GET /api/webapp/apiCallDemo?apiKey={API_KEY}&webappId={WEBAPP_ID}
```

**请求参数**（Query String）：

| 参数 | 类型 | 说明 |
|------|------|------|
| apiKey | string | API 密钥 |
| webappId | string | 工作流 ID，当前硬编码为 `2029163935819108353` |

**成功响应**：

```json
{
  "data": {
    "nodeInfoList": [
      {
        "nodeId": "15",
        "nodeName": "LoadImage",
        "fieldName": "image",
        "fieldType": "IMAGE",
        "fieldValue": null,
        "displayName": "输入图片",
        "required": true,
        "editable": true
      },
      {
        "nodeId": "37",
        "fieldName": "...",
        "fieldType": "IMAGE",
        "fieldValue": null
      },
      {
        "nodeId": "45",
        "fieldName": "...",
        "fieldType": "IMAGE",
        "fieldValue": null
      },
      {
        "nodeId": "70",
        "fieldName": "seed",
        "fieldType": "string",
        "fieldValue": null
      }
    ]
  }
}
```

**代码解析方式**：`response["data"]["nodeInfoList"]` → 返回 list

---

## 2. 上传文件

**用途**：上传原图/掩膜图片，获取服务器端文件名（fileName），用于填入 nodeInfoList 的 fieldValue。

```http
POST /task/openapi/upload
Content-Type: multipart/form-data
```

**请求参数**（Form Data）：

| 参数 | 类型 | 说明 |
|------|------|------|
| apiKey | string | API 密钥 |
| fileType | string | 固定值 `"input"` |
| file | binary | 上传的文件 |

**Headers**：`Host: {host}`

**成功响应**：

```json
{
  "msg": "success",
  "data": {
    "fileName": "4fd8ad14-31ce-4ad8-9c7c-8c4b7f66a53d.png"
  }
}
```

**代码解析方式**：
- 判断成功：`response.get("msg") == "success"`
- 提取文件名：`response.get("data", {}).get("fileName")`

---

## 3. 提交任务

**用途**：将填充好 fieldValue 的 nodeInfoList 提交执行。

```http
POST /task/openapi/ai-app/run
Content-Type: application/json
```

**请求体**：

```json
{
  "webappId": "2029163935819108353",
  "apiKey": "xxx",
  "nodeInfoList": [
    {
      "nodeId": "15",
      "fieldName": "image",
      "fieldType": "IMAGE",
      "fieldValue": "4fd8ad14-31ce-4ad8-9c7c-8c4b7f66a53d.png",
      "displayName": "输入图片",
      "required": true,
      "editable": true
    },
    {
      "nodeId": "37",
      "fieldType": "IMAGE",
      "fieldValue": "上传后的fileName"
    },
    {
      "nodeId": "45",
      "fieldType": "IMAGE",
      "fieldValue": "上传后的fileName"
    },
    {
      "nodeId": "70",
      "fieldType": "string",
      "fieldValue": "42"
    }
  ]
}
```

**Headers**：`Host: {host}`, `Content-Type: application/json`

**成功响应**（code=0）：

```json
{
  "code": 0,
  "data": {
    "taskId": "10001"
  }
}
```

**队列满响应**（code=421，需重试）：

```json
{
  "code": 421,
  "msg": "TASK_QUEUE_MAXED"
}
```

**代码解析方式**：
- 判断成功：`response.get("code") == 0`
- 提取任务 ID：`response["data"]["taskId"]`
- 队列满重试：`code == 421 and msg == "TASK_QUEUE_MAXED"`，最多重试 `RUNNINGHUB_QUEUE_RETRY` 次（默认60），间隔 `RUNNINGHUB_QUEUE_RETRY_INTERVAL` 秒（默认5）

---

## 4. 查询任务状态

**用途**：轮询检查任务是否完成（代码中实际主要用于检测任务是否被远程取消）。

```http
POST /task/openapi/status
Content-Type: application/json
```

**请求体**：

```json
{
  "apiKey": "xxx",
  "taskId": "10001"
}
```

**Headers**：`Host: {host}`, `Content-Type: application/json`

**响应**：代码中未详细解析此接口的响应内容，仅用于检测是否包含 `"APIKEY_TASK_NOT_FOUND"` 字符串来判断远程取消。

---

## 5. 查询任务输出

**用途**：轮询获取任务输出结果，包含输出文件的下载 URL。

```http
POST /task/openapi/outputs
Content-Type: application/json
```

**请求体**：

```json
{
  "apiKey": "xxx",
  "taskId": "10001"
}
```

**Headers**：`Host: {host}`, `Content-Type: application/json`

**成功响应**（code=0，任务完成有输出）：

```json
{
  "code": 0,
  "data": [
    {
      "fileUrl": "https://www.runninghub.cn/task/openapi/output/xxx/result.png"
    }
  ]
}
```

**任务失败响应**（code=805）：

```json
{
  "code": 805,
  "data": {
    "failedReason": "执行超时"
  }
}
```

**代码解析方式**：
- 判断有输出：`response.get("code") == 0 and response.get("data")`
- 提取下载 URL：`response["data"][0]["fileUrl"]`（data 是数组）
- 判断任务失败：`response.get("code") == 805`
- 提取失败原因：`response["data"].get("failedReason")`
- 下载结果：直接 GET `fileUrl`，将响应内容写入本地文件

---

## 6. 取消任务

**用途**：取消正在运行的任务。

```http
POST /task/openapi/cancel
Content-Type: application/json
```

**请求体**：

```json
{
  "apiKey": "xxx",
  "taskId": "10001"
}
```

**Headers**：`Host: {host}`, `Content-Type: application/json`

**响应**：代码中未详细解析此接口的响应内容。

---

## 7. 特殊判断逻辑

**任务不存在/远程取消检测**：代码检查响应文本中是否包含 `"APIKEY_TASK_NOT_FOUND"`（注意代码中有个拼写 `"APIKEY_TASK_NOT_FOUN"` 也被检查，这是容错处理）。

```python
def _is_task_not_found(payload):
    text = _payload_text(payload)
    return "APIKEY_TASK_NOT_FOUN" in text or "APIKEY_TASK_NOT_FOUND" in text
```

---

## 8. 完整调用流程

```
1. get_nodo(webappId, apiKey)
   → GET /api/webapp/apiCallDemo?apiKey=xxx&webappId=xxx
   → 获取 nodeInfoList

2. upload_file(apiKey, filePath) × 3次
   → POST /task/openapi/upload  (apiKey + fileType="input" + file)
   → 获取 fileName，填入 nodeInfoList 对应节点的 fieldValue

3. submit_task(webappId, nodeInfoList, apiKey)
   → POST /task/openapi/ai-app/run  (webappId + apiKey + nodeInfoList)
   → 获取 taskId
   → 如果 code=421 (队列满)，重试

4. _poll_task_result(apiKey, taskId, outputPath)
   → 循环轮询：
     a. query_task_status(taskId, apiKey)
        → POST /task/openapi/status  (apiKey + taskId)
        → 检测是否包含 APIKEY_TASK_NOT_FOUND
     b. query_task_outputs(taskId, apiKey)
        → POST /task/openapi/outputs  (apiKey + taskId)
        → code=0: 从 data[0].fileUrl 下载结果
        → code=805: 任务失败，抛出 TaskPollError
   → 超时: 600秒

5. cancel_task(taskId, apiKey)
   → POST /task/openapi/cancel  (apiKey + taskId)
```

---

## 9. 环境变量汇总

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `RUNNINGHUB_API_BASE` | `https://www.runninghub.cn` | API 根地址 |
| `RUNNINGHUB_API_KEY` | 无 | API 密钥（也可通过 input_params 传入） |
| `RUNNINGHUB_MAX_SLOTS` | `3` | 并发槽位数 |
| `RUNNINGHUB_QUEUE_RETRY` | `60` | 队列满时最大重试次数 |
| `RUNNINGHUB_QUEUE_RETRY_INTERVAL` | `5` | 队列满重试间隔（秒） |

---

## 10. 关键响应码汇总

| code | 含义 | 处理方式 |
|------|------|---------|
| `0` | 成功 | 正常解析 data |
| `421` | 队列满 | 重试（msg="TASK_QUEUE_MAXED"） |
| `805` | 任务失败 | 抛出 TaskPollError，读取 data.failedReason |
| 响应含 `APIKEY_TASK_NOT_FOUND` | 任务不存在/被远程取消 | 抛出 TaskPollError(status="cancelled") |

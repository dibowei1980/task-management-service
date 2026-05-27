# RunningHub Webapp 配置规范

## 概述

RunningHub webapp 调用模块已重构为配置驱动架构。所有 webapp 的 ID、节点映射、默认参数等信息均通过 JSON 配置文件管理，无需修改代码即可新增或调整 webapp 配置。

## 配置文件

### 文件位置

默认路径：`bridge_removal/runninghub_webapps.json`

可通过环境变量 `RUNNINGHUB_CONFIG_PATH` 指定自定义路径。

### 文件格式

```json
{
  "version": "1.0",
  "webapps": {
    "<webapp_name>": {
      "webapp_id": "<RunningHub webapp ID>",
      "description": "<描述>",
      "nodes": {
        "<node_id>": {
          "label": "<参数标签名>",
          "description": "<参数描述>",
          "type": "<file | string | number | boolean>",
          "required": true,
          "upload": false,
          "default": null
        }
      },
      "defaults": {
        "<label>": "<默认值>"
      },
      "queue_retry": 60,
      "queue_retry_interval": 5.0
    }
  }
}
```

### 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `version` | string | 是 | 配置版本号，当前为 `"1.0"` |
| `webapps` | object | 是 | webapp 配置映射，key 为 webapp 名称 |
| `webapps.<name>.webapp_id` | string | 是 | RunningHub 平台的 webapp ID |
| `webapps.<name>.description` | string | 否 | webapp 功能描述 |
| `webapps.<name>.nodes` | object | 是 | 节点参数定义，key 为节点 ID |
| `webapps.<name>.nodes.<id>.label` | string | 否 | 参数标签，用于 `run_webapp()` 的 params 映射 |
| `webapps.<name>.nodes.<id>.type` | string | 是 | 参数类型：`file`、`string`、`number`、`boolean` |
| `webapps.<name>.nodes.<id>.required` | boolean | 是 | 是否必填 |
| `webapps.<name>.nodes.<id>.upload` | boolean | 否 | 是否需要上传文件（type=file 时应为 true） |
| `webapps.<name>.nodes.<id>.default` | any | 否 | 默认值 |
| `webapps.<name>.defaults` | object | 否 | 全局默认参数，key 为 label |
| `webapps.<name>.queue_retry` | integer | 否 | 队列满时最大重试次数（默认 60） |
| `webapps.<name>.queue_retry_interval` | float | 否 | 队列满重试间隔秒数（默认 5.0） |

### 约束

- `webapp_id` 在配置文件中必须唯一
- 每个 node 必须有 `type` 和 `required` 字段
- `type=file` 的节点应设置 `upload=true`

## 调用流程

### 通用接口 `run_webapp()`

```python
from bridge_removal.inpaint_gen_Runninghub import run_webapp

result_path = run_webapp(
    api_key="your_api_key",
    webapp_name="bridge_removal",
    params={
        "original_image": "/path/to/image.png",
        "removal_mask": "/path/to/mask.png",
        "crop_mask": "/path/to/crop.png",
        "seed": "42",           # 可选，覆盖默认值
    },
    output_path="/path/to/output.png",
    job_id="optional_job_id",
)
```

### 参数填充规则

1. 从配置文件的 `defaults` 中获取默认参数值
2. 用 `params` 中的值覆盖默认值（仅当 params 中的值非 None 且非空字符串时）
3. 未在 params 中提供的参数保留默认值

### 向后兼容接口 `qwen_bridge_removal()`

原有的 `qwen_bridge_removal()` 函数保持不变，内部自动转换为 `run_webapp()` 调用：

```python
from bridge_removal.inpaint_gen_Runninghub import qwen_bridge_removal

result_path = qwen_bridge_removal(
    api_key, original_image_path, removal_mask_path,
    crop_mask_path, output_path, seed="", job_id=""
)
```

## 配置管理 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/runninghub/webapps` | 列出所有 webapp 配置 |
| GET | `/api/runninghub/webapps/<name>` | 获取指定 webapp 配置 |
| POST | `/api/runninghub/webapps` | 新增 webapp 配置 |
| PATCH | `/api/runninghub/webapps/<name>` | 更新 webapp 配置 |
| DELETE | `/api/runninghub/webapps/<name>` | 删除 webapp 配置 |
| POST | `/api/runninghub/config/reload` | 强制重新加载配置文件 |

### 新增 webapp 示例

```bash
curl -X POST http://localhost:5050/api/runninghub/webapps \
  -H "Content-Type: application/json" \
  -d '{
    "name": "shadow_removal",
    "config": {
      "webapp_id": "3099163935819108354",
      "description": "阴影移除",
      "nodes": {
        "10": {
          "label": "input_image",
          "type": "file",
          "required": true,
          "upload": true
        },
        "20": {
          "label": "shadow_mask",
          "type": "file",
          "required": true,
          "upload": true
        }
      },
      "defaults": {}
    }
  }'
```

## 配置模块 API

`bridge_removal.runninghub_config` 模块提供以下函数：

| 函数 | 说明 |
|------|------|
| `load_config(force_reload=False)` | 加载配置文件（带文件修改时间缓存） |
| `validate_config(config)` | 验证配置格式，返回错误列表 |
| `get_webapp_config(name)` | 获取指定 webapp 的完整配置（深拷贝） |
| `get_webapp_id(name)` | 获取 webapp ID（优先使用环境变量） |
| `fill_params(name, params)` | 合并默认参数与请求参数 |
| `get_upload_node_ids(name)` | 获取需要上传文件的节点 ID 列表 |
| `get_queue_config(name)` | 获取队列重试配置 |
| `build_node_mapping(name)` | 构建 label→node 映射 |
| `list_webapps()` | 列出所有 webapp 摘要信息 |
| `add_webapp(name, config)` | 新增 webapp 配置 |
| `update_webapp(name, updates)` | 更新 webapp 配置 |
| `delete_webapp(name)` | 删除 webapp 配置 |
| `save_config(config, path=None)` | 保存配置到文件 |

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `RUNNINGHUB_CONFIG_PATH` | `bridge_removal/runninghub_webapps.json` | 配置文件路径 |
| `RUNNINGHUB_API_BASE` | `https://www.runninghub.cn` | API 根地址 |
| `RUNNINGHUB_API_KEY` | 无 | API 密钥 |
| `RUNNINGHUB_WEBAPP_ID` | 配置文件中的值 | webapp ID（优先级高于配置文件） |
| `RUNNINGHUB_MAX_SLOTS` | `3` | 并发槽位数 |
| `RUNNINGHUB_QUEUE_RETRY` | 配置文件中的值 | 队列满重试次数 |
| `RUNNINGHUB_QUEUE_RETRY_INTERVAL` | 配置文件中的值 | 队列满重试间隔 |

## 新增 webapp 步骤

1. 在 `runninghub_webapps.json` 中添加新的 webapp 配置项，或通过 API 接口添加
2. 在业务代码中调用 `run_webapp(api_key, "new_webapp_name", params, output_path)`
3. 确保 params 中的 key 与配置中节点的 `label` 一一对应

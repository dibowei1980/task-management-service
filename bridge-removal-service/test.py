import requests

# ============================================================
# 配置
# ============================================================
UPM_BASE_URL = "http://127.0.0.1:8081"          # UPM 服务地址
API_TOKEN = "upm_TzNUACvcQLHMzq1ms90CW85wrqSzXglpZONQhJhxSdM"
PERMISSION = "department:manager"

# ============================================================
# 方式一：直接用 API Token（推荐，最简方式）
# ============================================================
def find_users_by_permission(api_token: str, permission_code: str) -> list[dict]:
    response = requests.get(
        f"{UPM_BASE_URL}/api/users/search",
        params={"permissionCode": permission_code},
        headers={"Authorization": f"Bearer {api_token}"},
    )
    response.raise_for_status()
    return response.json()


users = find_users_by_permission(API_TOKEN, PERMISSION)
print(f"拥有 {PERMISSION} 权限的用户 ({len(users)} 人):")
for u in users:
    print(f"  {u['username']}  roles={u['roles']}")


# ============================================================
# 方式二：OAuth2 client_credentials 获取 token 后调用
# ============================================================
# def get_access_token(client_id: str, client_secret: str) -> str:
#     resp = requests.post(
#         f"{UPM_BASE_URL}/oauth2/token",
#         headers={
#             "Authorization": f"Basic {base64.b64encode(f'{client_id}:{client_secret}'.encode()).decode()}",
#             "Content-Type": "application/x-www-form-urlencoded",
#         },
#         data={"grant_type": "client_credentials", "scope": "profile"},
#     )
#     resp.raise_for_status()
#     return resp.json()["access_token"]
#
# client_token = get_access_token("task-management-service", "yKY0N0XSRREheBkok00gWSEix1OogROHSPv8Uk")
# users = find_users_by_permission(client_token, PERMISSION)
# print(f"via OAuth2: {[u['username'] for u in users]}")
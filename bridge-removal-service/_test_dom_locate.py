import sys, os, json
sys.path.insert(0, r"d:\work\devlope\生产协同系统\bridge-removal-service")
os.chdir(r"d:\work\devlope\生产协同系统\bridge-removal-service")

from app import create_app
app = create_app()

with app.test_client() as c:
    login_resp = c.post("/api/v1/auth/upm/login", json={"username": "admin", "password": "admin123"})
    login_data = json.loads(login_resp.data)
    print("Login:", login_resp.status_code)
    if login_resp.status_code == 200 and "data" in login_data:
        token = login_data["data"]["token"]
    else:
        print("UPM login failed, trying internal token")
        token = os.getenv("TASK_MANAGEMENT_AUTH_TOKEN", "")

    headers = {"Authorization": f"Bearer {token}"}

    projects_resp = c.get("/api/v1/projects", headers=headers)
    projects_data = json.loads(projects_resp.data)
    print("Projects status:", projects_resp.status_code)

    if projects_resp.status_code == 200 and "data" in projects_data:
        items = projects_data["data"]
        if isinstance(items, list) and len(items) > 0:
            task_id = items[0].get("id") or items[0].get("projectId")
            print(f"Testing with task_id: {task_id}")

            dom_resp = c.get(f"/api/v1/tasks/{task_id}/dom-locate", headers=headers)
            dom_data = json.loads(dom_resp.data)
            print(f"dom-locate status: {dom_resp.status_code}")

            if dom_resp.status_code == 200 and "data" in dom_data:
                d = dom_data["data"]
                print(f"  taskId: {d.get('taskId')}")
                print(f"  domCount: {d.get('domCount')}")
                print(f"  dependencyCount: {d.get('dependencyCount')}")
                print(f"  successorCount: {d.get('successorCount')}")
                doms = d.get("doms", [])
                print(f"  doms count: {len(doms)}")
                if doms:
                    first = doms[0]
                    print(f"  first dom keys: {sorted(first.keys())}")
                    print(f"  first dom path: {first.get('path')}")
                    print(f"  first dom fileUrl: {first.get('fileUrl')}")
                    print(f"  first dom width: {first.get('width')}")
                    print(f"  first dom height: {first.get('height')}")
                    print(f"  first dom bridgePolygonPx: {'SET' if first.get('bridgePolygonPx') else 'NONE'}")
                    print(f"  first dom centerlinePx: {'SET' if first.get('centerlinePx') else 'NONE'}")
            else:
                print(f"  Error: {dom_data}")
        else:
            print("No projects found")
    else:
        print(f"  Error: {projects_data}")

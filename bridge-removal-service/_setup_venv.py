import subprocess, sys, os

base = r'd:\work\devlope'
proj = os.path.join(base, '生产协同系统', 'bridge-removal-service')
venv_dir = os.path.join(proj, 'venv')
venv_python = os.path.join(venv_dir, 'Scripts', 'python.exe')
venv_pip = os.path.join(venv_dir, 'Scripts', 'pip.exe')
req_file = os.path.join(proj, 'requirements.txt')

print(f"Project dir: {proj}")
print(f"Project exists: {os.path.isdir(proj)}")
print(f"Venv dir: {venv_dir}")
print(f"Venv exists: {os.path.isdir(venv_dir)}")

if os.path.isfile(venv_python):
    print(f"Venv python exists: True")
    print(f"Python version: {subprocess.check_output([venv_python, '--version']).decode().strip()}")
else:
    print(f"Venv python exists: False, creating venv...")
    subprocess.run([sys.executable, '-m', 'venv', venv_dir], check=True)
    print(f"Venv created. Python exists: {os.path.isfile(venv_python)}")

print("\nUpgrading pip...")
subprocess.run([venv_python, '-m', 'pip', 'install', '--upgrade', 'pip'], check=True)

print("\nInstalling requirements.txt...")
subprocess.run([venv_python, '-m', 'pip', 'install', '-r', req_file], check=True)

print("\nVerifying sam2...")
result = subprocess.run([venv_python, '-c', 'import sam2; print("sam2 OK")'], capture_output=True, text=True)
print(f"  stdout: {result.stdout.strip()}")
print(f"  stderr: {result.stderr.strip()}")

print("\nDone!")

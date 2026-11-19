"""Opt-in actual host smoke test. Creates only disposable AVDs under a new directory."""
import json
import os
import pathlib
import subprocess
import sys
import tempfile
import time

def main():
    if len(sys.argv) != 2:
        raise SystemExit("usage: python3 tests/real_smoke.py /path/to/SDK")
    sdk = pathlib.Path(sys.argv[1]).resolve()
    binary = pathlib.Path("target/debug/multi-emulator-core" + (".exe" if os.name == "nt" else "")).resolve()
    adb = sdk / "platform-tools" / ("adb.exe" if os.name == "nt" else "adb")
    env = dict(os.environ)
    env.setdefault("MES_HEADLESS", "1")
    # Retain failure logs in the selected repository's disposable test directory.
    root = pathlib.Path(tempfile.mkdtemp(prefix="mes-smoke-", dir="target")).resolve()
    print(f"Smoke directory: {root}", flush=True)
    p = subprocess.Popen([str(binary), str(root), str(sdk)], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, env=env)
    ids = []
    def call(action, **kwargs):
        p.stdin.write(json.dumps(dict(action=action, **kwargs))+"\n")
        p.stdin.flush()
        data=json.loads(p.stdout.readline())
        if "error" in data: raise RuntimeError(data["error"])
        return data["ok"]
    def guest(port,*args):
        return subprocess.check_output([str(adb),"-s",f"emulator-{port}",*args],text=True,timeout=20).strip()
    try:
        print("HOST",call("host"),flush=True)
        print("ACCELERATION",call("acceleration"),flush=True)
        image=next((i for i in call("images") if "android-34" in i),None)
        if not image: raise RuntimeError("no Android 14 image installed")
        spec=dict(name="Smoke A",image=image,hardware_profile="pixel_6",ram_mb=2048,cores=2,width=720,height=1280,disk_mb=2048,locale="en-US")
        for name in ("Smoke A","Smoke B"):
            spec["name"]=name
            d=call("create",spec=spec); ids.append(d["id"])
            print("CREATED",d["id"],flush=True)
        started=[call("start",id=i) for i in ids]
        print("STARTED",started,flush=True)
        assert all(s["state"]=="starting" for s in started)
        assert len({s["pid"] for s in started})==2
        assert len({s["console_port"] for s in started})==2
        deadline=time.monotonic()+300
        while time.monotonic()<deadline:
            statuses=[call("status",id=i) for i in ids]
            print("STATES",[s["state"] for s in statuses],flush=True)
            if any(s["state"] in ("crashed","unknown","stopped") for s in statuses): raise RuntimeError(f"device failed to boot: {statuses}")
            if all(s["state"]=="ready" for s in statuses): break
            time.sleep(5)
        else: raise RuntimeError("boot deadline exceeded")
        ports=[s["console_port"] for s in statuses]
        print("ADDRESSES",[s["addresses"] for s in statuses],flush=True)
        for port,marker in zip(ports,("mes-alpha","mes-bravo")):
            guest(port,"shell","settings","put","system","mes_smoke_marker",marker)
        assert guest(ports[0],"shell","settings","get","system","mes_smoke_marker")=="mes-alpha"
        assert guest(ports[1],"shell","settings","get","system","mes_smoke_marker")=="mes-bravo"
        call("stop",id=ids[0])
        assert call("status",id=ids[1])["state"]=="ready"
        call("start",id=ids[0])
        deadline=time.monotonic()+300
        while time.monotonic()<deadline:
            s=call("status",id=ids[0])
            if s["state"]=="ready":break
            if s["state"]=="crashed":raise RuntimeError("restart crashed")
            time.sleep(5)
        else:raise RuntimeError("restart deadline exceeded")
        assert guest(s["console_port"],"shell","settings","get","system","mes_smoke_marker")=="mes-alpha"
        print("PASS: two process identities, ports, isolated settings and persistence after restart",flush=True)
    finally:
        for i in ids:
            try: call("stop",id=i)
            except Exception as e: print("STOP ERROR",e,flush=True)
            try: call("delete",id=i)
            except Exception as e: print("DELETE ERROR",e,flush=True)
        p.stdin.close()
        try:p.wait(timeout=30)
        except subprocess.TimeoutExpired:p.kill();p.wait()

if __name__=="__main__":
    main()

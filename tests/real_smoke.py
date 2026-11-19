"""Opt-in actual host smoke test. Creates only disposable AVDs under a new directory."""
import argparse
import base64
import json
import os
import pathlib
import subprocess
import tempfile
import time
from build_fixture import PACKAGE, build_fixture

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("sdk", type=pathlib.Path)
    parser.add_argument("--graphics", choices=("auto", "software"), default="auto")
    args = parser.parse_args()
    if not __debug__:
        raise SystemExit("Smoke assertions must be enabled; do not use python -O")
    sdk = args.sdk.resolve()
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
    def guest(device_id, port,*args):
        command = [str(adb), "-s", f"emulator-{port}"]
        identity = subprocess.check_output([*command,"emu","avd","name"],text=True,timeout=20)
        if "mes_" + device_id.replace("-","") not in identity.splitlines():
            raise RuntimeError("managed emulator identity changed")
        return subprocess.check_output([*command,*args],text=True,timeout=20).strip()
    try:
        print("HOST",call("host"),flush=True)
        print("GRAPHICS MODE",args.graphics,flush=True)
        preflight = call("runtime_preflight")
        print("RUNTIME PREFLIGHT", preflight, flush=True)
        if not preflight["ready"]:
            raise RuntimeError(preflight["diagnostic"])
        image=next((i for i in call("images") if ";android-34;google_apis_playstore;" in i),None)
        if not image: raise RuntimeError("no Android 14 Google Play image installed")
        apk = build_fixture(sdk, root / "fixture")
        spec=dict(name="Smoke A",image=image,hardware_profile="pixel_6",ram_mb=2048,cores=2,width=720,height=1280,disk_mb=2048,locale="en-US",graphics_mode=args.graphics)
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
        for device_id,port in zip(ids,ports):
            assert guest(device_id,port,"shell","getprop","sys.boot_completed") == "1"
            frame = call("screen", id=device_id)
            assert frame["width"] > 0 and frame["height"] > 0
            assert base64.b64decode(frame["png_base64"], validate=True).startswith(b"\x89PNG\r\n\x1a\n")
            apps = call("google_apps", id=device_id)
            assert apps["play_store"], "Play Store missing from Google Play image"
            assert apps["youtube"], "YouTube missing from Google Play image; install via official store before certifying this image"
            assert apps["youtube_preinstalled"], "YouTube is not a system app on this image"
            call("navigate", id=device_id, key="home")
            call("navigate", id=device_id, key="volume_up")
            call("navigate", id=device_id, key="volume_down")
        print("ADDRESSES",[s["addresses"] for s in statuses],flush=True)
        call("install_apk",id=ids[0],path=str(apk))
        assert guest(ids[0],ports[0],"shell","pm","list","packages",PACKAGE) == "package:" + PACKAGE
        assert guest(ids[1],ports[1],"shell","pm","list","packages",PACKAGE) == ""
        call("install_apk",id=ids[1],path=str(apk))
        for device_id,port,marker in zip(ids,ports,("mes-alpha","mes-bravo")):
            guest(device_id,port,"shell","settings","put","system","mes_smoke_marker",marker)
            # Only the disposable debuggable package's private directory is accessed.
            guest(device_id,port,"shell","run-as",PACKAGE,"sh","-c",f"'printf %s {marker} > mes-smoke-marker'")
        for device_id,port,marker in zip(ids,ports,("mes-alpha","mes-bravo")):
            assert guest(device_id,port,"shell","settings","get","system","mes_smoke_marker")==marker
            assert guest(device_id,port,"shell","run-as",PACKAGE,"cat","mes-smoke-marker")==marker
        renamed=call("rename",id=ids[0],name="Smoke A Renamed")
        assert renamed["id"] == ids[0]
        assert guest(ids[0],ports[0],"shell","run-as",PACKAGE,"cat","mes-smoke-marker") == "mes-alpha"
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
        assert guest(ids[0],s["console_port"],"shell","settings","get","system","mes_smoke_marker")=="mes-alpha"
        assert guest(ids[0],s["console_port"],"shell","run-as",PACKAGE,"cat","mes-smoke-marker")=="mes-alpha"
        print("PASS: two process identities, ports, isolated installed apps, private app data, settings and persistence after restart",flush=True)
    finally:
        cleanup_errors = []
        for i in ids:
            try: call("stop",id=i)
            except Exception as e: cleanup_errors.append(f"stop {i}: {e}")
            try: call("delete",id=i)
            except Exception as e: cleanup_errors.append(f"delete {i}: {e}")
        p.stdin.close()
        try:
            if p.wait(timeout=30) != 0:
                cleanup_errors.append("controller exited nonzero")
        except subprocess.TimeoutExpired:
            p.kill();p.wait()
            cleanup_errors.append("controller failed to exit")
        if cleanup_errors:
            raise RuntimeError("Smoke cleanup failed: " + "; ".join(cleanup_errors))

if __name__=="__main__":
    main()

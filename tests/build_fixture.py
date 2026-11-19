"""Build a local, resource-only disposable debug APK using installed SDK tools."""
import os
import pathlib
import secrets
import subprocess
import sys

PACKAGE = "com.nexonic.mes.smoketest"


def build_fixture(sdk, output):
    sdk, output = pathlib.Path(sdk).resolve(), pathlib.Path(output).resolve()
    output.mkdir(parents=True, exist_ok=False)
    tools = sdk / "build-tools" / "34.0.0"
    suffix = ".exe" if os.name == "nt" else ""
    aapt2 = tools / ("aapt2" + suffix)
    signer = tools / ("apksigner.bat" if os.name == "nt" else "apksigner")
    android_jar = sdk / "platforms" / "android-34" / "android.jar"
    manifest = pathlib.Path(__file__).resolve().parent / "fixtures" / "AndroidManifest.xml"
    unsigned, apk, key = output / "unsigned.apk", output / "fixture.apk", output / "fixture.p12"
    for required in (aapt2, signer, android_jar):
        if not required.is_file():
            raise RuntimeError(f"Missing installed fixture prerequisite: {required.name}")
    env = dict(os.environ, MES_TEST_KEY_PASSWORD=secrets.token_urlsafe(24))
    subprocess.run([str(aapt2), "link", "--manifest", str(manifest), "-I", str(android_jar),
                    "-o", str(unsigned)], check=True, timeout=60)
    try:
        subprocess.run(["keytool", "-genkeypair", "-alias", "mes-test", "-keyalg", "RSA",
                        "-keysize", "2048", "-validity", "1", "-dname", "CN=MES Smoke Test",
                        "-storetype", "PKCS12", "-keystore", str(key),
                        "-storepass:env", "MES_TEST_KEY_PASSWORD"],
                       env=env, check=True, timeout=60)
        subprocess.run([str(signer), "sign", "--ks", str(key), "--ks-key-alias", "mes-test",
                        "--ks-pass", "env:MES_TEST_KEY_PASSWORD", "--out", str(apk), str(unsigned)],
                       env=env, check=True, timeout=60)
        subprocess.run([str(signer), "verify", str(apk)], check=True, timeout=60)
    finally:
        key.unlink(missing_ok=True)
    unsigned.unlink(missing_ok=True)
    return apk


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("usage: python3 tests/build_fixture.py SDK_DIRECTORY NEW_OUTPUT_DIRECTORY")
    print(build_fixture(sys.argv[1], sys.argv[2]))

import sys
import os
import subprocess

def print_result(name, success, message=""):
    status = "[ PASS ]" if success else "[ FAIL ]"
    print(f"{status} {name}: {message}")
    return success

def check_imports():
    modules = ['flask', 'numpy', 'cv2', 'sklearn', 'sqlite3', 'insightface', 'onnxruntime']
    all_success = True
    for m in modules:
        try:
            __import__(m)
            print_result(f"Import {m}", True)
        except ImportError as e:
            print_result(f"Import {m}", False, str(e))
            all_success = False
    return all_success

def check_ffmpeg():
    try:
        startupinfo = None
        if os.name == 'nt':
            startupinfo = subprocess.STARTUPINFO()
            startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
            
        # Try running normally first
        try:
            res = subprocess.run(['ffmpeg', '-version'], stdout=subprocess.PIPE, stderr=subprocess.PIPE, startupinfo=startupinfo, timeout=5)
            if res.returncode == 0:
                first_line = res.stdout.decode('utf-8', errors='ignore').split('\n')[0]
                return print_result("FFmpeg executable", True, first_line)
        except FileNotFoundError:
            # Check WinGet packages path
            local_app_data = os.environ.get('LOCALAPPDATA', '')
            if local_app_data:
                winget_dir = os.path.join(local_app_data, "Microsoft", "WinGet", "Packages")
                if os.path.exists(winget_dir):
                    found_ffmpeg = False
                    for root, dirs, files in os.walk(winget_dir):
                        if 'ffmpeg.exe' in files:
                            bin_path = os.path.abspath(root)
                            os.environ['PATH'] = bin_path + os.pathsep + os.environ.get('PATH', '')
                            # Re-try execution
                            res = subprocess.run(['ffmpeg', '-version'], stdout=subprocess.PIPE, stderr=subprocess.PIPE, startupinfo=startupinfo, timeout=5)
                            if res.returncode == 0:
                                first_line = res.stdout.decode('utf-8', errors='ignore').split('\n')[0]
                                found_ffmpeg = True
                                return print_result("FFmpeg executable", True, f"Found via WinGet: {first_line}")
                            break
                    if not found_ffmpeg:
                        return print_result("FFmpeg executable", False, "ffmpeg not found in system PATH or WinGet folder.")
            return print_result("FFmpeg executable", False, "ffmpeg not found in system PATH.")
    except Exception as e:
        return print_result("FFmpeg executable", False, str(e))


def check_directml():
    try:
        import onnxruntime as ort
        providers = ort.get_available_providers()
        has_dml = 'DmlExecutionProvider' in providers
        return print_result(
            "ONNX Runtime DirectML Provider", 
            has_dml, 
            f"Available providers: {providers}"
        )
    except Exception as e:
        return print_result("ONNX Runtime DirectML check", False, str(e))

if __name__ == "__main__":
    print("=== AuraSort Setup Verification ===")
    import_ok = check_imports()
    ffmpeg_ok = check_ffmpeg()
    dml_ok = check_directml()
    
    print("\nSummary:")
    if import_ok and ffmpeg_ok and dml_ok:
        print("Everything is set up correctly! You can start the web app by running: python app.py")
    else:
        print("Some checks failed. Please check dependencies or setup.")
        sys.exit(1)

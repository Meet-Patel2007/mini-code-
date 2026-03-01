import http.server
import socketserver
import json
import subprocess
import os
import tempfile
import glob

PORT = 5000

def setup_custom_env():
    """Auto-detect compilers and inject them straight into os.environ."""
    additional_paths = [
        r"C:\Program Files\nodejs",
        r"C:\msys64\ucrt64\bin",
        r"C:\msys64\mingw64\bin",
        r"C:\MinGW\bin"
    ]
    # Auto-detect latest Java JDK
    java_dirs = glob.glob(r"C:\Program Files\Java\jdk*\bin")
    if java_dirs:
        additional_paths.append(java_dirs[-1]) # Use latest matching directory
        
    os.environ["PATH"] = os.pathsep.join(additional_paths) + os.pathsep + os.environ.get("PATH", "")

# Call it immediately when the server script loads
setup_custom_env()

class CodeExecutionHandler(http.server.SimpleHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200, "ok")
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_POST(self):
        if self.path == '/api/execute':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode('utf-8'))
            
            language = data.get('language')
            code = data.get('code', '')
            stdin = data.get('stdin', '')
            
            result = self.execute_code(language, code, stdin)
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps(result).encode('utf-8'))
        else:
            self.send_error(404, "Endpoint not found")

    def execute_code(self, language, code, stdin):
        try:
            with tempfile.TemporaryDirectory() as temp_dir:
                if language == 'javascript':
                    file_path = os.path.join(temp_dir, 'script.js')
                    with open(file_path, 'w', encoding='utf-8') as f:
                        f.write(code)
                    cmd = ['node', file_path]
                    
                elif language == 'python':
                    file_path = os.path.join(temp_dir, 'script.py')
                    with open(file_path, 'w', encoding='utf-8') as f:
                        f.write(code)
                    cmd = ['python', file_path]
                    
                elif language == 'java':
                    # Java class must match file name if public, let's just make it Main.java and replace the class name just in case
                    file_path = os.path.join(temp_dir, 'Main.java')
                    
                    # Hack: if user wrote public class Something, replace with Main
                    import re
                    code = re.sub(r'public\s+class\s+\w+', 'public class Main', code)
                    
                    with open(file_path, 'w', encoding='utf-8') as f:
                        f.write(code)
                    
                    # Compile Java
                    compile_process = subprocess.run(
                        ['javac', '-encoding', 'UTF-8', file_path],
                        capture_output=True, text=True
                    )
                    if compile_process.returncode != 0:
                        return {'stdout': '', 'stderr': compile_process.stderr, 'error': 'Compilation Error'}
                        
                    cmd = ['java', '-cp', temp_dir, 'Main']
                    
                elif language == 'clike':
                    file_path = os.path.join(temp_dir, 'script.c')
                    exe_path = os.path.join(temp_dir, 'script.exe')
                    with open(file_path, 'w', encoding='utf-8') as f:
                        f.write(code)
                        
                    # Compile C/C++
                    compile_process = subprocess.run(
                        ['gcc', file_path, '-o', exe_path],
                        capture_output=True, text=True
                    )
                    if compile_process.returncode != 0:
                        return {'stdout': '', 'stderr': compile_process.stderr, 'error': 'Compilation Error'}
                        
                    cmd = [exe_path]
                    
                else:
                    return {'stdout': '', 'stderr': f'Unsupported language: {language}', 'error': True}

                # Run the actual command
                try:
                    process = subprocess.run(
                        cmd,
                        input=stdin,
                        capture_output=True,
                        text=True,
                        timeout=10  # 10 second timeout
                    )
                    return {
                        'stdout': process.stdout,
                        'stderr': process.stderr,
                        'error': None
                    }
                except subprocess.TimeoutExpired:
                    return {'stdout': '', 'stderr': 'Execution timed out (10s limit)', 'error': 'Timeout'}
                
        except FileNotFoundError as e:
            compiler = str(e).split("'")[1] if "'" in str(e) else str(e)
            return {'stdout': '', 'stderr': f'Compiler/Interpreter not found on the system. Make sure you installed {language}.', 'error': 'Missing Compiler'}
        except Exception as e:
            return {'stdout': '', 'stderr': str(e), 'error': 'Server Error'}

with socketserver.TCPServer(("", PORT), CodeExecutionHandler) as httpd:
    print(f"DebugBuddy Execution API serving at port {PORT}")
    httpd.serve_forever()

/* ========================================================
   DebugBuddy — Execution API Runner
   ======================================================== */
const Runner = (() => {
    'use strict';

    async function run(code, language, stdin) {
        try {
            const response = await fetch('http://localhost:5000/api/execute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ language, code, stdin })
            });

            if (!response.ok) {
                return { stdout: '', stderr: `HTTP Error ${response.status}: API might be down.`, error: 'Network Error' };
            }

            const data = await response.json();
            return data;
        } catch (e) {
            return { stdout: '', stderr: "Failed to connect to the local execution API. Make sure 'python server.py' is running in the background.", error: 'Connection Refused' };
        }
    }

    return { run };
})();

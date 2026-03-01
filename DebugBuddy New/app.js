/* ========================================================
   DebugBuddy New — App Controller
   Adds Run Code logic via the Python backend API
   ======================================================== */

(function () {
    'use strict';

    /* ---------- DOM refs ---------- */
    const $codeInput = document.getElementById('code-input');
    const $langSelect = document.getElementById('language-select');
    const $btnAnalyze = document.getElementById('btn-analyze');
    const $btnRun = document.getElementById('btn-run');
    const $btnRunWrapper = document.getElementById('run-btn-wrapper');
    const $btnClear = document.getElementById('btn-clear');
    const $btnSample = document.getElementById('btn-sample');
    const $btnCopyOutput = document.getElementById('btn-copy-output');

    const $resultsContainer = document.getElementById('results-container');
    const $emptyState = document.getElementById('empty-state');
    const $errorCount = document.getElementById('error-count');

    const $ioPanel = document.getElementById('io-panel');
    const $ioStdin = document.getElementById('io-stdin');
    const $ioStdout = document.getElementById('io-stdout');
    const $runTime = document.getElementById('run-time');

    /* ---------- CodeMirror Init ---------- */
    const editor = CodeMirror.fromTextArea($codeInput, {
        mode: 'javascript',
        theme: 'material-darker',
        lineNumbers: true,
        matchBrackets: true,
        autoCloseBrackets: true,
        tabSize: 4,
        indentUnit: 4,
        indentWithTabs: false,
        lineWrapping: false,
        gutters: ['CodeMirror-linenumbers', 'error-gutter'],
        placeholder: '// Paste your code here...',
    });

    /* ---------- Language mode map ---------- */
    const modeMap = {
        javascript: 'javascript',
        python: 'python',
        java: 'text/x-java',
        clike: 'text/x-csrc',
    };

    /* ---------- Sample Code ---------- */
    const samples = {
        javascript: `// DebugBuddy Sample — JavaScript
console.log("Hello DebugBuddy!");

const nums = [1, 2, 3];
for(let n of nums) {
    console.log("Number: " + n);
}`,
        python: `# DebugBuddy Sample — Python
name = input("Enter your name: ")
print(f"Hello, {name}!")

for i in range(3):
    print(f"Count {i}")`,
        java: `// DebugBuddy Sample — Java
import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        System.out.println("Hello DebugBuddy!");
        Scanner scanner = new Scanner(System.in);
        
        System.out.print("Enter something: ");
        if(scanner.hasNextLine()) {
            String input = scanner.nextLine();
            System.out.println("You entered: " + input);
        }
    }
}`,
        clike: `// DebugBuddy Sample — C
#include <stdio.h>

int main() {
    printf("Hello DebugBuddy!\\n");
    
    char name[50];
    printf("Enter name: ");
    if (fgets(name, 50, stdin) != NULL) {
        printf("You entered: %s", name);
    }
    
    return 0;
}`
    };

    /* ---------- Event Handlers ---------- */
    $langSelect.addEventListener('change', () => {
        const lang = $langSelect.value;
        editor.setOption('mode', modeMap[lang] || lang);
        clearResults();
        hideIO();
    });

    $btnAnalyze.addEventListener('click', () => {
        runAnalysis();
    });

    $btnRun.addEventListener('click', () => {
        executeCode();
    });

    $btnClear.addEventListener('click', () => {
        editor.setValue('');
        clearResults();
        hideIO();
        editor.focus();
    });

    $btnSample.addEventListener('click', () => {
        const lang = $langSelect.value;
        editor.setValue(samples[lang] || samples.javascript);
        clearResults();
        hideIO();
        editor.focus();
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // Ctrl+Enter for Analyze
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            runAnalysis();
        }
        // Ctrl+Shift+Enter for Run
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'Enter') {
            e.preventDefault();
            if ($btnRunWrapper.style.display !== 'none') {
                executeCode();
            }
        }
    });

    document.getElementById('btn-copy-output').addEventListener('click', () => {
        const out = $ioStdout.textContent;
        if (!out || out.startsWith('Press "Run Code') || out.startsWith('Output will appear')) return;
        navigator.clipboard.writeText(out).then(() => {
            const btn = document.getElementById('btn-copy-output');
            const oldText = btn.textContent;
            btn.textContent = 'Copied!';
            btn.classList.add('btn--success');
            setTimeout(() => {
                btn.textContent = oldText;
                btn.classList.remove('btn--success');
            }, 2000);
        });
    });

    /* ---------- Analysis Runner ---------- */
    function runAnalysis() {
        const code = editor.getValue();
        if (!code.trim()) return;

        const lang = $langSelect.value;

        // UI: show loading
        $btnAnalyze.classList.add('analyzing');
        $btnAnalyze.textContent = 'Analyzing...';
        hideIO();

        setTimeout(() => {
            const issues = Analyzer.analyze(code, lang);
            clearHighlights();
            renderResults(issues);
            highlightLines(issues);

            // Restore button
            $btnAnalyze.classList.remove('analyzing');
            $btnAnalyze.innerHTML = `Analyze Code`;

            // If no errors, show Run panel
            if (issues.filter(i => i.severity === 'error').length === 0) {
                showIO();
            }
        }, 400);
    }

    /* ---------- Code Execution Runner ---------- */
    async function executeCode() {
        const code = editor.getValue();
        const lang = $langSelect.value;
        const stdin = $ioStdin.value;

        // Run static analysis before execution
        const issues = Analyzer.analyze(code, lang);
        clearHighlights();
        highlightLines(issues);
        renderResults(issues);

        // If there are errors, do not run code
        if (issues.some(i => i.severity === 'error')) {
            hideIO();
            return;
        }

        $btnRun.classList.add('analyzing');
        $btnRun.textContent = 'Running...';

        $ioStdout.className = 'io-output running';
        $ioStdout.textContent = 'Executing code on server...\nWaiting for response...';
        $runTime.textContent = '';

        const startTime = Date.now();
        const result = await Runner.run(code, lang, stdin);
        const elapsed = Date.now() - startTime;

        $btnRun.classList.remove('analyzing');
        $btnRun.textContent = 'Run Code ▶';

        // If compilation error, show in results panel
        if (result.error === 'Compilation Error') {
            // Clean up stderr - remove noisy temp file paths
            const cleanErr = result.stderr.replace(/C:.*?(Main\.java|script\.c):\s*/g, 'Line ')
                .replace(/\^.*?$/gm, '^'); // Just for brevity

            renderResults([{
                line: 1,
                severity: 'error',
                title: 'Compilation Error',
                explanation: cleanErr,
                suggestion: 'This happens when the compiler cannot understand your code. Check for syntax errors, or make sure you have selected the correct language in the dropdown.',
                snippet: ''
            }]);
            $ioStdout.className = 'io-output error';
            $ioStdout.textContent = `[Compilation Error]\n${cleanErr}`;
            return;
        }

        if (result.error) {
            $ioStdout.className = 'io-output error';
            $ioStdout.textContent = `[${result.error}]\n${result.stderr}`;
        } else if (result.stderr.trim() && !result.stdout.trim()) {
            $ioStdout.className = 'io-output error';
            $ioStdout.textContent = result.stderr;
        } else {
            $ioStdout.className = 'io-output success';
            let out = result.stdout;
            if (result.stderr) out += '\n[stderr Warnings]:\n' + result.stderr;
            $ioStdout.textContent = out || '(Program exited completely with no visible output)';
        }

        $runTime.innerHTML = `&mdash; ${(elapsed / 1000).toFixed(2)}s`;
    }

    /* ---------- Helpers & UI ---------- */
    function clearResults() {
        $resultsContainer.innerHTML = '';
        $resultsContainer.appendChild($emptyState);
        $emptyState.style.display = '';
        $errorCount.style.display = 'none';
        clearHighlights();
    }

    function showIO() {
        $btnRunWrapper.style.display = 'block';
        $ioPanel.style.display = 'flex';
        $ioStdout.className = 'io-output';
        $ioStdout.textContent = 'Press "Run Code ▶" to execute output here.\nIf your program requires input (like Python input() or Java Scanner), enter it in the stdin box first.';
        $runTime.textContent = '';
    }

    function hideIO() {
        $btnRunWrapper.style.display = 'none';
        $ioPanel.style.display = 'none';
        $ioStdin.value = '';
    }

    function clearHighlights() {
        editor.eachLine((lineHandle) => {
            editor.removeLineClass(lineHandle, 'wrap', 'cm-error-line');
            editor.removeLineClass(lineHandle, 'wrap', 'cm-warning-line');
            editor.removeLineClass(lineHandle, 'wrap', 'cm-info-line');
        });
        editor.clearGutter('error-gutter');
    }

    function highlightLines(issues) {
        for (const issue of issues) {
            const lineIndex = issue.line - 1;
            if (lineIndex < 0 || lineIndex >= editor.lineCount()) continue;

            const className = issue.severity === 'error' ? 'cm-error-line'
                : issue.severity === 'warning' ? 'cm-warning-line'
                    : 'cm-info-line';
            editor.addLineClass(lineIndex, 'wrap', className);

            const marker = document.createElement('div');
            marker.className = issue.severity === 'error' ? 'cm-error-gutter' : 'cm-warning-gutter';
            marker.innerHTML = issue.severity === 'error' ? '●' : issue.severity === 'warning' ? '▲' : 'ℹ';
            marker.title = issue.title;
            editor.setGutterMarker(lineIndex, 'error-gutter', marker);
        }
    }

    function renderResults(issues) {
        $resultsContainer.innerHTML = '';
        if (issues.length === 0) {
            renderSuccess();
            $errorCount.style.display = 'none';
            return;
        }

        $errorCount.textContent = issues.length;
        $errorCount.style.display = '';
        $errorCount.className = 'badge';

        for (const issue of issues) {
            $resultsContainer.appendChild(makeErrorCard(issue));
        }
    }

    function makeErrorCard(issue) {
        const card = document.createElement('div');
        const typeClass = issue.severity === 'warning' ? 'error-card--warning'
            : issue.severity === 'info' ? 'error-card--info' : '';
        card.className = `error-card ${typeClass}`;
        card.innerHTML = `
            <div class="error-card__header" role="button" tabindex="0">
                <span class="error-card__severity error-card__severity--${issue.severity}">${issue.severity}</span>
                <span class="error-card__title">${escapeHTML(issue.title)}</span>
                <span class="error-card__line" title="Jump to line ${issue.line}" data-line="${issue.line}">Line ${issue.line}</span>
            </div>
            <div class="error-card__body">
                <div>
                    <div class="error-card__section-label">🔍 What's wrong</div>
                    <p class="error-card__explanation">${escapeHTML(issue.explanation)}</p>
                </div>
                <div class="error-card__solution">
                    <div class="error-card__section-label">💡 How to fix it</div>
                    <p>${escapeHTML(issue.suggestion)}</p>
                </div>
            </div>
        `;
        const lineBadge = card.querySelector('.error-card__line');
        lineBadge.addEventListener('click', (e) => {
            e.stopPropagation();
            const lineNum = parseInt(lineBadge.dataset.line) - 1;
            editor.scrollIntoView({ line: lineNum, ch: 0 }, 100);
            editor.setCursor(lineNum, 0);
            editor.focus();
        });
        return card;
    }

    function renderSuccess() {
        const successDiv = document.createElement('div');
        successDiv.className = 'success-state';
        successDiv.innerHTML = `
            <div class="success-state__icon">
                <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                    <path d="M7 14L12 19L21 9" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            </div>
            <h2 class="success-state__title">No issues found!</h2>
            <p class="success-state__text">Your code looks clean. You can now execute it.</p>
        `;
        $resultsContainer.appendChild(successDiv);
        $errorCount.textContent = '✓';
        $errorCount.style.display = '';
        $errorCount.className = 'badge badge--success';
    }

    function escapeHTML(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // Initialize with snippet
    editor.setValue(samples['javascript']);
    editor.focus();

})();

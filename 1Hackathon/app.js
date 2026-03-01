/* ======================================================
   CodeLens — app.js   (v3 — correct models, 429 retry)
   Gemini-powered code error analyzer
   ====================================================== */

// Current valid Gemini models (ordered by preference)
const GEMINI_MODELS = [
    'gemini-2.0-flash',
    'gemini-2.5-flash',
    'gemini-1.5-flash',
    'gemini-1.5-flash-8b'
];
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';
const LS_KEY = 'codelens_gemini_api_key';
const DEFAULT_KEY = 'AIzaSyDvjUoTXhTGxB9HJn6q-Y6Bv6j7aU654Sk';

/* ---- API Key Management ---- */
function getApiKey() {
    return localStorage.getItem(LS_KEY) || DEFAULT_KEY;
}

function saveApiKey() {
    const key = document.getElementById('api-key-input').value.trim();
    if (!key || key.length < 10) {
        document.getElementById('api-key-error').textContent = 'Please enter a valid API key (starts with AIza...).';
        document.getElementById('api-key-error').classList.remove('hidden');
        return;
    }
    localStorage.setItem(LS_KEY, key);
    document.getElementById('api-modal').classList.add('hidden');
}

function promptApiKey() {
    const modal = document.getElementById('api-modal');
    document.getElementById('api-key-input').value = getApiKey();
    document.getElementById('api-key-error').classList.add('hidden');
    modal.classList.remove('hidden');
}

// Show modal on load if no key saved
window.addEventListener('DOMContentLoaded', () => {
    if (!getApiKey()) promptApiKey();
    updateLineNumbers();

    // Allow Enter on API key input
    document.getElementById('api-key-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') saveApiKey();
    });
});

/* ---- Editor Utilities ---- */
function handleInput() {
    updateLineNumbers();
    clearErrorHighlights();
}

function updateLineNumbers() {
    const editor = document.getElementById('code-editor');
    const lineNums = document.getElementById('line-numbers');
    const lines = editor.value.split('\n');
    lineNums.textContent = lines.map((_, i) => i + 1).join('\n');
}

function syncScroll() {
    const editor = document.getElementById('code-editor');
    const lineNums = document.getElementById('line-numbers');
    lineNums.scrollTop = editor.scrollTop;
}

function handleTab(e) {
    if (e.key === 'Tab') {
        e.preventDefault();
        const editor = document.getElementById('code-editor');
        const start = editor.selectionStart;
        const end = editor.selectionEnd;
        editor.value = editor.value.substring(0, start) + '  ' + editor.value.substring(end);
        editor.selectionStart = editor.selectionEnd = start + 2;
        updateLineNumbers();
    }
}

function clearEditor() {
    document.getElementById('code-editor').value = '';
    updateLineNumbers();
    clearResults();
    clearErrorHighlights();
}

/* ---- Gemini API Helper (model fallback + 429 retry + robust JSON) ---- */
async function callGemini(prompt) {
    const key = getApiKey();
    if (!key) { promptApiKey(); throw new Error('No API key provided.'); }

    let lastError = null;

    for (const model of GEMINI_MODELS) {
        // Each model gets up to 2 attempts (for 429 rate-limit retry)
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                const url = `${GEMINI_BASE}${model}:generateContent?key=${key}`;

                const resp = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: {
                            temperature: 0.1,
                            topP: 0.9,
                            maxOutputTokens: 2048
                        }
                    })
                });

                if (!resp.ok) {
                    const errData = await resp.json().catch(() => ({}));
                    const errMsg = errData?.error?.message || `HTTP ${resp.status}`;

                    // 404 = model doesn't exist → skip to next model
                    if (resp.status === 404) {
                        lastError = new Error(errMsg);
                        break; // break inner retry loop, continue outer model loop
                    }

                    // 429 = rate limit → wait 2 seconds and retry once, then try next model
                    if (resp.status === 429) {
                        if (attempt === 0) {
                            await new Promise(r => setTimeout(r, 2000));
                            continue; // retry same model
                        } else {
                            lastError = new Error(`Rate limited on ${model}. Trying next model...`);
                            break;
                        }
                    }

                    // 401 / 403 = bad API key → fail immediately
                    if (resp.status === 401 || resp.status === 403) {
                        throw new Error(`Invalid API key or permission denied. Please check your Gemini API key.`);
                    }

                    throw new Error(errMsg);
                }

                const data = await resp.json();
                let raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

                if (!raw) throw new Error('Empty response from Gemini. Please try again.');

                // Strip markdown code fences if present (```json ... ``` or ``` ... ```)
                raw = raw.trim();
                raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();

                // Extract the JSON object in case there is extra text
                const jsonMatch = raw.match(/\{[\s\S]*\}/);
                if (jsonMatch) raw = jsonMatch[0];

                return JSON.parse(raw); // ✅ success

            } catch (err) {
                if (err.message.includes('Invalid API key') || err.message.includes('permission denied')) {
                    throw err; // hard stop on auth errors
                }
                lastError = err;
                break; // unexpected error → try next model
            }
        }
    }

    throw lastError || new Error('All Gemini models failed. Check your API key and internet connection.');
}

/* ---- Main Analyze Function ---- */
async function analyzeCode() {
    const code = document.getElementById('code-editor').value.trim();
    const lang = document.getElementById('lang-select').value;

    if (!code) {
        alert('Please paste some code first!');
        return;
    }

    if (!getApiKey()) { promptApiKey(); return; }

    setLoading(true);
    clearResults();
    clearErrorHighlights();

    const prompt = `You are an expert code reviewer and compiler engineer. Analyze the following ${lang} code carefully. 
If the code involves complex Data Structures and Algorithms (DSA), especially in C/C++, you must rigorously trace pointers, memory allocations (malloc/free), array bounds, and logical edge cases.

STRICT RULES — follow exactly:
1. Respond with ONLY a JSON object. No markdown, no code fences, no explanation outside the JSON.
2. Line numbers start at 1.
3. Explanations must be in simple, beginner-friendly English. No technical jargon. Break down complex DSA logic clearly.
4. Always fill in "logicExplanation" — describe what the whole code is trying to do (e.g., "This implements a Binary Search Tree insertion...").

The JSON must match this exact structure:
{
  "hasErrors": true,
  "errorCount": 2,
  "errors": [
    {
      "line": 5,
      "errorTitle": "Missing Colon",
      "errorType": "SyntaxError",
      "problematicCode": "def greet(name)",
      "explanation": "In Python, every function definition must end with a colon (:). The colon tells Python that the function body is about to start.",
      "solution": "Add a colon at the end: def greet(name):"
    }
  ],
  "logicExplanation": "This code tries to define a function that greets a person by name and then calls it."
}

If there are NO errors, use:
{
  "hasErrors": false,
  "errorCount": 0,
  "errors": [],
  "logicExplanation": "Plain English explanation of what the code does."
}

Here is the ${lang} code (line numbers included):
${addLineNumbers(code)}`;

    try {
        const result = await callGemini(prompt);
        setLoading(false);
        renderResults(result, code);
    } catch (err) {
        setLoading(false);
        showErrorBanner(err.message);
    }
}

/* ---- Render Results ---- */
function renderResults(result, code) {
    const section = document.getElementById('results-section');
    section.classList.remove('hidden');

    if (result.hasErrors && result.errors && result.errors.length > 0) {
        renderErrors(result, code);
    } else {
        renderSuccess(result);
    }
}

function renderErrors(result, code) {
    const errDiv = document.getElementById('error-results');
    const successDiv = document.getElementById('success-results');
    errDiv.classList.remove('hidden');
    successDiv.classList.add('hidden');

    const count = result.errorCount || result.errors.length;
    document.getElementById('error-count-label').textContent =
        `${count} error${count !== 1 ? 's' : ''} found`;

    const list = document.getElementById('errors-list');
    list.innerHTML = '';

    result.errors.forEach((err, i) => {
        const card = document.createElement('div');
        card.className = 'error-card';
        card.style.animationDelay = `${i * 0.07}s`;
        card.innerHTML = `
      <div class="error-card-header">
        <span class="error-line-badge">Line ${err.line || '?'}</span>
        <span class="error-card-title">${escapeHtml(err.errorTitle || 'Error')}</span>
        <span class="error-card-type">${escapeHtml(err.errorType || 'Error')}</span>
      </div>
      <div class="error-card-body">
        ${err.problematicCode ? `
        <div>
          <div class="error-section-label label-code">⚠ Problematic Code</div>
          <div class="error-code-line">${escapeHtml(err.problematicCode)}</div>
        </div>` : ''}
        <div>
          <div class="error-section-label label-explain">🔍 What's wrong</div>
          <p class="explain-text">${escapeHtml(err.explanation || '')}</p>
        </div>
        <div>
          <div class="error-section-label label-solution">✅ How to fix it</div>
          <p class="solution-text">${escapeHtml(err.solution || '')}</p>
        </div>
      </div>
    `;
        list.appendChild(card);
    });

    const errorLines = result.errors.map(e => e.line).filter(n => typeof n === 'number');
    highlightErrorLines(errorLines, code);
}

function renderSuccess(result) {
    document.getElementById('error-results').classList.add('hidden');
    document.getElementById('success-results').classList.remove('hidden');

    document.getElementById('logic-explanation-text').textContent =
        result.logicExplanation || 'This code appears to be correct.';

    document.getElementById('input-box').value = '';
    document.getElementById('output-box').value = '';
}

/* ---- Error Line Highlighting ---- */
function highlightErrorLines(errorLines, code) {
    const overlay = document.getElementById('error-overlay');
    const lineNums = document.getElementById('line-numbers');
    const lines = code.split('\n');

    const overlayHtml = lines.map((line, i) => {
        const lineNo = i + 1;
        const isError = errorLines.includes(lineNo);
        const cls = isError ? 'line-error-highlight' : 'line-normal';
        const displayLine = line.length > 0 ? escapeHtml(line) : ' ';
        return `<span class="${cls}">${displayLine}</span>`;
    }).join('');

    overlay.innerHTML = overlayHtml;

    const numLines = lines.map((_, i) => {
        const lineNo = i + 1;
        return errorLines.includes(lineNo)
            ? `<span class="line-num-error">${lineNo}</span>`
            : lineNo;
    }).join('\n');
    lineNums.innerHTML = numLines;
}

function clearErrorHighlights() {
    document.getElementById('error-overlay').innerHTML = '';
    updateLineNumbers();
}

/* ---- Predict Output (for correct code) ---- */
async function runPredict() {
    const code = document.getElementById('code-editor').value.trim();
    const lang = document.getElementById('lang-select').value;
    const input = document.getElementById('input-box').value.trim();

    document.getElementById('output-box').value = '';
    document.getElementById('run-loading').classList.remove('hidden');

    const prompt = `Given this ${lang} code:
${addLineNumbers(code)}

${input ? `With this input/arguments: ${input}` : 'With no input.'}

You are acting as an advanced execution engine. What would the exact output be when this runs? 
For complex Data Structures and Algorithms (DSA) or C/C++ code, meticulously trace pointers, state changes, operations, and arithmetic to predict the true output. If there is a segmentation fault, infinite loop, or runtime crash, state that clearly in the output.

Respond with ONLY a JSON object (no markdown, no code fences):
{
  "output": "<exact output that would be printed/returned, or runtime crash message>",
  "explanation": "<one sentence plain English explanation of how it arrived at this output based on the logic>"
}`;

    try {
        const result = await callGemini(prompt);
        document.getElementById('output-box').value =
            (result.output || '') + (result.explanation ? '\n\n— ' + result.explanation : '');
    } catch (err) {
        document.getElementById('output-box').value = 'Error: ' + err.message;
    } finally {
        document.getElementById('run-loading').classList.add('hidden');
    }
}

/* ---- Helpers ---- */
function addLineNumbers(code) {
    return code.split('\n').map((line, i) => `${i + 1}: ${line}`).join('\n');
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function setLoading(state) {
    const loading = document.getElementById('loading-section');
    const btn = document.getElementById('analyze-btn');
    const btnText = document.getElementById('btn-text');

    if (state) {
        loading.classList.remove('hidden');
        btn.disabled = true;
        btnText.textContent = 'Analyzing…';
    } else {
        loading.classList.add('hidden');
        btn.disabled = false;
        btnText.textContent = 'Analyze Code';
    }
}

function clearResults() {
    document.getElementById('results-section').classList.add('hidden');
    document.getElementById('error-results').classList.add('hidden');
    document.getElementById('success-results').classList.add('hidden');
    document.getElementById('errors-list').innerHTML = '';
}

function showErrorBanner(msg) {
    const section = document.getElementById('results-section');
    const errDiv = document.getElementById('error-results');
    section.classList.remove('hidden');
    errDiv.classList.remove('hidden');
    document.getElementById('error-count-label').textContent = 'Something went wrong';
    document.getElementById('errors-list').innerHTML = `
    <div class="error-card">
      <div class="error-card-body">
        <div class="error-section-label label-explain">⚠ Error Details</div>
        <p class="explain-text" style="color:var(--error)">${escapeHtml(msg)}</p>
        <div class="error-section-label label-solution" style="margin-top:.75rem">💡 What to do</div>
        <p class="solution-text">
          1. Make sure your Gemini API key is correct (get one free at <strong>aistudio.google.com</strong>).<br>
          2. Click the 🔑 API Key button in the top-right to update your key.<br>
          3. Make sure you have an internet connection.<br>
          4. Try again — sometimes the AI needs a moment.
        </p>
      </div>
    </div>`;
}

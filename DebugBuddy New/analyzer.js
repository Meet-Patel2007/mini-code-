/* ========================================================
   DebugBuddy — Deep Error Analyzer (v2)
   Uses REAL parsers (Acorn for JS, Skulpt for Python)
   + comprehensive pattern rules for all languages
   ======================================================== */
const Analyzer = (() => {
    'use strict';

    /* ---- Helpers ---- */
    const stripStrings = s => s.replace(/(["'`])(?:(?!\1|\\).|\\.)*\1/g, '""');
    const isBlank = s => s.trim().length === 0;
    const isComment = (line, lang) => {
        const t = line.trim();
        if (lang === 'python') return t.startsWith('#');
        return t.startsWith('//') || t.startsWith('/*') || t.startsWith('*');
    };

    /* ========== REAL PARSER: JavaScript (Acorn) ========== */
    function parseJS(code) {
        const issues = [];
        if (typeof acorn === 'undefined') return issues;
        try {
            acorn.parse(code, { ecmaVersion: 2022, sourceType: 'module', locations: true });
        } catch (e) {
            const line = e.loc ? e.loc.line : 1;
            let msg = e.message.replace(/\(\d+:\d+\)/, '').trim();
            issues.push({
                line, severity: 'error', title: 'Syntax Error',
                explanation: `Your JavaScript code has a problem on line ${line}: ${msg}. Think of this like a spelling error in a sentence — the computer cannot understand what you're trying to do, so nothing will run.`,
                suggestion: `Fix the error on line ${line}. Common problems: unclosed quotes, missing brackets }), typos, or forgetting a comma. Look at the line number for clues!`,
                snippet: ''
            });
        }
        return issues;
    }

    /* ========== REAL PARSER: Python (Skulpt) ========== */
    function parsePython(code) {
        const issues = [];
        if (typeof Sk === 'undefined') return issues;
        try {
            Sk.configure({ output: () => { }, read: f => { if (Sk.builtinFiles && Sk.builtinFiles["files"][f]) return Sk.builtinFiles["files"][f]; throw "File not found"; } });
            Sk.importMainWithBody("<stdin>", false, code, true);
        } catch (e) {
            const msg = e.toString();
            const lineMatch = msg.match(/line (\d+)/i);
            const line = lineMatch ? parseInt(lineMatch[1]) : 1;
            let cleanMsg = msg.replace(/^.*?Error:\s*/i, '').replace(/on line \d+.*$/i, '').trim();
            if (!cleanMsg) cleanMsg = msg;
            let sev = 'error', title = 'Python Error';
            if (/SyntaxError/i.test(msg)) title = 'Syntax Error';
            else if (/IndentationError/i.test(msg)) title = 'Indentation Error';
            else if (/NameError/i.test(msg)) title = 'Undefined Variable';
            else if (/TypeError/i.test(msg)) title = 'Type Error';
            else if (/AttributeError/i.test(msg)) title = 'Attribute Error';
            else if (/IndexError/i.test(msg)) title = 'Index Out of Range';
            else if (/KeyError/i.test(msg)) title = 'Key Error';
            else if (/ValueError/i.test(msg)) title = 'Value Error';
            else if (/ZeroDivisionError/i.test(msg)) title = 'Division by Zero';
            else if (/ImportError/i.test(msg)) title = 'Import Error';
            issues.push({
                line, severity: sev, title,
                explanation: `Your code has a problem on line ${line}: ${cleanMsg}. This is like a broken toy — Python cannot run any code until you fix it.`,
                suggestion: `Look at line ${line} and look for mistakes. ${title.toLowerCase()} issues need to be fixed. Python always stops at the first mistake it finds.`,
                snippet: ''
            });
        }
        return issues;
    }

    /* ========== BRACKET / BRACE BALANCER (all languages) ========== */
    function checkBracketBalance(code, lang) {
        const issues = [];
        const lines = code.split('\n');
        const stack = []; // { char, line }
        const match = { ')': '(', ']': '[', '}': '{' };
        const names = { '(': 'parenthesis', ')': 'parenthesis', '[': 'square bracket', ']': 'square bracket', '{': 'curly brace', '}': 'curly brace' };

        for (let i = 0; i < lines.length; i++) {
            const stripped = stripStrings(lines[i]);
            if (isComment(lines[i], lang)) continue;
            for (const ch of stripped) {
                if ('([{'.includes(ch)) {
                    stack.push({ char: ch, line: i + 1 });
                } else if (')]}'.includes(ch)) {
                    if (stack.length === 0) {
                        issues.push({
                            line: i + 1, severity: 'error', title: `Extra closing ${names[ch]} "${ch}"`,
                            explanation: `You have a closing bracket "${ch}" without an opening one. It's like trying to close a door that was never opened!`,
                            suggestion: `Either remove the "${ch}" OR add the matching opening "${match[ch]}" before it.`, snippet: lines[i].trim()
                        });
                    } else {
                        const top = stack[stack.length - 1];
                        if (top.char !== match[ch]) {
                            issues.push({
                                line: i + 1, severity: 'error', title: `Mismatched bracket: expected closing for "${top.char}" (line ${top.line}), found "${ch}"`,
                                explanation: `You opened a "${top.char}" on line ${top.line} but tried to close it with "${ch}" on this line. Each bracket type must match: ( with ), [ with ], { with }.`,
                                suggestion: `Check both line ${top.line} and line ${i + 1}. Either change this "${ch}" to "${top.char === '(' ? ')' : top.char === '[' ? ']' : '}'}" or fix the opening bracket.`, snippet: lines[i].trim()
                            });
                            stack.pop();
                        } else {
                            stack.pop();
                        }
                    }
                }
            }
        }
        for (const item of stack) {
            const close = item.char === '(' ? ')' : item.char === '[' ? ']' : '}';
            issues.push({
                line: item.line, severity: 'error', title: `Unclosed ${names[item.char]} "${item.char}"`,
                explanation: `You opened a bracket "${item.char}" on line ${item.line} but never closed it. It's like an unclosed parenthetical statement that never ends...`,
                suggestion: `Add a "${close}" at the end.`, snippet: ''
            });
        }
        return issues;
    }

    /* ========== JAVASCRIPT RULES ========== */
    const jsRules = [
        {
            id: 'js-assign-cond', check(l, n) {
                if (isComment(l, 'javascript')) return;
                const s = stripStrings(l.trim());
                if (/\b(if|while)\s*\(/.test(s) && /[^!=<>]=[^=]/.test(s) && !/===/.test(s) && !/!==/.test(s)) {
                    // Make sure it's not == that partially matched
                    const condMatch = s.match(/\b(if|while)\s*\((.*)\)/);
                    if (condMatch) {
                        const cond = condMatch[2];
                        if (/[^!=<>]=[^=]/.test(cond) && !cond.includes('=='))
                            return { line: n, severity: 'error', title: 'Assignment (=) instead of comparison (==)', explanation: 'You used = (assign) inside a condition. This sets the variable instead of comparing it. The condition will use the assigned value, which is almost always a bug.', suggestion: 'Use === (strict equality) or == (loose equality) instead of = for comparisons.', snippet: l.trim() };
                    }
                }
            }
        },
        {
            id: 'js-loose-eq', check(l, n) {
                if (isComment(l, 'javascript')) return;
                const s = stripStrings(l);
                if (/[^!=]={2}[^=]/.test(s) && !s.includes('==='))
                    return { line: n, severity: 'warning', title: 'Loose equality (==) — use strict equality (===)', explanation: '== does type coercion before comparing, leading to surprises like "5" == 5 being true. This is a common source of bugs.', suggestion: 'Use === which checks both value AND type. It is safer and recommended by all major style guides.', snippet: l.trim() };
            }
        },
        {
            id: 'js-var', check(l, n) {
                if (isComment(l, 'javascript')) return;
                if (/\bvar\s+/.test(l)) return { line: n, severity: 'warning', title: 'Using "var" — prefer "let" or "const"', explanation: '"var" is function-scoped and hoisted, which causes confusing bugs. Modern JavaScript uses "let" and "const" which are block-scoped and predictable.', suggestion: 'Use "const" if the value never changes, "let" if it does. Never use "var" in modern code.', snippet: l.trim() };
            }
        },
        {
            id: 'js-console', check(l, n) {
                if (isComment(l, 'javascript')) return;
                if (/console\.(log|warn|error|debug|info|table|trace)\s*\(/.test(l))
                    return { line: n, severity: 'info', title: 'console statement detected', explanation: 'Console statements are useful for debugging but should be removed before production. They can leak information and slow performance.', suggestion: 'Remove console statements before deploying, or use a proper logging library.', snippet: l.trim() };
            }
        },
        {
            id: 'js-empty-catch', check(l, n, all) {
                if (/catch\s*\(.*\)\s*{\s*}/.test(l.trim()))
                    return { line: n, severity: 'warning', title: 'Empty catch block — errors silently swallowed', explanation: 'This catch block does nothing with the error. Bugs will disappear without a trace, making debugging nearly impossible.', suggestion: 'At minimum log the error: catch(e) { console.error(e); }. Better: handle it properly.', snippet: l.trim() };
                if (/catch\s*\(.*\)\s*{\s*$/.test(l.trim()) && n < all.length && all[n].trim() === '}')
                    return { line: n, severity: 'warning', title: 'Empty catch block — errors silently swallowed', explanation: 'This catch block has no code inside. Any error will vanish without a trace.', suggestion: 'Add error handling: catch(error) { console.error("Error:", error); }', snippet: l.trim() };
            }
        },
        {
            id: 'js-inf-loop', check(l, n) {
                if (isComment(l, 'javascript')) return;
                if (/while\s*\(\s*true\s*\)/.test(l) || /for\s*\(\s*;\s*;\s*\)/.test(l))
                    return { line: n, severity: 'warning', title: 'Potential infinite loop', explanation: 'This loop runs forever unless there is a break statement inside. If the break condition is never met, your program will freeze.', suggestion: 'Ensure there is a reliable break condition inside the loop, or rewrite with a proper termination condition.', snippet: l.trim() };
            }
        },
        {
            id: 'js-no-semi', check(l, n) {
                const t = l.trim();
                if (isComment(l, 'javascript') || isBlank(l)) return;
                if (/^(if|else|for|while|switch|case|default|try|catch|finally|function|class|\/\/|\/\*|\*|{|}|import |export )/.test(t)) return;
                if (/[{},]$/.test(t) || /\)\s*$/.test(t) || /=>\s*{?$/.test(t)) return;
                if (/^(const |let |var |return |throw )/.test(t) && !t.endsWith(';') && !t.endsWith('{') && !t.endsWith(','))
                    return { line: n, severity: 'warning', title: 'Possible missing semicolon', explanation: 'This statement does not end with a semicolon. While JavaScript has automatic semicolon insertion, relying on it can cause unexpected bugs.', suggestion: 'Add a semicolon at the end of the line to be explicit and safe.', snippet: t };
            }
        },
        {
            id: 'js-typeof-undef', check(l, n) {
                if (isComment(l, 'javascript')) return;
                if (/===?\s*undefined\b/.test(l) && !/typeof/.test(l))
                    return { line: n, severity: 'warning', title: 'Direct comparison with undefined', explanation: 'Comparing directly to undefined can fail if someone has redefined undefined (yes, that is possible in non-strict mode). It also does not catch variables that were never declared.', suggestion: 'Use typeof check: typeof x === "undefined" is safer. Or use strict equality with void 0.', snippet: l.trim() };
            }
        },
        {
            id: 'js-delete-arr', check(l, n) {
                if (/\bdelete\s+\w+\[/.test(l))
                    return { line: n, severity: 'warning', title: 'Using delete on array element', explanation: 'delete on an array element does NOT remove it — it leaves a hole (undefined) and the array length stays the same. This is almost never what you want.', suggestion: 'Use array.splice(index, 1) to properly remove an element, or array.filter() to create a new array without it.', snippet: l.trim() };
            }
        },
        {
            id: 'js-nan-compare', check(l, n) {
                if (isComment(l, 'javascript')) return;
                if (/===?\s*NaN|NaN\s*===?/.test(l))
                    return { line: n, severity: 'error', title: 'Comparing with NaN — always false', explanation: 'NaN is the only value in JavaScript that is not equal to itself! x === NaN is ALWAYS false, even if x is NaN. This comparison never works.', suggestion: 'Use Number.isNaN(x) or isNaN(x) to check if a value is NaN.', snippet: l.trim() };
            }
        },
        {
            id: 'js-await-noasync', check(l, n, all) {
                if (isComment(l, 'javascript')) return;
                if (/\bawait\s+/.test(l)) {
                    let found = false;
                    for (let j = n - 2; j >= 0; j--) {
                        if (/\basync\b/.test(all[j])) { found = true; break; }
                        if (/^(function|class)\b/.test(all[j].trim()) && !/async/.test(all[j])) break;
                    }
                    if (!found) return { line: n, severity: 'error', title: '"await" used outside async function', explanation: 'The await keyword can only be used inside an async function. Using it elsewhere causes a syntax error.', suggestion: 'Mark the enclosing function with "async": async function myFunc() { ... }', snippet: l.trim() };
                }
            }
        },
        {
            id: 'js-neg-arr-idx', check(l, n) {
                if (isComment(l, 'javascript')) return;
                const m = l.match(/\w+\[\s*-\d+\s*\]/);
                if (m) return { line: n, severity: 'warning', title: 'Negative array index', explanation: 'JavaScript arrays do not support negative indices like Python does. arr[-1] does not return the last element — it returns undefined.', suggestion: 'Use arr[arr.length - 1] for the last element, or arr.at(-1) in modern JavaScript.', snippet: l.trim() };
            }
        },
        {
            id: 'js-str-concat-loop', check(l, n, all) {
                if (isComment(l, 'javascript')) return;
                if (/\+=\s*["'`]/.test(l) || /\+=\s*\w/.test(l)) {
                    for (let j = n - 2; j >= Math.max(0, n - 5); j--) {
                        if (/\b(for|while)\b/.test(all[j]))
                            return { line: n, severity: 'info', title: 'String concatenation in loop — performance concern', explanation: 'Building strings with += inside a loop creates a new string object each iteration. For large loops this is very slow because strings are immutable.', suggestion: 'Collect parts in an array and use .join() at the end, or use template literals.', snippet: l.trim() };
                    }
                }
            }
        },
    ];

    /* ========== PYTHON RULES ========== */
    const pyRules = [
        {
            id: 'py-colon', check(l, n) {
                if (isComment(l, 'python') || isBlank(l)) return;
                const t = l.trim();
                if (/^(if|elif|else|for|while|def|class|try|except|finally|with)(\s+|\(|:|$)/.test(t) && !t.endsWith(':') && !t.endsWith(':\\') && !t.includes('#'))
                    return { line: n, severity: 'error', title: 'Missing colon (:) at end of block statement', explanation: 'Python requires a colon at the end of if, for, while, def, class, etc. Without it, you get a SyntaxError.', suggestion: 'Add a colon at the end: "if x > 5:" or "def my_func():"', snippet: t };
            }
        },
        {
            id: 'py-indent', check(l, n) {
                if (isBlank(l)) return;
                const ws = l.match(/^(\s*)/)[1];
                if (ws.includes('\t') && ws.includes(' '))
                    return { line: n, severity: 'error', title: 'Mixed tabs and spaces', explanation: 'Python does not allow mixing tabs and spaces for indentation. This causes an IndentationError.', suggestion: 'Use 4 spaces per indent level consistently. Configure your editor to convert tabs to spaces.', snippet: l.replace(/\t/g, '→   ') };
            }
        },
        {
            id: 'py-print', check(l, n) {
                if (isComment(l, 'python') || isBlank(l)) return;
                if (/^print\s+[^(]/.test(l.trim()))
                    return { line: n, severity: 'error', title: 'print needs parentheses in Python 3', explanation: 'In Python 3, print is a function. "print hello" is invalid — you must use print("hello").', suggestion: 'Add parentheses: print("Hello, world!")', snippet: l.trim() };
            }
        },
        {
            id: 'py-mutable-default', check(l, n) {
                if (/def\s+\w+\s*\(.*=\s*(\[\]|{}|\(\))/.test(l))
                    return { line: n, severity: 'warning', title: 'Mutable default argument (list/dict)', explanation: 'Default mutable arguments are shared across ALL calls. Appending to a default [] accumulates values between function calls — a very common and confusing bug.', suggestion: 'Use None as default: def func(items=None): if items is None: items = []', snippet: l.trim() };
            }
        },
        {
            id: 'py-bare-except', check(l, n) {
                if (/^\s*except\s*:/.test(l))
                    return { line: n, severity: 'warning', title: 'Bare except catches ALL exceptions', explanation: 'except: without a type catches everything including KeyboardInterrupt and SystemExit. This can prevent your program from being stopped and hides real errors.', suggestion: 'Specify the exception: except ValueError: or except Exception as e: for general errors.', snippet: l.trim() };
            }
        },
        {
            id: 'py-none-cmp', check(l, n) {
                if (isComment(l, 'python')) return;
                if (/==\s*None|None\s*==/.test(l))
                    return { line: n, severity: 'info', title: 'Use "is None" instead of "== None"', explanation: '"==" can be overridden by classes. "is" checks identity and is the correct, Pythonic way to compare with None.', suggestion: 'Replace "== None" with "is None" and "!= None" with "is not None".', snippet: l.trim() };
            }
        },
        {
            id: 'py-fstring', check(l, n) {
                if (isComment(l, 'python')) return;
                if (/(?<![f])(["']).*\{[a-zA-Z_]\w*\}.*\1/.test(l) && !/f["']/.test(l) && !/\.format\(/.test(l) && !/\%/.test(l))
                    return { line: n, severity: 'warning', title: 'Missing f-string prefix', explanation: 'This string has {variable} placeholders but no "f" prefix. Without f, the braces are treated as literal text.', suggestion: 'Add f before the string: f"Hello, {name}!" instead of "Hello, {name}!"', snippet: l.trim() };
            }
        },
        {
            id: 'py-assign-cond', check(l, n) {
                const t = stripStrings(l.trim());
                if (/^(if|elif|while)\s+.*[^!=<>:]=(?!=)/.test(t) && !t.includes('==') && !t.includes(':='))
                    return { line: n, severity: 'error', title: 'Assignment (=) in condition — did you mean ==?', explanation: 'Python does not allow assignment inside conditions (unlike C/JS). This is a SyntaxError. You likely meant == for comparison.', suggestion: 'Use == for comparison: "if x == 5:" instead of "if x = 5:"', snippet: l.trim() };
            }
        },
        {
            id: 'py-global-var', check(l, n) {
                if (/^\s*global\s+\w/.test(l))
                    return { line: n, severity: 'info', title: 'Using global variable', explanation: 'Global variables make code harder to understand, test, and debug. They create hidden dependencies between functions.', suggestion: 'Pass values as function parameters and return results instead of using global.', snippet: l.trim() };
            }
        },
        {
            id: 'py-string-is', check(l, n) {
                if (isComment(l, 'python')) return;
                if (/\bis\s+["']|["']\s+is\b/.test(l) || /\bis\s+\d|^\d+\s+is\b/.test(l))
                    return { line: n, severity: 'error', title: 'Using "is" to compare values — use "==" instead', explanation: '"is" checks if two variables point to the same object in memory, not if they have the same value. For strings and numbers, this can give unpredictable results.', suggestion: 'Use == to compare values, and reserve "is" only for None, True, False checks.', snippet: l.trim() };
            }
        },
        {
            id: 'py-self-missing', check(l, n) {
                if (/^\s*def\s+\w+\s*\(\s*\)\s*:/.test(l)) {
                    // Check if inside a class by looking for class above
                    return; // Hard to detect without AST, Skulpt handles this
                }
            }
        },
        {
            id: 'py-div-zero', check(l, n) {
                if (isComment(l, 'python')) return;
                if (/\/\s*0[^.]/.test(stripStrings(l)) || /\/\s*0\s*$/.test(stripStrings(l)))
                    return { line: n, severity: 'error', title: 'Division by zero', explanation: 'Dividing by zero will crash your program with a ZeroDivisionError at runtime.', suggestion: 'Check the divisor before dividing: if divisor != 0: result = numerator / divisor', snippet: l.trim() };
            }
        },
        {
            id: 'py-return-outside', check(l, n, all) {
                if (/^\s*return\b/.test(l)) {
                    let inDef = false;
                    for (let j = n - 2; j >= 0; j--) {
                        if (/^\s*def\s+/.test(all[j])) { inDef = true; break; }
                        if (/^\s*class\s+/.test(all[j])) break;
                        if (/^\S/.test(all[j]) && !isBlank(all[j]) && !isComment(all[j], 'python')) break;
                    }
                    if (!inDef) return { line: n, severity: 'error', title: 'return outside function', explanation: '"return" can only be used inside a function (def). Using it at the top level or outside any function is a SyntaxError.', suggestion: 'Move this code inside a function, or use sys.exit() if you want to exit the program.', snippet: l.trim() };
                }
            }
        },
    ];

    /* ========== JAVA RULES ========== */
    const javaRules = [
        {
            id: 'java-semi', check(l, n) {
                const t = l.trim();
                if (isComment(l, 'java') || isBlank(l)) return;
                if (/^(if|else|for|while|switch|case|default|try|catch|finally|class|interface|enum|import |package |public |private |protected |\/\/|\/\*|\*|{|}|@)/.test(t)) return;
                if (/[{},]$/.test(t) || /\)\s*{?$/.test(t)) return;
                if (/(\w+\s+\w+\s*=|return |throw |System\.|break|continue)/.test(t) && !t.endsWith(';') && !t.endsWith('{'))
                    return { line: n, severity: 'error', title: 'Missing semicolon', explanation: 'Java requires a semicolon at the end of every statement. The compiler will throw an error.', suggestion: 'Add a semicolon at the end of this line.', snippet: t };
            }
        },
        {
            id: 'java-str-eq', check(l, n) {
                if (isComment(l, 'java')) return;
                if (/["']\s*==|==\s*["']/.test(l))
                    return { line: n, severity: 'error', title: 'Comparing strings with == — use .equals()', explanation: 'In Java, == checks if strings are the same object in memory, not if they have the same text. Two identical strings can be different objects.', suggestion: 'Use str1.equals(str2) for value comparison. For null-safe: Objects.equals(str1, str2).', snippet: l.trim() };
            }
        },
        {
            id: 'java-null-deref', check(l, n) {
                if (/=\s*null\s*;/.test(l))
                    return { line: n, severity: 'info', title: 'Variable set to null — NullPointerException risk', explanation: 'If you call a method on this variable without a null check, Java will throw a NullPointerException at runtime.', suggestion: 'Add a null check before use: if (variable != null) { ... }. Or use Optional<T>.', snippet: l.trim() };
            }
        },
        {
            id: 'java-empty-catch', check(l, n) {
                if (/catch\s*\(.*\)\s*{\s*}/.test(l.trim()))
                    return { line: n, severity: 'warning', title: 'Empty catch block', explanation: 'This catch block silently swallows exceptions. Bugs become invisible.', suggestion: 'At minimum: catch (Exception e) { e.printStackTrace(); }', snippet: l.trim() };
            }
        },
        {
            id: 'java-raw-type', check(l, n) {
                if (isComment(l, 'java')) return;
                if (/\b(ArrayList|HashMap|HashSet|LinkedList|TreeMap|List|Map|Set)\s+\w+\s*=\s*new\s+\1\s*\(\)/.test(l) && !/</.test(l))
                    return { line: n, severity: 'warning', title: 'Raw type used — missing generics <T>', explanation: 'Using collections without generics (raw types) disables type checking. You lose compile-time safety and can get ClassCastExceptions at runtime.', suggestion: 'Add type parameters: List<String> names = new ArrayList<>() instead of List names = new ArrayList()', snippet: l.trim() };
            }
        },
        {
            id: 'java-arr-vs-length', check(l, n) {
                if (isComment(l, 'java')) return;
                if (/\.\s*length\s*\(\s*\)/.test(l) && !/String|string/.test(l))
                    return { line: n, severity: 'info', title: 'Arrays use .length (no parentheses), Strings use .length()', explanation: 'In Java, arr.length is a field (no parentheses) while str.length() is a method (with parentheses). Mixing them up is a compile error.', suggestion: 'For arrays: arr.length. For Strings: str.length(). For collections: col.size().', snippet: l.trim() };
            }
        },
        {
            id: 'java-concat-loop', check(l, n, all) {
                if (isComment(l, 'java')) return;
                if (/\+=\s*"/.test(l) || /String\s+\w+\s*=\s*\w+\s*\+\s*"/.test(l)) {
                    for (let j = n - 2; j >= Math.max(0, n - 5); j--) {
                        if (/\b(for|while)\b/.test(all[j]))
                            return { line: n, severity: 'warning', title: 'String concatenation in loop — use StringBuilder', explanation: 'Strings in Java are immutable. Concatenating with += in a loop creates a new String each iteration, which is O(n²) and very slow for large loops.', suggestion: 'Use StringBuilder: sb.append(...) inside the loop, then sb.toString() after.', snippet: l.trim() };
                    }
                }
            }
        },
        {
            id: 'java-int-div', check(l, n) {
                if (isComment(l, 'java')) return;
                if (/\b(double|float)\s+\w+\s*=\s*\d+\s*\/\s*\d+\s*;/.test(l)) {
                    const m = l.match(/(\d+)\s*\/\s*(\d+)/);
                    if (m && !m[1].includes('.') && !m[2].includes('.'))
                        return { line: n, severity: 'warning', title: 'Integer division assigned to decimal type', explanation: 'Dividing two integers in Java gives an integer result (truncated). 7/2 = 3, not 3.5, even if you store it in a double.', suggestion: 'Cast one operand to double: (double) 7 / 2, or use decimal literals: 7.0 / 2.', snippet: l.trim() };
                }
            }
        },
    ];

    /* ========== C / C++ RULES ========== */
    const cRules = [
        {
            id: 'c-semi', check(l, n) {
                const t = l.trim();
                if (isComment(l, 'clike') || isBlank(l)) return;
                if (/^#|^(if|else|for|while|switch|case|default|do|\/\/|\/\*|\*|{|}|typedef |struct |enum |union )/.test(t)) return;
                if (/[{},]$/.test(t) || /\)\s*{$/.test(t)) return;
                if (/(int |float |double |char |long |short |void |auto |bool |string |return |printf|scanf|cout|cin|std::)/.test(t) && !t.endsWith(';') && !t.endsWith('{') && !t.endsWith(',')) {
                    if (/\)$/.test(t) && !/(^|[^a-zA-Z0-9_])printf|scanf|cout|cin/.test(t)) return;
                    return { line: n, severity: 'error', title: 'Missing semicolon ;', explanation: 'C/C++ needs a semicolon at the end of every statement. It\'s like a period at the end of a sentence — without it, the compiler gets confused.', suggestion: 'Add ; at the end of line. Hint: if the error message points elsewhere, check this line!', snippet: t };
                }
            }
        },
        {
            id: 'c-assign-cond', check(l, n) {
                const s = stripStrings(l.trim());
                if (/\b(if|while)\s*\(.*[^!=<>]=[^=]/.test(s) && !/==/.test(s))
                    return { line: n, severity: 'error', title: 'Assignment (=) instead of comparison (==)', explanation: 'Single = inside a condition assigns a value instead of comparing. The condition evaluates to the assigned value, which is almost always a bug.', suggestion: 'Use == for comparison. Defensive style: write (5 == x) to make this mistake impossible.', snippet: l.trim() };
            }
        },
        {
            id: 'c-scanf-missing-address', check(l, n) {
                if (isComment(l, 'clike')) return;
                // Match scanf usage
                const scanfMatch = l.match(/scanf\s*\(\s*"[^"]*"\s*,\s*([^)]+)\s*\)/);
                if (scanfMatch) {
                    // Check if argument is a variable without &
                    const args = scanfMatch[1].split(',').map(a => a.trim());
                    for (const arg of args) {
                        // If argument is a single variable (not &var, not array, not pointer)
                        if (/^[a-zA-Z_]\w*$/.test(arg) && !arg.startsWith('&')) {
                            return {
                                line: n,
                                severity: 'error',
                                title: 'Missing address-of operator (&) in scanf argument',
                                explanation: 'scanf expects a pointer to the variable, not the variable itself. Without &a, the input will not be stored correctly and may cause undefined behavior.',
                                suggestion: `Change scanf("%d", ${arg}); to scanf("%d", &${arg});`,
                                snippet: l.trim()
                            };
                        }
                    }
                }
            }
        },
        {
            id: 'c-unsafe-fn', check(l, n) {
                if (isComment(l, 'clike')) return;
                const m = l.match(/\b(gets|sprintf|strcpy|strcat|scanf)\s*\(/);
                if (m) {
                    const fn = m[1];
                    const safe = { gets: 'fgets(buf, size, stdin)', sprintf: 'snprintf()', strcpy: 'strncpy()', strcat: 'strncat()', scanf: 'fgets() + sscanf()' };
                    return { line: n, severity: 'warning', title: `Unsafe function "${fn}" — buffer overflow risk`, explanation: `"${fn}" does not check buffer size. While common for beginners, "${fn}" can cause crashes if input exceeds the buffer. It is a security risk in professional code.`, suggestion: `Use the safe alternative: ${safe[fn]}. These let you specify a maximum length.`, snippet: l.trim() };
                }
            }
        },
        {
            id: 'c-malloc', check(l, n) {
                if (isComment(l, 'clike')) return;
                if (/\b(malloc|calloc|realloc)\s*\(/.test(l))
                    return { line: n, severity: 'info', title: 'Dynamic memory allocation — ensure free() is called', explanation: 'Memory allocated with malloc/calloc must be freed when done. Forgetting creates a memory leak — memory stays reserved but inaccessible, slowly consuming all available RAM.', suggestion: 'For every malloc, add a corresponding free(). In C++, prefer smart pointers (unique_ptr, shared_ptr).', snippet: l.trim() };
                if (/\bnew\s+\w/.test(l) && !/\bnew\s+(std::)/.test(l))
                    return { line: n, severity: 'info', title: 'Dynamic allocation with "new" — ensure "delete" is called', explanation: 'Memory allocated with "new" must be freed with "delete". Memory leaks are one of the hardest bugs to track down.', suggestion: 'Use smart pointers: std::unique_ptr<T> or std::make_unique<T>() for automatic cleanup.', snippet: l.trim() };
            }
        },
        {
            id: 'c-div-zero', check(l, n) {
                if (isComment(l, 'clike')) return;
                if (/\/\s*0[^.]/.test(stripStrings(l)) || /\/\s*0\s*[;)]/.test(stripStrings(l)))
                    return { line: n, severity: 'error', title: 'Division by zero', explanation: 'Dividing by zero causes undefined behavior in C/C++. The program may crash, produce garbage, or appear to work but corrupt memory.', suggestion: 'Always check the divisor: if (divisor != 0) { result = num / divisor; }', snippet: l.trim() };
            }
        },
        {
            id: 'c-sizeof-ptr', check(l, n) {
                if (isComment(l, 'clike')) return;
                if (/sizeof\s*\(\s*\w+\s*\*\s*\)/.test(l) || /sizeof\s*\(\s*\w+\s*\)\s*\/\s*sizeof/.test(l))
                    return; // legitimate pattern
                if (/sizeof\s*\(\s*\w+\s*\)/.test(l) && /\*\s*\w+/.test(l))
                    return { line: n, severity: 'warning', title: 'sizeof on pointer gives pointer size, not array size', explanation: 'sizeof(ptr) returns the size of the pointer itself (4 or 8 bytes), not the size of the data it points to. This is a very common mistake when working with arrays passed to functions.', suggestion: 'Pass the array size as a separate parameter, or use sizeof(arr)/sizeof(arr[0]) only when arr is a true array (not a pointer).', snippet: l.trim() };
            }
        },
        {
            id: 'c-uninit', check(l, n) {
                if (isComment(l, 'clike')) return;
                if (/^\s*(int|float|double|char|long|short|bool|unsigned)\s+(\w+)\s*;/.test(l) && !/=/.test(l))
                    return { line: n, severity: 'info', title: 'Uninitialized variable declaration', explanation: 'Local variables in C/C++ contain garbage data until assigned. Using them before assignment gives unpredictable results.', suggestion: 'Always initialize: int x = 0; (unless initializing via scanf immediately).', snippet: l.trim() };
            }
        },
        {
            id: 'c-arr-bounds', check(l, n, all) {
                if (isComment(l, 'clike')) return;
                const arrDecl = l.match(/(\w+)\s*\[\s*(\d+)\s*\]/);
                if (arrDecl) {
                    const name = arrDecl[1], size = parseInt(arrDecl[2]);
                    for (let j = n; j < Math.min(all.length, n + 20); j++) {
                        const idxMatch = all[j].match(new RegExp(name + '\\[\\s*(\\d+)\\s*\\]'));
                        if (idxMatch && parseInt(idxMatch[1]) >= size)
                            return { line: j + 1, severity: 'error', title: `Array index out of bounds: ${name}[${idxMatch[1]}] but size is ${size}`, explanation: `Array "${name}" has ${size} elements (indices 0-${size - 1}), but you are accessing index ${idxMatch[1]} which is beyond the end of the array. This causes undefined behavior.`, suggestion: `Use an index between 0 and ${size - 1}. Remember: a ${size}-element array has valid indices 0 to ${size - 1}.`, snippet: all[j].trim() };
                    }
                }
            }
        },
    ];

    /* ========== GLOBAL RULES ========== */
    const globalRules = [
        {
            id: 'g-todo', check(l, n) {
                if (/\b(TODO|FIXME|HACK|XXX|BUG)\b/.test(l)) {
                    const tag = l.match(/\b(TODO|FIXME|HACK|XXX|BUG)\b/)[1];
                    return { line: n, severity: 'info', title: `${tag} comment — pending work`, explanation: `A ${tag} comment indicates unfinished work. These should be resolved before release.`, suggestion: `Address the ${tag} or create a ticket to track it.`, snippet: l.trim() };
                }
            }
        },
        {
            id: 'g-long-line', check(l, n) {
                if (l.length > 200)
                    return { line: n, severity: 'info', title: 'Very long line (200+ characters)', explanation: 'Lines this long are hard to read and review. Most style guides recommend 80-120 characters max.', suggestion: 'Break the line into multiple lines for readability.', snippet: l.trim().substring(0, 80) + '...' };
            }
        },
        {
            id: 'g-trailing-ws', check(l, n) {
                if (/\S\s{4,}$/.test(l))
                    return { line: n, severity: 'info', title: 'Excessive trailing whitespace', explanation: 'This line has unnecessary whitespace at the end. This clutters diffs in version control.', suggestion: 'Remove trailing whitespace. Most editors can do this automatically.', snippet: '' };
            }
        },
        {
            id: 'g-lang-mixup', check(l, n, all, lang) {
                const t = l.trim();
                const isJS = /console\.log|const\s+|let\s+|var\s+|function\(|=>/.test(t);
                const isPy = /^print\(|^def\s+|:\s*$|#\s+/.test(t);

                if (lang === 'java' || lang === 'clike') {
                    if (isJS) return { line: n, severity: 'warning', title: 'Wrong Language? (JavaScript detected)', explanation: 'Your code looks like JavaScript, but you have selected Java/C. These languages have very different ways of printing to the screen and defining variables.', suggestion: 'Switch the language in the dropdown to JavaScript.', snippet: t };
                    if (isPy) return { line: n, severity: 'warning', title: 'Wrong Language? (Python detected)', explanation: 'Your code looks like Python, but you have selected Java/C.', suggestion: 'Switch the language in the dropdown to Python.', snippet: t };
                }
                if (lang === 'python' && isJS) {
                    return { line: n, severity: 'warning', title: 'Wrong Language? (JavaScript detected)', explanation: 'You are using JavaScript-style console.log or variable declarations in a Python environment.', suggestion: 'Use print() instead of console.log().', snippet: t };
                }
                if (lang === 'javascript' && isPy && !t.includes('=>') && !t.includes('{')) {
                    if (/^def\s+/.test(t)) return { line: n, severity: 'warning', title: 'Wrong Language? (Python detected)', explanation: 'You used "def" to define a function. JavaScript uses "function" or arrow syntax (=>).', suggestion: 'Change "def" to "function".', snippet: t };
                }
            }
        },
    ];

    /* ========== MAIN ANALYZE ========== */
    function analyze(code, language) {
        const lines = code.split('\n');
        const issues = [];
        const seen = new Set();

        // 1. Run REAL PARSER for complete error detection
        if (language === 'javascript') {
            parseJS(code).forEach(i => { issues.push(i); seen.add(i.line + ':parser'); });
        } else if (language === 'python') {
            parsePython(code).forEach(i => { issues.push(i); seen.add(i.line + ':parser'); });
        }

        // 2. Run bracket balancer for all languages
        checkBracketBalance(code, language).forEach(i => {
            const k = i.line + ':bracket';
            if (!seen.has(k)) { seen.add(k); issues.push(i); }
        });

        // 3. Run language-specific pattern rules
        let langRules;
        switch (language) {
            case 'python': langRules = pyRules; break;
            case 'java': langRules = javaRules; break;
            case 'clike': langRules = cRules; break;
            default: langRules = jsRules; break;
        }
        const allRules = [...langRules, ...globalRules];

        for (let i = 0; i < lines.length; i++) {
            for (const rule of allRules) {
                try {
                    const r = rule.check(lines[i], i + 1, lines, language);
                    if (r) {
                        const k = `${r.line}:${rule.id}`;
                        if (!seen.has(k)) { seen.add(k); issues.push(r); }
                    }
                } catch (e) { /* skip rule errors */ }
            }
        }

        // Sort: errors first, then by line
        const sev = { error: 0, warning: 1, info: 2 };
        issues.sort((a, b) => a.line !== b.line ? a.line - b.line : (sev[a.severity] || 9) - (sev[b.severity] || 9));
        return issues;
    }

    return { analyze };
})();

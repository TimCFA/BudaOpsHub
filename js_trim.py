"""Trims a script for sending: comments, indentation and blank lines come
out; the program stays the same (Tim, Nov 13 2026: a first load is mostly
script, and about a fifth of it was notes for people).

It only ever does four things, and only outside strings, template literals
and regular expressions:
  - drops `//` comments (a whole line, or the tail of one),
  - drops `/* ... */` comments (one that held a line break leaves a line
    break, as the language counts it),
  - drops the spaces a line starts and ends with,
  - drops blank lines.
Lines are never joined and nothing inside a line of code is touched, so
where statements end is unchanged. Template literals keep every character,
nested ones included (the page's HTML lives in them).

tests/test_js_trim.py parses every script before and after and fails if the
two programs differ; app.py serves the original if trimming raises.
"""
import re

# After one of these a "/" starts a regular expression, not a division.
_REGEX_AFTER = set('(,=:[!&|?{};+-*%<>~^')
_REGEX_AFTER_WORDS = {'return', 'typeof', 'case', 'in', 'of', 'void', 'delete', 'throw', 'new', 'else', 'do', 'instanceof', 'yield', 'await'}
_WORD = re.compile(r'[A-Za-z0-9_$]')


def trim_js(src):
    out = []            # the pieces kept, in order
    line = []           # the current output line's pieces
    n = len(src)
    i = 0
    # Where we are: a stack of 'code' (top level, or inside ${ } with its
    # brace depth) and 'tpl' (inside a template literal's text).
    stack = [['code', 0]]
    last = ''           # the last significant character of code seen
    last_word = ''      # the word it ended, if any
    line_has_code = False

    def end_line():
        nonlocal line, line_has_code
        text = ''.join(line)
        if stack[-1][0] == 'tpl' or line_tpl[0]:
            out.append(text + '\n')                    # a line with template text in it: as written
        else:
            text = text.strip()
            if text:
                out.append(text + '\n')
        line = []
        line_has_code = False
        line_tpl[0] = stack[-1][0] == 'tpl'

    line_tpl = [False]   # the current line holds template text (so its spaces matter)

    while i < n:
        c = src[i]
        mode = stack[-1][0]
        if mode == 'tpl':
            line_tpl[0] = True
            if c == '\\' and i + 1 < n:
                line.append(src[i:i + 2]); i += 2
                if src[i - 1] == '\n':
                    end_line()
                continue
            if c == '`':
                line.append(c); i += 1; stack.pop(); last, last_word = '`', ''
                continue
            if c == '$' and i + 1 < n and src[i + 1] == '{':
                line.append('${'); i += 2; stack.append(['code', 0]); last, last_word = '{', ''
                continue
            if c == '\n':
                i += 1; end_line()
                continue
            line.append(c); i += 1
            continue
        # ---- code ----
        if c == '\n':
            i += 1; end_line()
            continue
        if c == '/' and i + 1 < n and src[i + 1] == '/':
            j = src.find('\n', i)
            i = n if j < 0 else j                      # the comment goes; the line break stays
            continue
        if c == '/' and i + 1 < n and src[i + 1] == '*':
            j = src.find('*/', i + 2)
            if j < 0:
                raise ValueError('unterminated comment')
            had_break = '\n' in src[i:j]
            i = j + 2
            if had_break:
                end_line()
            else:
                line.append(' ')
            continue
        if c in '"\'':
            j = i + 1
            while j < n and src[j] != c:
                if src[j] == '\\':
                    j += 1
                elif src[j] == '\n':
                    raise ValueError('unterminated string')
                j += 1
            if j >= n:
                raise ValueError('unterminated string')
            line.append(src[i:j + 1]); i = j + 1; last, last_word = c, ''
            continue
        if c == '`':
            line.append(c); i += 1; stack.append(['tpl', 0]); line_tpl[0] = True
            continue
        if c == '/':
            is_regex = (last == '' or last in _REGEX_AFTER or last_word in _REGEX_AFTER_WORDS)
            if is_regex:
                j = i + 1
                in_class = False
                while j < n:
                    d = src[j]
                    if d == '\\':
                        j += 1
                    elif d == '\n':
                        raise ValueError('unterminated regular expression')
                    elif d == '[':
                        in_class = True
                    elif d == ']':
                        in_class = False
                    elif d == '/' and not in_class:
                        break
                    j += 1
                if j >= n:
                    raise ValueError('unterminated regular expression')
                j += 1
                while j < n and _WORD.match(src[j]):
                    j += 1                                # flags
                line.append(src[i:j]); i = j; last, last_word = ')', ''
                continue
            line.append(c); i += 1; last, last_word = '/', ''
            continue
        if c == '{':
            stack[-1][1] += 1
        elif c == '}':
            if stack[-1][1] == 0 and len(stack) > 1:
                stack.pop()                               # the end of a ${ }: back in the template's text
                line.append(c); i += 1; line_tpl[0] = True
                continue
            stack[-1][1] -= 1
        if _WORD.match(c):
            j = i
            while j < n and _WORD.match(src[j]):
                j += 1
            word = src[i:j]
            line.append(word); i = j; last, last_word = word[-1], word
            continue
        line.append(c); i += 1
        if not c.isspace():
            last, last_word = c, ''
    if len(stack) != 1 or stack[0][1] != 0:
        raise ValueError('unbalanced template or braces')
    end_line()
    return ''.join(out)

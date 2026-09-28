"""Change-based saves: apply a page's list of changes to the latest saved data.

A page sends what it changed, not its whole copy, so two people saving the
same section at once both keep their changes. static/js/state-patch.js makes
these changes (stateDiff) and applies them the same way (stateApplyOps);
tests/test_patch.py runs both on the same cases.

A change is one of:
  {"o": "set", "p": [key, ...], "v": value}   set the value at a path
  {"o": "del", "p": [key, ...]}               remove the key at a path
  {"o": "arr", "p": [key, ...],               change a list item by item:
   "rm":  [{"v": item, "n": count}],            keep at most n copies of item
   "add": [{"v": item, "n": count,              have at least n copies of item,
            "i": index, "end": bool}]}          inserted at index i (or at the end)

Counts make every change safe to apply twice: a retried save can't log the
same waste entry again. Paths go through objects only; list items are whole
values, matched by content.
"""
from collections import Counter
import copy
import json

MAX_PATH_DEPTH = 24


class PatchError(ValueError):
    pass


def canon(value):
    """One string per value, whatever the key order (for matching list items)."""
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False)


def check_ops(ops):
    """Raise PatchError unless ops is a well-formed list of changes."""
    if not isinstance(ops, list):
        raise PatchError('Changes must be a list')
    for op in ops:
        if not isinstance(op, dict) or op.get('o') not in ('set', 'del', 'arr'):
            raise PatchError('Unknown change')
        path = op.get('p')
        if (not isinstance(path, list) or not path or len(path) > MAX_PATH_DEPTH
                or not all(isinstance(k, str) for k in path)):
            raise PatchError('Bad change path')
        if op['o'] == 'set' and 'v' not in op:
            raise PatchError('A set needs a value')
        if op['o'] == 'arr':
            for part, needs_index in (('rm', False), ('add', True)):
                items = op.get(part, [])
                if not isinstance(items, list):
                    raise PatchError('Bad list change')
                for item in items:
                    if not isinstance(item, dict) or 'v' not in item:
                        raise PatchError('Bad list change')
                    n = item.get('n')
                    if not isinstance(n, int) or isinstance(n, bool) or n < 0:
                        raise PatchError('Bad list change')
                    if needs_index:
                        i = item.get('i')
                        if not isinstance(i, int) or isinstance(i, bool) or i < 0:
                            raise PatchError('Bad list change')


def _parent(root, path, create):
    """The object holding path[-1], or None if it isn't there (and not creating)."""
    node = root
    for key in path[:-1]:
        child = node.get(key)
        if not isinstance(child, dict):
            if not create:
                return None
            child = {}
            node[key] = child
        node = child
    return node


def apply_list(current, rm, add):
    out = list(current) if isinstance(current, list) else []
    keys = [canon(v) for v in out]
    counts = Counter(keys)
    for item in rm:
        c = canon(item['v'])
        while counts[c] > item['n']:
            at = keys.index(c)        # first copy (the page expects the same)
            del out[at]
            del keys[at]
            counts[c] -= 1
    for item in sorted(add, key=lambda a: a['i']):
        c = canon(item['v'])
        if counts[c] >= item['n']:
            continue
        at = len(out) if item.get('end') else min(item['i'], len(out))
        out.insert(at, copy.deepcopy(item['v']))
        keys.insert(at, c)
        counts[c] += 1
    return out


def apply_ops(section, ops):
    """A new dict: section with the changes applied (section is not modified)."""
    out = copy.deepcopy(section) if isinstance(section, dict) else {}
    for op in ops:
        path = op['p']
        if op['o'] == 'set':
            _parent(out, path, True)[path[-1]] = copy.deepcopy(op['v'])
        elif op['o'] == 'del':
            parent = _parent(out, path, False)
            if parent is not None:
                parent.pop(path[-1], None)
        else:
            parent = _parent(out, path, True)
            parent[path[-1]] = apply_list(parent.get(path[-1]), op.get('rm', []), op.get('add', []))
    return out

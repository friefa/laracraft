"""Derives docs/research/bedrock/block-mapping.json (research package B0).

Inputs (all passed as paths, none are committed to the repo):
  1. registry-blocks.json  output of list-registry-blocks.ts (our 234 Java blocks)
  2. blocksJ2B.json         PrismarineJS minecraft-data, data/bedrock/1.26.30/blocksJ2B.json
                            (Java blockstate string -> Bedrock blockstate string, one entry per
                            Java state; community data, generated from Geyser-style mappings)
  3. blockStates.json       PrismarineJS minecraft-data, data/bedrock/1.26.60/blockStates.json
                            (every Bedrock 26.60 block permutation with typed state values)
  4. curated.json           our hand-written notes/overrides (docs/research/bedrock/scripts/curated.json)

Usage (repo root, Python 3.10+, no third-party packages):
  pnpm exec tsx docs/research/bedrock/scripts/list-registry-blocks.ts > /tmp/b0/registry-blocks.json
  curl -o /tmp/b0/blocksJ2B.json \
    https://raw.githubusercontent.com/PrismarineJS/minecraft-data/master/data/bedrock/1.26.30/blocksJ2B.json
  curl -o /tmp/b0/blockStates.json \
    https://raw.githubusercontent.com/PrismarineJS/minecraft-data/master/data/bedrock/1.26.60/blockStates.json
  python3 -I docs/research/bedrock/scripts/derive-mapping.py /tmp/b0/registry-blocks.json \
    /tmp/b0/blocksJ2B.json /tmp/b0/blockStates.json docs/research/bedrock/scripts/curated.json \
    > docs/research/bedrock/block-mapping.json

What it does per registry block:
  * collects all Java states of the block from blocksJ2B (or synthesises them from a template block
    for blocks newer than the J2B data, see curated "templates"),
  * finds, for the Bedrock identifier and for every Bedrock state, the smallest set of Java
    properties that determines it (functional dependency) and emits a value table,
  * cross-checks the result against the Bedrock 26.60 permutation list: Bedrock states that exist in
    26.60 but are missing from the 26.30 mapping are added from curated "addedStates", or reported
    in `unmappedBedrockStates`,
  * Java properties that determine nothing are reported with their curated `kind`.
"""

import itertools
import json
import re
import sys
from collections import defaultdict


def parse_state(s):
    name, _, rest = s.partition('[')
    rest = rest.rstrip(']')
    props = {}
    if rest:
        for kv in rest.split(','):
            k, _, v = kv.partition('=')
            props[k] = v
    return name, props


def load_bedrock_types(path):
    perms = json.load(open(path))
    types = defaultdict(dict)  # name -> state -> type
    values = defaultdict(lambda: defaultdict(set))
    version = set()
    for p in perms:
        version.add(p['version'])
        for k, v in p['states'].items():
            types[p['name']][k] = v['type']
            values[p['name']][k].add(v['value'])
    return types, values, version


def typed(value, typ):
    if typ == 'int':
        return int(value)
    if typ == 'byte':
        return 1 if value in ('true', '1', 1, True) else 0
    return value


def natural(key):
    return tuple((0, int(x)) if str(x).isdigit() else (1, str(x)) for x in key)


def dependency(rows, java_props, key):
    """Smallest subset of java_props whose values determine rows[*][key]."""
    for size in range(0, len(java_props) + 1):
        for subset in itertools.combinations(java_props, size):
            seen = {}
            ok = True
            for java, out in rows:
                k = tuple(java[p] for p in subset)
                v = out.get(key)
                if seen.setdefault(k, v) != v:
                    ok = False
                    break
            if ok:
                return list(subset), seen
    return None, None


def main(reg_path, j2b_path, states_path, curated_path):
    registry = json.load(open(reg_path))
    j2b = json.load(open(j2b_path))
    curated = json.load(open(curated_path))
    btypes, bvalues, bversion = load_bedrock_types(states_path)

    by_java = defaultdict(list)
    for jk, bk in j2b.items():
        jname, jprops = parse_state(jk)
        bname, bprops = parse_state(bk)
        by_java[jname].append((jprops, bname, bprops))

    out_blocks = {}
    for block in registry['blocks']:
        jid = block['id']
        props = block['properties']
        cur = dict(curated['blocks'].get(jid, {}))
        if 'family' not in cur:
            for pattern, fam in curated['familyPatterns']:
                if re.fullmatch(pattern, jid):
                    cur['family'] = fam
                    break
        if 'template' not in cur and cur.get('family') in curated.get('templates', {}):
            tpl = curated['templates'][cur['family']]
            if not by_java.get(jid):
                cur['template'] = {
                    'java': tpl['java'],
                    'from': tpl['from'],
                    'to': 'minecraft:' + jid.split(':')[1].replace(tpl['suffix'], ''),
                }
        family =curated['families'].get(cur.get('family', ''), {})
        rows = by_java.get(jid)
        source = 'j2b-1.26.30'
        if not rows and 'template' in cur:
            tpl = cur['template']
            rows = []
            for jprops, bname, bprops in by_java[tpl['java']]:
                rows.append((jprops, bname.replace(tpl['from'], tpl['to']), bprops))
            source = 'template:' + tpl['java']
        entry = {}
        if not rows:
            entry = {'status': 'unavailable', 'bedrock': None}
        else:
            prop_names = sorted(props.keys())
            # Java property sets must match our registry.
            jkeys = set(rows[0][0].keys())
            if jkeys != set(prop_names):
                entry['javaPropertyMismatch'] = {
                    'registry': prop_names,
                    'j2b': sorted(jkeys),
                }
            table = [
                (j, dict(b, **{'@id': n}))
                for (j, n, b) in rows
            ]
            # Default Java state -> default Bedrock id.
            defaults = {p: d['default'] for p, d in props.items()}
            default_row = next(
                (r for r in table if all(r[0].get(p) == v for p, v in defaults.items())),
                table[0],
            )
            ids = sorted({r[1]['@id'] for r in table})
            entry['bedrock'] = default_row[1]['@id']
            used = set()
            if len(ids) > 1:
                deps, seen = dependency(table, prop_names, '@id')
                used.update(deps)
                entry['identifierBy'] = {
                    'properties': deps,
                    'table': [
                        {'when': dict(zip(deps, k)), 'id': v} for k, v in sorted(seen.items(), key=lambda kv: natural(kv[0]))
                    ],
                }
            bname_for_types = entry['bedrock'].split(':')[1]
            bkeys = sorted({k for r in table for k in r[1] if k != '@id'})
            states = {}
            for bk in bkeys:
                deps, seen = dependency(table, prop_names, bk)
                typ = btypes.get(bname_for_types, {}).get(bk, 'string')
                st = {'type': typ, 'javaProperties': deps}
                if bk not in btypes.get(bname_for_types, {}):
                    st['missingIn26_60'] = True
                if len(deps) == 0:
                    st['constant'] = typed(next(iter(seen.values())), typ)
                elif len(deps) == 1:
                    st['values'] = {k[0]: typed(v, typ) for k, v in seen.items() if v is not None}
                else:
                    st['table'] = [
                        {'when': dict(zip(deps, k)), 'value': typed(v, typ)}
                        for k, v in sorted(seen.items(), key=lambda kv: natural(kv[0]))
                        if v is not None
                    ]
                used.update(deps)
                states[bk] = st
            # States added in Bedrock after the J2B data (26.50/26.60), see curated families.
            for bk, add in {**family.get('addedStates', {}), **cur.get('addedStates', {})}.items():
                typ = btypes.get(bname_for_types, {}).get(bk)
                if typ is None:
                    continue
                st = {'type': typ, 'javaProperties': [add['java']], 'since': add['since']}
                st['values'] = {
                    jv: typed(add.get('values', {}).get(jv, jv), typ)
                    for jv in props[add['java']]['values']
                }
                if 'note' in add:
                    st['note'] = add['note']
                states[bk] = st
                used.add(add['java'])
            # Hand-checked corrections where the J2B data is visual-only or wrong (see notes).
            for bk, ov in cur.get('overrideStates', {}).items():
                typ = states.get(bk, {}).get('type') or btypes[bname_for_types][bk]
                st = {'type': typ, 'javaProperties': ov['javaProperties']}
                st['values'] = {jv: typed(bv, typ) for jv, bv in ov['values'].items()}
                st['override'] = ov['reason']
                states[bk] = st
                used.update(ov['javaProperties'])
            entry['states'] = states
            # Bedrock 26.60 states still unexplained.
            missing = sorted(set(btypes.get(bname_for_types, {})) - set(states))
            if missing:
                entry['unmappedBedrockStates'] = {
                    k: {'type': btypes[bname_for_types][k],
                        'values': sorted(bvalues[bname_for_types][k], key=str)}
                    for k in missing
                }
            # Java properties that drive nothing.
            kinds = {**family.get('javaOnly', {}), **cur.get('javaOnly', {})}
            java_only = {}
            for p in prop_names:
                if p in used:
                    continue
                java_only[p] = kinds.get(p, {'kind': 'unknown'})
            if java_only:
                entry['javaOnlyProperties'] = java_only
            identical = (
                entry['bedrock'] == jid and not java_only and len(ids) == 1
                and all(
                    s['javaProperties'] == [k]
                    and all(str(a) == str(b) for a, b in s.get('values', {}).items())
                    and 'values' in s
                    for k, s in states.items()
                )
            )
            entry['status'] = cur.get(
                'status', family.get('status', 'same' if identical else 'differs'))
            entry['source'] = source
        notes = family.get('notes', []) + cur.get('notes', [])
        if notes:
            entry['notes'] = notes
        refs = family.get('refs', []) + cur.get('refs', [])
        if refs:
            entry['refs'] = refs
        entry['confidence'] = cur.get('confidence', family.get('confidence', 'verified'))
        if 'family' in cur:
            entry['family'] = cur['family']
        out_blocks[jid] = entry

    doc = {
        '$comment': 'Generated by docs/research/bedrock/scripts/derive-mapping.py; schema in README.md',
        'schemaVersion': 1,
        'java': {'version': registry['javaVersion'], 'blockCount': registry['count']},
        'bedrock': {
            'version': curated['bedrockVersion'],
            'blockStateVersion': sorted(bversion),
            'directionEnums': curated['directionEnums'],
        },
        'sources': curated['sources'],
        'propertyKinds': curated['propertyKinds'],
        'blocks': out_blocks,
    }
    json.dump(doc, sys.stdout, indent=2, ensure_ascii=False)
    sys.stdout.write('\n')


if __name__ == '__main__':
    main(*sys.argv[1:5])

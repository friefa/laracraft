# ADR-0001: Datenformat für Bauten

- Status: **Vorgeschlagen** (implementiert in `libs/core-model/src/lib/serialization/format.ts`, Freigabe durch PO ausstehend)
- Datum: 2026-11-03

## Kontext

Bauten werden lokal gespeichert, ans Backend hochgeladen, geteilt, geremixt und in `.schem`/`.litematic`
konvertiert. Das Format muss versioniert sein und Migrationen erlauben, Java-Blockstates verlustfrei abbilden,
kompakt sein (Mobilgeräte, Object Storage) und auf untrusted Input sicher geladen werden können
(Community-Uploads, Imports).

## Entscheidung

Ein JSON-Dokument (Dateiendung `.lcb.json`, MIME `application/vnd.laracraft.build+json`):

```jsonc
{
  "format": "laracraft-build",
  "version": 1,
  "metadata": { "name": "…", "edition": "java", "dataVersion": 4189, "createdAt": "…", "updatedAt": "…",
                "description": "…", "tags": [], "remixOf": { "buildId": "…" } },
  "origin": [x, y, z],          // Min-Ecke der Bounding Box im Dokument
  "size": [width, height, length],
  "palette": ["minecraft:air", "minecraft:oak_stairs[facing=east,half=bottom,…]", …],
  "blocks": { "encoding": "varint-deflate-base64", "data": "…" }
}
```

- **Palette** aus kanonischen Java-Blockstate-Strings (Keys alphabetisch), `palette[0]` ist immer Luft,
  nur verwendete Zustände (beim Speichern kompaktiert).
- **Blockdaten**: dichtes Index-Array über die Bounding Box in **YZX-Reihenfolge**
  (`index = x + z·width + y·width·length`), jeder Eintrag als **unsigned LEB128-Varint**, dann **raw DEFLATE**
  (fflate, MIT), dann Base64. Das ist bewusst dieselbe Reihenfolge und Varint-Kodierung wie Sponge Schematic v3,
  damit `.schem`-Konvertierung trivial bleibt.
- **Versionierung**: `version` ist eine Ganzzahl. `MIGRATIONS[n]` überführt rohes JSON von Version n nach n+1;
  Laden migriert schrittweise. Neuere Versionen werden mit klarer Meldung abgelehnt. Bestehende Migrationen
  werden nie geändert.
- **Sicherheit**: Grenzen 1024 pro Achse, 64 Mio. Zellen Volumen, 65 535 Paletteneinträge; Ablehnung von
  abgeschnittenen Daten, überzähligen Bytes, doppelten oder ungültigen Paletteneinträgen und Indizes außerhalb
  der Palette.
- `metadata.dataVersion` speichert die Java-Datenversion, gegen die der Bau erstellt wurde (für spätere
  Blockstate-Migrationen bei Minecraft-Updates, getrennt von der Format-Version).

Im Speicher arbeitet die App nicht mit dem Format, sondern mit `BuildDocument` (Palette + sparse 16³-Chunks).

## Alternativen

- **Binärformat (NBT o. ä.)**: kompakter Header, aber schlechter debugbar, eigenes Tooling nötig. Die Blockdaten
  sind ohnehin komprimiert; der JSON-Overhead betrifft nur Metadaten und Palette.
- **Sparse Liste (`[x,y,z,state]`)**: einfacher, aber bei dichten Bauten 5–10× größer. Dichte Arrays mit vielen
  Nullen komprimieren mit DEFLATE sehr gut.
- **Direkt `.schem` als Hauptformat**: NBT-Parser in jedem Client, Sponge-Metadaten passen nicht zu unseren
  (Remix, Lara-Historie), und wir wären an deren Versionierung gebunden.
- **Gzip statt raw DEFLATE**: +18 Byte Header ohne Nutzen innerhalb von JSON.

## Konsequenzen

- Format v1 ist ab dem ersten veröffentlichten Bau eingefroren; Änderungen nur über Version 2 + Migration.
- Für sehr große Bauten (> 1024 pro Achse) braucht es später ein Chunk-basiertes v2.
- Die gleiche Kodierung dient als Transportformat zum Build-Order-Worker und zum Backend.
- Offen: soll die Undo-Historie bzw. Lara-Chat mitgespeichert werden? Vorschlag: nein, getrennt (Datenschutz,
  Größe).

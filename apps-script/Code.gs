const SPREADSHEET_ID = "1Vufd1iCOEj450pKEfGg7Kz1OiXyx_7ybfj1mubdvFmQ";
const RECORDS_SHEET_NAME = "Página1";
const PARTICIPANTS_SHEET_NAME = "Participantes";

function doGet() {
  return jsonResponse_({
    ok: true,
    app: "Presença do Embaixador",
  });
}

function doPost(event) {
  try {
    const payload = parsePayload_(event);
    const record = normalizeRecord_(payload);

    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const recordsSheet = ensureSheet_(spreadsheet, RECORDS_SHEET_NAME, [
      "data",
      "evento",
      "presença",
    ]);

    recordsSheet.appendRow([record.data, record.evento, record.presenca]);
    syncParticipants_(spreadsheet, record.participants);

    return jsonResponse_({
      ok: true,
      recordId: payload.recordId || "",
    });
  } catch (error) {
    return jsonResponse_({
      ok: false,
      error: error && error.message ? error.message : String(error),
    });
  }
}

function parsePayload_(event) {
  const body = event && event.postData && event.postData.contents;
  if (body) {
    return JSON.parse(body);
  }

  return event && event.parameter ? event.parameter : {};
}

function normalizeRecord_(payload) {
  const data = clean_(payload.data);
  const evento = clean_(payload.evento);
  const presenca = cleanPresence_(payload.presenca);
  const participants = Array.isArray(payload.participants)
    ? payload.participants.map(clean_).filter(Boolean)
    : presenca.split(/\n|,/).map(clean_).filter(Boolean);

  if (!data) {
    throw new Error("Data não informada.");
  }
  if (!evento) {
    throw new Error("Evento não informado.");
  }
  if (!presenca) {
    throw new Error("Presença não informada.");
  }

  return {
    data,
    evento,
    presenca,
    participants,
  };
}

function syncParticipants_(spreadsheet, participants) {
  if (!participants.length) return;

  const sheet = ensureSheet_(spreadsheet, PARTICIPANTS_SHEET_NAME, [
    "nome",
    "status",
    "observação",
  ]);

  const lastRow = Math.max(sheet.getLastRow(), 1);
  const existingNames =
    lastRow > 1
      ? sheet
          .getRange(2, 1, lastRow - 1, 1)
          .getValues()
          .flat()
          .map((name) => clean_(name).toLowerCase())
      : [];
  const existing = new Set(existingNames);
  const rows = [];

  participants.forEach((name) => {
    const key = name.toLowerCase();
    if (existing.has(key)) return;
    existing.add(key);
    rows.push([name, "ativo", ""]);
  });

  if (rows.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 3).setValues(rows);
  }
}

function ensureSheet_(spreadsheet, sheetName, headers) {
  const sheet = spreadsheet.getSheetByName(sheetName) || spreadsheet.insertSheet(sheetName);
  const currentHeaders = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  const needsHeaders = headers.some((header, index) => clean_(currentHeaders[index]) !== header);

  if (needsHeaders) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }

  sheet.setFrozenRows(1);
  return sheet;
}

function clean_(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function cleanPresence_(value) {
  return String(value || "")
    .split(/\n|,/)
    .map(clean_)
    .filter(Boolean)
    .join("\n");
}

function jsonResponse_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

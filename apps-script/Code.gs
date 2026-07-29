const SPREADSHEET_ID = "1Vufd1iCOEj450pKEfGg7Kz1OiXyx_7ybfj1mubdvFmQ";
const GENERAL_SHEET_NAME = "Geral";
const LEGACY_RECORDS_SHEET_NAME = "Página1";
const PARTICIPANTS_SHEET_NAME = "Participantes";
const RECORD_HEADERS = ["data", "evento", "presença"];
const MONTH_NAMES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

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
    const sheetDate = toSheetDate_(record.data);
    const recordRows = record.participants.map((name) => [sheetDate, record.evento, name]);
    const sheets = [
      ensureGeneralSheet_(spreadsheet),
      ensureSheet_(spreadsheet, getMonthlySheetName_(record.data), RECORD_HEADERS),
      ensureSheet_(spreadsheet, getEventSheetName_(record), RECORD_HEADERS),
    ];

    sheets.forEach((sheet) => appendRows_(sheet, recordRows));
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
  const rawPresence = cleanPresence_(payload.presenca);
  const participants = normalizeParticipants_(payload.participants, rawPresence);

  if (!data) {
    throw new Error("Data não informada.");
  }
  if (!evento) {
    throw new Error("Evento não informado.");
  }
  if (!participants.length) {
    throw new Error("Presença não informada.");
  }

  return {
    data,
    evento,
    presenca: participants.join("\n"),
    participants,
  };
}

function appendRows_(sheet, rows) {
  if (!rows.length) return;
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, RECORD_HEADERS.length).setValues(rows);
}

function ensureGeneralSheet_(spreadsheet) {
  const generalSheet = spreadsheet.getSheetByName(GENERAL_SHEET_NAME);
  if (generalSheet) {
    return ensureSheet_(spreadsheet, GENERAL_SHEET_NAME, RECORD_HEADERS);
  }

  const legacySheet = spreadsheet.getSheetByName(LEGACY_RECORDS_SHEET_NAME);
  if (legacySheet) {
    legacySheet.setName(GENERAL_SHEET_NAME);
    return ensureSheet_(spreadsheet, GENERAL_SHEET_NAME, RECORD_HEADERS);
  }

  return ensureSheet_(spreadsheet, GENERAL_SHEET_NAME, RECORD_HEADERS);
}

function getMonthlySheetName_(dateValue) {
  const parsed = parseDate_(dateValue);
  if (!parsed) return "Mês indefinido";
  return `${MONTH_NAMES[parsed.month - 1]} ${parsed.year}`;
}

function getEventSheetName_(record) {
  return sanitizeSheetName_(`${record.data} - ${record.evento}`);
}

function parseDate_(value) {
  const text = clean_(value);
  let match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return {
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3]),
    };
  }

  match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (match) {
    return {
      year: Number(match[3]),
      month: Number(match[2]),
      day: Number(match[1]),
    };
  }

  return null;
}

function toSheetDate_(value) {
  const parsed = parseDate_(value);
  if (!parsed) return value;
  return new Date(parsed.year, parsed.month - 1, parsed.day);
}

function sanitizeSheetName_(value) {
  const name = clean_(value).replace(/[:\\/?*[\]]/g, "-").slice(0, 100).trim();
  return name || "Evento";
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

function normalizeParticipants_(participants, presence) {
  const names =
    Array.isArray(participants) && participants.length
      ? participants
      : String(presence || "").split(/\n|,/);

  return names.map(clean_).filter(Boolean);
}

function jsonResponse_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

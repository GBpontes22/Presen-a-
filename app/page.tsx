"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

const SPREADSHEET_ID = "1Vufd1iCOEj450pKEfGg7Kz1OiXyx_7ybfj1mubdvFmQ";
const SHEET_NAME = "Página1";
const SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1Vufd1iCOEj450pKEfGg7Kz1OiXyx_7ybfj1mubdvFmQ/edit";

const STORAGE_KEYS = {
  endpoint: "embaixador.endpoint",
  records: "embaixador.records",
};

const APPS_SCRIPT_CODE = String.raw`const SPREADSHEET_ID = "1Vufd1iCOEj450pKEfGg7Kz1OiXyx_7ybfj1mubdvFmQ";
const SHEET_NAME = "Página1";
const HEADERS = ["data", "evento", "presença"];

function doGet() {
  return jsonResponse({ ok: true, app: "Presença do Embaixador" });
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents || "{}");
    const sourceEntries = Array.isArray(payload.entries) ? payload.entries : [payload];
    const rows = sourceEntries.map(normalizeEntry);

    if (rows.length === 0) {
      throw new Error("Nenhum registro recebido.");
    }

    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = spreadsheet.getSheetByName(SHEET_NAME) || spreadsheet.insertSheet(SHEET_NAME);
    ensureHeaders(sheet);

    const startRow = Math.max(sheet.getLastRow() + 1, 2);
    sheet.getRange(startRow, 1, rows.length, HEADERS.length).setValues(rows);
    sheet.getRange(startRow, 1, rows.length, 1).setNumberFormat("dd/mm/yyyy");

    return jsonResponse({
      ok: true,
      savedRows: rows.length,
      spreadsheetUrl: spreadsheet.getUrl(),
    });
  } catch (error) {
    return jsonResponse({
      ok: false,
      error: String(error && error.message ? error.message : error),
    });
  }
}

function normalizeEntry(entry) {
  const data = String(entry.data || entry.date || "").trim();
  const evento = String(entry.evento || entry.event || "").trim();
  const presenca = String(entry.presenca || entry.presença || entry.presence || "").trim();

  if (!data) throw new Error("Data ausente.");
  if (!evento) throw new Error("Evento ausente.");
  if (!presenca) throw new Error("Presença ausente.");

  const dateValue = new Date(data + "T00:00:00");
  if (isNaN(dateValue.getTime())) {
    throw new Error("Data inválida.");
  }

  return [dateValue, evento, presenca];
}

function ensureHeaders(sheet) {
  const currentHeaders = sheet
    .getRange(1, 1, 1, HEADERS.length)
    .getValues()[0]
    .map(function (value) {
      return String(value).trim().toLowerCase();
    });

  const hasExpectedHeaders = HEADERS.every(function (header, index) {
    return currentHeaders[index] === header;
  });

  if (!hasExpectedHeaders) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
  }
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}`;

type RecordStatus = "pending" | "sent";
type SaveState = "idle" | "saving" | "success" | "queued" | "error";

type AttendanceRecord = {
  id: string;
  data: string;
  evento: string;
  presenca: string;
  status: RecordStatus;
  submittedAt: string;
};

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function todayISO() {
  const date = new Date();
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 10);
}

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

async function postRecords(endpoint: string, records: AttendanceRecord[]) {
  await fetch(endpoint, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      spreadsheetId: SPREADSHEET_ID,
      sheetName: SHEET_NAME,
      entries: records.map(({ data, evento, presenca, submittedAt }) => ({
        data,
        evento,
        presenca,
        submittedAt,
      })),
    }),
  });
}

export default function Home() {
  const [recordDate, setRecordDate] = useState(todayISO);
  const [eventName, setEventName] = useState("");
  const [presence, setPresence] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [message, setMessage] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [scriptCopied, setScriptCopied] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    try {
      const storedEndpoint = localStorage.getItem(STORAGE_KEYS.endpoint);
      const storedRecords = localStorage.getItem(STORAGE_KEYS.records);

      if (storedEndpoint) {
        setEndpoint(storedEndpoint);
      }

      if (storedRecords) {
        setRecords(JSON.parse(storedRecords));
      }
    } catch {
      setRecords([]);
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEYS.endpoint, endpoint);
  }, [endpoint, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEYS.records, JSON.stringify(records.slice(0, 80)));
  }, [records, hydrated]);

  useEffect(() => {
    if (typeof navigator === "undefined") return;

    const updateOnlineState = () => setIsOnline(navigator.onLine);
    updateOnlineState();

    window.addEventListener("online", updateOnlineState);
    window.addEventListener("offline", updateOnlineState);

    return () => {
      window.removeEventListener("online", updateOnlineState);
      window.removeEventListener("offline", updateOnlineState);
    };
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // The app still works without the service worker during local previews.
    });
  }, []);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in navigator && Boolean(navigator.standalone));
    setIsInstalled(standalone);

    const handlePrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };

    const handleInstalled = () => {
      setInstallPrompt(null);
      setIsInstalled(true);
    };

    window.addEventListener("beforeinstallprompt", handlePrompt);
    window.addEventListener("appinstalled", handleInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handlePrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  const pendingRecords = useMemo(
    () => records.filter((record) => record.status === "pending"),
    [records],
  );

  const sentRecords = useMemo(
    () => records.filter((record) => record.status === "sent"),
    [records],
  );

  const canSubmit =
    recordDate.length > 0 &&
    eventName.trim().length > 0 &&
    presence.trim().length > 0 &&
    saveState !== "saving";

  const syncPending = useCallback(async () => {
    const targetEndpoint = endpoint.trim();
    if (!targetEndpoint || !isOnline || pendingRecords.length === 0 || isSyncing) return;

    const pendingIds = new Set(pendingRecords.map((record) => record.id));

    try {
      setIsSyncing(true);
      await postRecords(targetEndpoint, pendingRecords);
      setRecords((current) =>
        current
          .map((record) =>
            pendingIds.has(record.id) ? { ...record, status: "sent" as const } : record,
          )
          .slice(0, 80),
      );
      setSaveState("success");
      setMessage(
        pendingRecords.length === 1
          ? "1 registro pendente foi enviado para a planilha."
          : `${pendingRecords.length} registros pendentes foram enviados para a planilha.`,
      );
    } catch {
      setSaveState("error");
      setMessage("Não foi possível sincronizar agora. Os registros continuam salvos aqui.");
    } finally {
      setIsSyncing(false);
    }
  }, [endpoint, isOnline, isSyncing, pendingRecords]);

  useEffect(() => {
    if (!hydrated || pendingRecords.length === 0 || !endpoint.trim() || !isOnline) return;
    void syncPending();
  }, [endpoint, hydrated, isOnline, pendingRecords.length, syncPending]);

  async function installApp() {
    if (!installPrompt) return;

    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);
    setIsInstalled(choice.outcome === "accepted");
  }

  async function copyScript() {
    try {
      await navigator.clipboard.writeText(APPS_SCRIPT_CODE);
      setScriptCopied(true);
      window.setTimeout(() => setScriptCopied(false), 1800);
    } catch {
      setScriptCopied(false);
    }
  }

  async function saveRecord(event: FormEvent) {
    event.preventDefault();
    setMessage("");

    const cleanEvent = normalizeText(eventName);
    const cleanPresence = normalizeText(presence);

    if (!recordDate) {
      setSaveState("error");
      setMessage("Preencha a data.");
      return;
    }

    if (!cleanEvent) {
      setSaveState("error");
      setMessage("Preencha o evento.");
      return;
    }

    if (!cleanPresence) {
      setSaveState("error");
      setMessage("Preencha a presença.");
      return;
    }

    const nextRecord: AttendanceRecord = {
      id: makeId(),
      data: recordDate,
      evento: cleanEvent,
      presenca: cleanPresence,
      status: "pending",
      submittedAt: new Date().toISOString(),
    };

    const targetEndpoint = endpoint.trim();

    if (!targetEndpoint || !isOnline) {
      setRecords((current) => [nextRecord, ...current].slice(0, 80));
      setSaveState("queued");
      setMessage(
        targetEndpoint
          ? "Registro salvo no aparelho. Ele será enviado quando a conexão voltar."
          : "Registro salvo no aparelho. Cole a URL do Web App para enviar à planilha.",
      );
      setEventName("");
      setPresence("");
      return;
    }

    try {
      setSaveState("saving");
      await postRecords(targetEndpoint, [nextRecord]);
      setRecords((current) => [{ ...nextRecord, status: "sent" }, ...current].slice(0, 80));
      setSaveState("success");
      setMessage("Registro enviado para a planilha.");
      setEventName("");
      setPresence("");
    } catch {
      setRecords((current) => [nextRecord, ...current].slice(0, 80));
      setSaveState("queued");
      setMessage("Registro salvo no aparelho. Tente sincronizar novamente em instantes.");
    }
  }

  return (
    <main className="appShell">
      <header className="topbar">
        <div className="brand">
          <img src="/logo-er.png" alt="Logo ER" className="brandLogo" />
          <div>
            <p className="eyebrow">Planilha conectada</p>
            <h1>Presença do Embaixador</h1>
          </div>
        </div>

        <div className="topActions">
          {installPrompt && !isInstalled ? (
            <button type="button" className="installButton" onClick={installApp}>
              Instalar app
            </button>
          ) : null}
          <a className="sheetLink" href={SHEET_URL} target="_blank" rel="noreferrer">
            Abrir planilha
          </a>
        </div>
      </header>

      <section className="statusStrip" aria-live="polite">
        <span className={endpoint && isOnline ? "dot connected" : "dot"} />
        <span>
          {!isOnline
            ? "Sem internet"
            : endpoint
              ? "Pronto para enviar ao Google Planilhas"
              : "Conexão com Google Planilhas pendente"}
        </span>
        <strong>{pendingRecords.length}</strong>
        <span>pendentes</span>
      </section>

      <div className="workspace">
        <form className="panel formPanel" onSubmit={saveRecord}>
          <div className="panelHeader">
            <div>
              <p className="eyebrow">Página1</p>
              <h2>Novo registro</h2>
            </div>
            <button type="button" className="quietButton" onClick={() => setRecordDate(todayISO())}>
              Hoje
            </button>
          </div>

          <label className="field">
            <span>Data</span>
            <input
              type="date"
              value={recordDate}
              onChange={(event) => setRecordDate(event.target.value)}
            />
          </label>

          <label className="field">
            <span>Evento</span>
            <input
              value={eventName}
              onChange={(event) => setEventName(event.target.value)}
              placeholder="Ex.: Culto, reunião ou visita"
            />
          </label>

          <label className="field">
            <span>Presença</span>
            <textarea
              value={presence}
              onChange={(event) => setPresence(event.target.value)}
              placeholder="Nome ou lista de presença"
              rows={5}
            />
          </label>

          {message ? <p className={`message ${saveState}`}>{message}</p> : null}

          <button className="primaryButton" type="submit" disabled={!canSubmit}>
            {saveState === "saving"
              ? "Enviando..."
              : endpoint.trim() && isOnline
                ? "Enviar para planilha"
                : "Guardar registro"}
          </button>
        </form>

        <section className="panel recordsPanel">
          <div className="panelHeader">
            <div>
              <p className="eyebrow">Histórico local</p>
              <h2>Últimos lançamentos</h2>
            </div>
            <span className="countBadge">{sentRecords.length} enviados</span>
          </div>

          <div className="recordList">
            {records.length === 0 ? (
              <p className="emptyState">Nenhum lançamento salvo neste dispositivo.</p>
            ) : (
              records.slice(0, 14).map((record) => (
                <article className="recordRow" key={record.id}>
                  <div className="recordDate">
                    <strong>{formatDate(record.data)}</strong>
                    <span className={record.status}>{record.status === "sent" ? "Enviado" : "Pendente"}</span>
                  </div>
                  <div className="recordContent">
                    <strong>{record.evento}</strong>
                    <span>{record.presenca}</span>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>

        <aside className="panel sidePanel">
          <div className="panelHeader">
            <div>
              <p className="eyebrow">Google</p>
              <h2>Conexão</h2>
            </div>
          </div>

          <label className="field">
            <span>URL do Web App</span>
            <input
              value={endpoint}
              onChange={(event) => setEndpoint(event.target.value)}
              placeholder="https://script.google.com/macros/s/..."
            />
          </label>

          <button
            type="button"
            className="quietButton fullWidth"
            onClick={syncPending}
            disabled={!endpoint.trim() || !isOnline || pendingRecords.length === 0 || isSyncing}
          >
            {isSyncing ? "Sincronizando..." : "Sincronizar pendentes"}
          </button>

          <div className="sheetInfo">
            <span>Destino</span>
            <strong>{SHEET_NAME}</strong>
            <small>Colunas: data, evento, presença</small>
          </div>

          <details className="scriptBox">
            <summary>Script do Google Planilhas</summary>
            <textarea readOnly value={APPS_SCRIPT_CODE} />
            <button type="button" className="quietButton fullWidth" onClick={copyScript}>
              {scriptCopied ? "Script copiado" : "Copiar script"}
            </button>
          </details>
        </aside>
      </div>
    </main>
  );
}

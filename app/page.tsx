"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

const SPREADSHEET_ID = "1Vufd1iCOEj450pKEfGg7Kz1OiXyx_7ybfj1mubdvFmQ";
const SHEET_NAME = "Página1";
const SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1Vufd1iCOEj450pKEfGg7Kz1OiXyx_7ybfj1mubdvFmQ/edit";
const GOOGLE_WEB_APP_URL =
  "https://script.google.com/macros/s/AKfycbzQm6qU7jp5PaT2zEPy2Uw47JizwK7fKZNiifOgFzTCCvr6gn0NSvDUta8oonOmjRg/exec";
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const STORAGE_KEYS = {
  participants: "embaixador.participants",
  records: "embaixador.records",
};

type SaveState = "idle" | "success" | "error";
type SyncStatus = "pending" | "synced" | "error";

type AttendanceRecord = {
  id: string;
  data: string;
  evento: string;
  presenca: string;
  submittedAt: string;
  participants?: string[];
  syncStatus?: SyncStatus;
  syncedAt?: string;
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

function withBasePath(path: string) {
  return `${BASE_PATH}${path}`;
}

async function sendRecordToSheet(record: AttendanceRecord) {
  if (!GOOGLE_WEB_APP_URL) {
    throw new Error("Google Web App URL is not configured.");
  }

  await fetch(GOOGLE_WEB_APP_URL, {
    method: "POST",
    mode: "no-cors",
    headers: {
      "Content-Type": "text/plain;charset=utf-8",
    },
    body: JSON.stringify({
      spreadsheetId: SPREADSHEET_ID,
      sheetName: SHEET_NAME,
      data: record.data,
      evento: record.evento,
      presenca: record.presenca,
      participants: record.participants ?? [],
      submittedAt: record.submittedAt,
      recordId: record.id,
    }),
    keepalive: true,
  });
}

export default function Home() {
  const [recordDate, setRecordDate] = useState(todayISO);
  const [eventName, setEventName] = useState("");
  const [participantInput, setParticipantInput] = useState("");
  const [participants, setParticipants] = useState<string[]>([]);
  const [selectedParticipants, setSelectedParticipants] = useState<Record<string, boolean>>({});
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [message, setMessage] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const recordsRef = useRef<AttendanceRecord[]>([]);
  const isSyncingRef = useRef(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    try {
      const storedParticipants = localStorage.getItem(STORAGE_KEYS.participants);
      const storedRecords = localStorage.getItem(STORAGE_KEYS.records);

      if (storedParticipants) {
        setParticipants(JSON.parse(storedParticipants));
      }
      if (storedRecords) {
        const parsedRecords = JSON.parse(storedRecords) as AttendanceRecord[];
        setRecords(
          parsedRecords.map((record) => ({
            ...record,
            syncStatus: record.syncStatus ?? "pending",
          })),
        );
      }
    } catch {
      setRecords([]);
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEYS.participants, JSON.stringify(participants));
  }, [participants, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEYS.records, JSON.stringify(records.slice(0, 80)));
    recordsRef.current = records;
  }, [records, hydrated]);

  useEffect(() => {
    if (!hydrated) return;

    function handleOnline() {
      void syncPendingRecords();
    }

    window.addEventListener("online", handleOnline);
    void syncPendingRecords();

    return () => window.removeEventListener("online", handleOnline);
  }, [hydrated]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register(withBasePath("/sw.js")).catch(() => {
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

  const lastRecord = useMemo(() => records[0], [records]);
  const pendingRecords = useMemo(
    () => records.filter((record) => record.syncStatus !== "synced"),
    [records],
  );
  const selectedNames = useMemo(
    () => participants.filter((participant) => selectedParticipants[participant]),
    [participants, selectedParticipants],
  );

  const canSubmit =
    recordDate.length > 0 &&
    eventName.trim().length > 0 &&
    selectedNames.length > 0 &&
    !isSubmitting;

  function updateRecordSyncStatus(id: string, syncStatus: SyncStatus) {
    setRecords((current) =>
      current.map((record) =>
        record.id === id
          ? {
              ...record,
              syncStatus,
              syncedAt: syncStatus === "synced" ? new Date().toISOString() : record.syncedAt,
            }
          : record,
      ),
    );
  }

  async function syncRecord(record: AttendanceRecord) {
    try {
      await sendRecordToSheet(record);
      updateRecordSyncStatus(record.id, "synced");
      return true;
    } catch {
      updateRecordSyncStatus(record.id, "error");
      return false;
    }
  }

  async function syncPendingRecords() {
    if (isSyncingRef.current || !navigator.onLine) return;

    const pending = recordsRef.current.filter((record) => record.syncStatus !== "synced");
    if (pending.length === 0) return;

    isSyncingRef.current = true;
    setIsSyncing(true);
    try {
      for (const record of pending) {
        await syncRecord(record);
      }
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
    }
  }

  function addParticipant() {
    const name = normalizeText(participantInput);
    if (!name) return;

    const exists = participants.some(
      (participant) => participant.toLowerCase() === name.toLowerCase(),
    );
    if (exists) {
      setParticipantInput("");
      return;
    }

    setParticipants((current) => [...current, name].sort((a, b) => a.localeCompare(b)));
    setSelectedParticipants((current) => ({ ...current, [name]: true }));
    setParticipantInput("");
  }

  function removeParticipant(name: string) {
    setParticipants((current) => current.filter((participant) => participant !== name));
    setSelectedParticipants((current) => {
      const next = { ...current };
      delete next[name];
      return next;
    });
  }

  function toggleParticipant(name: string) {
    setSelectedParticipants((current) => ({ ...current, [name]: !current[name] }));
  }

  function markParticipants(checked: boolean) {
    setSelectedParticipants(
      participants.reduce<Record<string, boolean>>((acc, name) => {
        acc[name] = checked;
        return acc;
      }, {}),
    );
  }

  async function installApp() {
    if (!installPrompt) return;

    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);
    setIsInstalled(choice.outcome === "accepted");
  }

  async function saveRecord(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    setIsSubmitting(true);

    const cleanEvent = normalizeText(eventName);
    const cleanPresence = selectedNames.join("\n");

    if (!recordDate) {
      setSaveState("error");
      setMessage("Preencha a data.");
      setIsSubmitting(false);
      return;
    }

    if (!cleanEvent) {
      setSaveState("error");
      setMessage("Preencha o evento.");
      setIsSubmitting(false);
      return;
    }

    if (selectedNames.length === 0) {
      setSaveState("error");
      setMessage("Marque pelo menos um participante presente.");
      setIsSubmitting(false);
      return;
    }

    const nextRecord: AttendanceRecord = {
      id: makeId(),
      data: recordDate,
      evento: cleanEvent,
      presenca: cleanPresence,
      submittedAt: new Date().toISOString(),
      participants: selectedNames,
      syncStatus: "pending",
    };

    setRecords((current) => [nextRecord, ...current].slice(0, 80));
    setEventName("");
    setSelectedParticipants({});

    const synced = await syncRecord(nextRecord);
    setSaveState(synced ? "success" : "error");
    setMessage(
      synced
        ? "Registro enviado para a planilha."
        : "Registro salvo no aparelho. Quando a conexão voltar, o app tenta enviar para a planilha.",
    );
    setIsSubmitting(false);
  }

  return (
    <main className="appShell">
      <header className="topbar">
        <div className="brand">
          <img src={withBasePath("/logo-er.png")} alt="Logo ER" className="brandLogo" />
          <div>
            <p className="eyebrow">Planilha vinculada</p>
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
        <span className="dot connected" />
        <span>
          {isSyncing
            ? "Enviando para a planilha"
            : pendingRecords.length === 0
              ? "Planilha conectada"
              : "Sincronização pendente"}
        </span>
        <strong>{records.length}</strong>
        <span>registros salvos</span>
        {pendingRecords.length > 0 ? <small>{pendingRecords.length} pendentes</small> : null}
      </section>

      <div className="workspace">
        <form className="panel formPanel" onSubmit={saveRecord}>
          <div className="panelHeader">
            <div>
              <p className="eyebrow">{SHEET_NAME}</p>
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

          <section className="field participantsField">
            <div className="participantTitleRow">
              <span>Presença</span>
              <div className="buttonGroup">
                <button type="button" className="quietButton compactButton" onClick={() => markParticipants(true)}>
                  Todos
                </button>
                <button type="button" className="quietButton compactButton" onClick={() => markParticipants(false)}>
                  Limpar
                </button>
              </div>
            </div>

            <div className="addParticipant">
              <input
                value={participantInput}
                onChange={(event) => setParticipantInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  addParticipant();
                }}
                placeholder="Nome do participante"
              />
              <button type="button" onClick={addParticipant}>
                Adicionar
              </button>
            </div>

            <div className="participantList">
              {participants.length === 0 ? (
                <p className="emptyState">Adicione os nomes uma vez. Eles ficarão salvos para os próximos eventos.</p>
              ) : (
                participants.map((name) => (
                  <div className="participantRow" key={name}>
                    <label>
                      <input
                        type="checkbox"
                        checked={Boolean(selectedParticipants[name])}
                        onChange={() => toggleParticipant(name)}
                      />
                      <span>{name}</span>
                    </label>
                    <button type="button" aria-label={`Remover ${name}`} onClick={() => removeParticipant(name)}>
                      Remover
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="selectedList">
              {selectedNames.length === 0 ? (
                <p>Nenhum participante marcado.</p>
              ) : (
                selectedNames.map((name) => <span key={name}>{name}</span>)
              )}
            </div>
          </section>

          {message ? <p className={`message ${saveState}`}>{message}</p> : null}

          <button className="primaryButton" type="submit" disabled={!canSubmit}>
            {isSubmitting ? "Enviando..." : "Salvar registro"}
          </button>
        </form>

        <section className="panel recordsPanel">
          <div className="panelHeader">
            <div>
              <p className="eyebrow">Histórico local</p>
              <h2>Últimos lançamentos</h2>
            </div>
            <span className="countBadge">{records.length} salvos</span>
          </div>

          {lastRecord ? (
            <div className="latestRecord">
              <span>Último registro</span>
              <strong>{lastRecord.evento}</strong>
              <small>{formatDate(lastRecord.data)}</small>
            </div>
          ) : null}

          <div className="recordList">
            {records.length === 0 ? (
              <p className="emptyState">Nenhum lançamento salvo neste dispositivo.</p>
            ) : (
              records.slice(0, 14).map((record) => (
                <article className="recordRow" key={record.id}>
                  <div className="recordDate">
                    <strong>{formatDate(record.data)}</strong>
                    <span className={`saved ${record.syncStatus ?? "pending"}`}>
                      {record.syncStatus === "synced" ? "Enviado" : "Pendente"}
                    </span>
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
      </div>
    </main>
  );
}

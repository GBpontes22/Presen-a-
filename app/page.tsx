"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

const SPREADSHEET_ID = "1Vufd1iCOEj450pKEfGg7Kz1OiXyx_7ybfj1mubdvFmQ";
const SHEET_NAME = "Página1";
const SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1Vufd1iCOEj450pKEfGg7Kz1OiXyx_7ybfj1mubdvFmQ/edit";
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const STORAGE_KEY = "embaixador.records";

type SaveState = "idle" | "success" | "error";

type AttendanceRecord = {
  id: string;
  data: string;
  evento: string;
  presenca: string;
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

function withBasePath(path: string) {
  return `${BASE_PATH}${path}`;
}

export default function Home() {
  const [recordDate, setRecordDate] = useState(todayISO);
  const [eventName, setEventName] = useState("");
  const [presence, setPresence] = useState("");
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [message, setMessage] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    try {
      const storedRecords = localStorage.getItem(STORAGE_KEY);

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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records.slice(0, 80)));
  }, [records, hydrated]);

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

  const canSubmit =
    recordDate.length > 0 &&
    eventName.trim().length > 0 &&
    presence.trim().length > 0;

  async function installApp() {
    if (!installPrompt) return;

    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);
    setIsInstalled(choice.outcome === "accepted");
  }

  function saveRecord(event: FormEvent) {
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
      submittedAt: new Date().toISOString(),
    };

    setRecords((current) => [nextRecord, ...current].slice(0, 80));
    setSaveState("success");
    setMessage("Registro salvo. A planilha vinculada está no botão Abrir planilha.");
    setEventName("");
    setPresence("");
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
        <span>Link direto para a planilha enviada</span>
        <strong>{records.length}</strong>
        <span>registros salvos</span>
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

          <label className="field">
            <span>Presença</span>
            <textarea
              value={presence}
              onChange={(event) => setPresence(event.target.value)}
              placeholder="Nome ou lista de presença"
              rows={5}
            />
          </label>

          <div className="sheetSummary">
            <span>Destino fixo</span>
            <strong>{SHEET_NAME}</strong>
            <small>Colunas: data, evento, presença</small>
          </div>

          {message ? <p className={`message ${saveState}`}>{message}</p> : null}

          <button className="primaryButton" type="submit" disabled={!canSubmit}>
            Salvar registro
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
                    <span className="saved">Salvo</span>
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

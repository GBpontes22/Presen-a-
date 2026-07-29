"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

const SPREADSHEET_ID = "14U1vFIGf9GTNyEzxt9uXx3kEjLpN2K9LTMlFSY9B9bk";
const SHEET_URL =
  "https://docs.google.com/spreadsheets/d/14U1vFIGf9GTNyEzxt9uXx3kEjLpN2K9LTMlFSY9B9bk/edit";

const APPS_SCRIPT_CODE = String.raw`const SPREADSHEET_ID = "14U1vFIGf9GTNyEzxt9uXx3kEjLpN2K9LTMlFSY9B9bk";

function doGet() {
  return jsonResponse({ ok: true, app: "Presença Embaixada" });
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents || "{}");
    const meetingName = String(payload.meetingName || "").trim();
    const meetingDate = String(payload.meetingDate || "").trim();
    const presentParticipants = Array.isArray(payload.presentParticipants)
      ? payload.presentParticipants.map(String).map((name) => name.trim()).filter(Boolean)
      : [];
    const allParticipants = Array.isArray(payload.allParticipants)
      ? payload.allParticipants.map(String).map((name) => name.trim()).filter(Boolean)
      : presentParticipants;

    if (!meetingName) throw new Error("Nome da reunião ausente.");
    if (!meetingDate) throw new Error("Data da reunião ausente.");
    if (presentParticipants.length === 0) {
      throw new Error("Nenhum participante presente foi marcado.");
    }

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const cadastro = ensureSheet(ss, "Cadastro");
    const geral = ensureSheet(ss, "Geral");
    const indice = ensureSheet(ss, "Reuniões");
    const modelo = ss.getSheetByName("Modelo Reunião");

    syncCadastro(cadastro, allParticipants);

    const sheetName = uniqueSheetName(ss, cleanSheetName(meetingName));
    const meetingSheet = modelo ? modelo.copyTo(ss).setName(sheetName) : ss.insertSheet(sheetName);
    meetingSheet.getRange("B3").setValue(meetingName);
    meetingSheet.getRange("B4").setValue(new Date(meetingDate + "T00:00:00"));
    meetingSheet.getRange("A9:B208").clearContent();
    meetingSheet
      .getRange(9, 1, presentParticipants.length, 2)
      .setValues(presentParticipants.map((name) => [name, true]));

    const dateValue = new Date(meetingDate + "T00:00:00");
    const geralStart = Math.max(geral.getLastRow() + 1, 6);
    geral
      .getRange(geralStart, 1, presentParticipants.length, 5)
      .setValues(presentParticipants.map((name) => [dateValue, meetingName, name, true, sheetName]));

    const indiceStart = Math.max(indice.getLastRow() + 1, 6);
    indice.getRange(indiceStart, 1, 1, 4).setValues([
      [dateValue, meetingName, sheetName, presentParticipants.length],
    ]);

    return jsonResponse({
      ok: true,
      sheetName,
      savedRows: presentParticipants.length,
      spreadsheetUrl: ss.getUrl(),
    });
  } catch (error) {
    return jsonResponse({ ok: false, error: String(error && error.message ? error.message : error) });
  }
}

function ensureSheet(ss, name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function syncCadastro(sheet, names) {
  if (sheet.getLastRow() < 5) {
    sheet.getRange("A5:B5").setValues([["Nome do participante", "Observações"]]);
  }
  const existing = sheet.getRange("A6:A205").getValues().flat().map(String).filter(Boolean);
  const normalized = new Set(existing.map((name) => name.toLowerCase()));
  const newNames = names.filter((name) => !normalized.has(name.toLowerCase()));
  if (newNames.length === 0) return;
  const startRow = Math.max(sheet.getLastRow() + 1, 6);
  sheet.getRange(startRow, 1, newNames.length, 1).setValues(newNames.map((name) => [name]));
}

function cleanSheetName(name) {
  return String(name).replace(/[\\/?*[\]:]/g, "-").slice(0, 90) || "Reunião";
}

function uniqueSheetName(ss, base) {
  let name = base;
  let i = 2;
  while (ss.getSheetByName(name)) {
    const suffix = " (" + i + ")";
    name = base.slice(0, 99 - suffix.length) + suffix;
    i++;
  }
  return name;
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}`;

type LocalMeeting = {
  id: string;
  meetingDate: string;
  meetingName: string;
  presentParticipants: string[];
};

type SaveState = "idle" | "saving" | "success" | "error";

function todayISO() {
  const date = new Date();
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 10);
}

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function Home() {
  const [meetingName, setMeetingName] = useState("");
  const [meetingDate, setMeetingDate] = useState(todayISO);
  const [participantInput, setParticipantInput] = useState("");
  const [participants, setParticipants] = useState<string[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [endpoint, setEndpoint] = useState("");
  const [localMeetings, setLocalMeetings] = useState<LocalMeeting[]>([]);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [message, setMessage] = useState("");
  const [scriptCopied, setScriptCopied] = useState(false);

  useEffect(() => {
    const storedParticipants = localStorage.getItem("presenca.participants");
    const storedEndpoint = localStorage.getItem("presenca.endpoint");
    const storedMeetings = localStorage.getItem("presenca.meetings");

    if (storedParticipants) {
      setParticipants(JSON.parse(storedParticipants));
    }
    if (storedEndpoint) {
      setEndpoint(storedEndpoint);
    }
    if (storedMeetings) {
      setLocalMeetings(JSON.parse(storedMeetings));
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("presenca.participants", JSON.stringify(participants));
  }, [participants]);

  useEffect(() => {
    localStorage.setItem("presenca.endpoint", endpoint);
  }, [endpoint]);

  useEffect(() => {
    localStorage.setItem("presenca.meetings", JSON.stringify(localMeetings.slice(0, 12)));
  }, [localMeetings]);

  const presentParticipants = useMemo(
    () => participants.filter((name) => selected[name]),
    [participants, selected],
  );

  const canSave =
    meetingName.trim().length > 0 &&
    meetingDate.length > 0 &&
    presentParticipants.length > 0 &&
    endpoint.trim().length > 0 &&
    saveState !== "saving";

  function addParticipant(event?: FormEvent) {
    event?.preventDefault();
    const name = normalizeName(participantInput);
    if (!name) return;

    const exists = participants.some(
      (participant) => participant.toLowerCase() === name.toLowerCase(),
    );
    if (exists) {
      setParticipantInput("");
      return;
    }

    setParticipants((current) => [...current, name].sort((a, b) => a.localeCompare(b)));
    setSelected((current) => ({ ...current, [name]: true }));
    setParticipantInput("");
  }

  function removeParticipant(name: string) {
    setParticipants((current) => current.filter((participant) => participant !== name));
    setSelected((current) => {
      const next = { ...current };
      delete next[name];
      return next;
    });
  }

  function toggleParticipant(name: string) {
    setSelected((current) => ({ ...current, [name]: !current[name] }));
  }

  function markAll(checked: boolean) {
    setSelected(
      participants.reduce<Record<string, boolean>>((acc, name) => {
        acc[name] = checked;
        return acc;
      }, {}),
    );
  }

  async function copyScript() {
    await navigator.clipboard.writeText(APPS_SCRIPT_CODE);
    setScriptCopied(true);
    window.setTimeout(() => setScriptCopied(false), 1800);
  }

  async function saveMeeting(event: FormEvent) {
    event.preventDefault();
    setMessage("");

    if (!meetingName.trim()) {
      setSaveState("error");
      setMessage("Preencha o nome da reunião.");
      return;
    }

    if (!meetingDate) {
      setSaveState("error");
      setMessage("Preencha a data da reunião.");
      return;
    }

    if (presentParticipants.length === 0) {
      setSaveState("error");
      setMessage("Marque pelo menos uma pessoa presente.");
      return;
    }

    if (!endpoint.trim()) {
      setSaveState("error");
      setMessage("Cole a URL do Web App do Apps Script para salvar no Google Planilhas.");
      return;
    }

    const payload = {
      meetingName: normalizeName(meetingName),
      meetingDate,
      presentParticipants,
      allParticipants: participants,
      spreadsheetId: SPREADSHEET_ID,
      submittedAt: new Date().toISOString(),
    };

    try {
      setSaveState("saving");
      await fetch(endpoint.trim(), {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
      });

      setLocalMeetings((current) => [
        {
          id: makeId(),
          meetingName: payload.meetingName,
          meetingDate,
          presentParticipants,
        },
        ...current,
      ]);
      setSelected({});
      setMeetingName("");
      setSaveState("success");
      setMessage("Reunião enviada para o Google Planilhas.");
    } catch {
      setSaveState("error");
      setMessage("Não foi possível enviar. Confira a URL do Apps Script.");
    }
  }

  return (
    <main className="appShell">
      <header className="topbar">
        <div className="brand">
          <img src="/logo-er.png" alt="Logo ER" className="brandLogo" />
          <div>
            <p className="eyebrow">Embaixada</p>
            <h1>Presença de reuniões</h1>
          </div>
        </div>
        <a className="sheetLink" href={SHEET_URL} target="_blank" rel="noreferrer">
          Abrir planilha
        </a>
      </header>

      <section className="statusStrip" aria-live="polite">
        <span className={endpoint ? "dot connected" : "dot"} />
        <span>{endpoint ? "Google Planilhas conectado" : "Conexão com Google Planilhas pendente"}</span>
        <strong>{presentParticipants.length}</strong>
        <span>presentes marcados</span>
      </section>

      <div className="workspace">
        <form className="panel meetingPanel" onSubmit={saveMeeting}>
          <div className="panelHeader">
            <div>
              <p className="eyebrow">Lançamento</p>
              <h2>Nova reunião</h2>
            </div>
            <button type="button" className="quietButton" onClick={() => setMeetingDate(todayISO())}>
              Hoje
            </button>
          </div>

          <label className="field">
            <span>Nome da reunião</span>
            <input
              value={meetingName}
              onChange={(event) => setMeetingName(event.target.value)}
              placeholder="Ex.: Reunião de liderança"
            />
          </label>

          <label className="field">
            <span>Data</span>
            <input
              type="date"
              value={meetingDate}
              onChange={(event) => setMeetingDate(event.target.value)}
            />
          </label>

          <div className="summaryLine">
            <span>Lista final</span>
            <strong>{presentParticipants.length} participantes</strong>
          </div>

          <div className="selectedList">
            {presentParticipants.length === 0 ? (
              <p>Nenhum presente selecionado.</p>
            ) : (
              presentParticipants.map((name) => <span key={name}>{name}</span>)
            )}
          </div>

          {message ? <p className={`message ${saveState}`}>{message}</p> : null}

          <button className="primaryButton" type="submit" disabled={!canSave}>
            {saveState === "saving" ? "Salvando..." : "Salvar reunião"}
          </button>
        </form>

        <section className="panel participantsPanel">
          <div className="panelHeader">
            <div>
              <p className="eyebrow">Participantes</p>
              <h2>Cadastro e presença</h2>
            </div>
            <div className="buttonGroup">
              <button type="button" className="quietButton" onClick={() => markAll(true)}>
                Todos
              </button>
              <button type="button" className="quietButton" onClick={() => markAll(false)}>
                Limpar
              </button>
            </div>
          </div>

          <form className="addParticipant" onSubmit={addParticipant}>
            <input
              value={participantInput}
              onChange={(event) => setParticipantInput(event.target.value)}
              placeholder="Nome do participante"
            />
            <button type="submit">Adicionar</button>
          </form>

          <div className="participantList">
            {participants.length === 0 ? (
              <p className="emptyState">Adicione os nomes uma vez e marque presença a cada reunião.</p>
            ) : (
              participants.map((name) => (
                <div className="participantRow" key={name}>
                  <label>
                    <input
                      type="checkbox"
                      checked={Boolean(selected[name])}
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

          <details className="scriptBox">
            <summary>Script do Google Planilhas</summary>
            <textarea readOnly value={APPS_SCRIPT_CODE} />
            <button type="button" className="quietButton fullWidth" onClick={copyScript}>
              {scriptCopied ? "Script copiado" : "Copiar script"}
            </button>
          </details>

          <div className="recentHeader">
            <p className="eyebrow">Últimos envios</p>
          </div>
          <div className="recentList">
            {localMeetings.length === 0 ? (
              <p className="emptyState">Sem reuniões salvas neste dispositivo.</p>
            ) : (
              localMeetings.map((meeting) => (
                <div className="recentRow" key={meeting.id}>
                  <strong>{meeting.meetingName}</strong>
                  <span>
                    {meeting.meetingDate} · {meeting.presentParticipants.length} presentes
                  </span>
                </div>
              ))
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}

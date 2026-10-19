"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

export function VoiceNoteInput({ value, onChange, onSend, disabled, placeholder = "A little less music, more books…" }: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled: boolean;
  placeholder?: string;
}) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const [error, setError] = useState("");
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const changeRef = useRef(onChange);
  useEffect(() => { changeRef.current = onChange; }, [onChange]);
  useEffect(() => {
    const browser = window as Window & { SpeechRecognition?: new () => SpeechRecognitionInstance; webkitSpeechRecognition?: new () => SpeechRecognitionInstance };
    const Recognition = browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
    if (!Recognition) return;
    const recognition = new Recognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onresult = (event) => { changeRef.current(Array.from(event.results).map((result) => result[0]?.transcript ?? "").join(" ")); };
    recognition.onerror = (event) => {
      if (event.error !== "aborted") setError(event.error === "not-allowed" ? "Microphone access is blocked. You can type your note instead." : "Voice input stopped. Try again or type your note.");
      setListening(false);
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    queueMicrotask(() => setSupported(true));
    return () => { recognition.onresult = null; recognition.onerror = null; recognition.onend = null; recognition.abort(); recognitionRef.current = null; };
  }, []);
  useEffect(() => { if (disabled) recognitionRef.current?.abort(); }, [disabled]);

  function toggleListening() {
    if (!recognitionRef.current || disabled) return;
    setError("");
    if (listening) { recognitionRef.current.stop(); setListening(false); }
    else {
      try { recognitionRef.current.start(); setListening(true); }
      catch { setError("Voice input could not start. Type your note instead."); }
    }
  }

  return <div className="voice-note">
    <div className={`voice-note-field ${listening ? "is-listening" : ""}`}>
      <input id="refine-note" aria-label="Refine your gift selection" value={value} disabled={disabled} placeholder={listening ? "Listening…" : placeholder} onChange={(event) => onChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && value.trim() && !disabled) { event.preventDefault(); onSend(); } }} />
      {supported && <button type="button" className="icon-button" disabled={disabled} aria-label={listening ? "Stop voice input" : "Speak a refinement"} aria-pressed={listening} onClick={toggleListening}><Icon name={listening ? "stop" : "mic"} size={18} /></button>}
      <button type="button" className="send-note" aria-label="Apply refinement" disabled={disabled || !value.trim()} onClick={onSend}><Icon name="arrow" size={18} /></button>
    </div>
    {listening && <p className="voice-status" role="status"><span className="live-dot" />Listening. Say what you&apos;d change.</p>}
    {error && <p className="voice-error" role="alert">{error}</p>}
  </div>;
}

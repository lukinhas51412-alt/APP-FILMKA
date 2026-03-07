/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Calendar as CalendarIcon, 
  ClipboardList, 
  Bell, 
  User as UserIcon, 
  LogOut, 
  Plus, 
  Check, 
  X, 
  ChevronLeft, 
  ChevronRight,
  Camera,
  Edit2,
  Trash2,
  Shield,
  UserCheck,
  Clock,
  ChevronDown,
  Mic,
  ArrowRight,
  Search
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

declare global {
  interface Window {
    storage: any;
  }
}

// --- Types ---
type Role = 'pending' | 'volunteer' | 'leader' | 'admin';

interface User {
  id: string;
  nome: string;
  email: string;
  senha?: string;
  dataNascimento: string;
  areas: string[];
  aprovado: boolean;
  papel: Role;
  fotoPerfil?: string;
  dataEntrada: string;
  boasVindasExibido?: boolean;
}

interface Scale {
  id: string;
  titulo: string;
  data: string; // AAAA-MM-DD
  horario: string;
  area: string;
  posicoes: {
    corte: string | null;
    camera1: string | null;
    camera2: string | null;
    camera3: string | null;
  };
  notas: string;
  confirmacoes: Record<string, 'confirmado' | 'recusado' | 'furou' | 'pendente' | 'indisponivel' | 'aguardando_validacao' | 'serviu'>;
  criadoPor: string;
}

interface Post {
  id: string;
  autorId: string;
  autorNome: string;
  autorFoto?: string;
  conteudo: string;
  data: string;
  lida: string[]; // IDs dos usuários que leram
  likes: string[]; // IDs dos usuários que curtiram
}

interface Message {
  id: string;
  remetenteId: string;
  destinatarioId: string;
  conteudo: string;
  data: string;
  lida: boolean;
  reacoes?: Record<string, string>; // userId -> emoji
  isSystem?: boolean;
}

interface Notification {
  id: string;
  userId: string;
  mensagem: string;
  data: string;
  lida: boolean;
}

// --- Database Layer ---
const DB = {
  KEYS: {
    USERS:        "church-users",
    SCHEDULES:    "church-schedules",
    NOTIFS:       "church-notifs",
    POSTS:        "church-posts",
    MESSAGES:     "church-messages",
    CANDIDATURAS: "church-candidaturas",
    SESSION:      "church-session",
  },

  async get(key: string, fallback = []) {
    for (let tentativa = 1; tentativa <= 3; tentativa++) {
      try {
        const raw = await window.storage.get(key);
        if (!raw?.value) return fallback;
        const parsed = JSON.parse(raw.value);
        return parsed ?? fallback;
      } catch (err) {
        console.warn(`[DB] Tentativa ${tentativa} falhou para "${key}":`, err);
        if (tentativa === 3) return fallback;
        await new Promise(r => setTimeout(r, 300 * tentativa));
      }
    }
    return fallback;
  },

  async set(key: string, value: any) {
    for (let tentativa = 1; tentativa <= 3; tentativa++) {
      try {
        await window.storage.set(key, JSON.stringify(value));
        return true;
      } catch (err) {
        console.warn(`[DB] Tentativa ${tentativa} de escrita falhou para "${key}":`, err);
        if (tentativa === 3) return false;
        await new Promise(r => setTimeout(r, 300 * tentativa));
      }
    }
    return false;
  },

  async delete(key: string) {
    try { await window.storage.delete(key); return true; }
    catch (err) { console.error(`[DB] Erro ao deletar "${key}":`, err); return false; }
  },

  async getUsers()        { return this.get(this.KEYS.USERS,        []); },
  async getSchedules()    { return this.get(this.KEYS.SCHEDULES,    []); },
  async getNotifs()       { return this.get(this.KEYS.NOTIFS,       []); },
  async getPosts()        { return this.get(this.KEYS.POSTS,        []); },
  async getMessages()     { return this.get(this.KEYS.MESSAGES,     []); },
  async getCandidaturas() { return this.get(this.KEYS.CANDIDATURAS, []); },
  async getSession()      { return this.get(this.KEYS.SESSION,      null); },

  async setUsers(d: any)        { return this.set(this.KEYS.USERS,        d); },
  async setSchedules(d: any)    { return this.set(this.KEYS.SCHEDULES,    d); },
  async setNotifs(d: any)       { return this.set(this.KEYS.NOTIFS,       d); },
  async setPosts(d: any)        { return this.set(this.KEYS.POSTS,        d); },
  async setMessages(d: any)     { return this.set(this.KEYS.MESSAGES,     d); },
  async setCandidaturas(d: any) { return this.set(this.KEYS.CANDIDATURAS, d); },
  async setSession(d: any)      { return this.set(this.KEYS.SESSION,      d); },

  async updateItem(key: string, id: string, changes: any) {
    const items = await this.get(key, []);
    const atualizados = items.map((i: any) => i.id === id ? { ...i, ...changes } : i);
    await this.set(key, atualizados);
    return atualizados.find((i: any) => i.id === id);
  },

  async addItem(key: string, item: any) {
    const items = await this.get(key, []);
    const atualizados = [...items, item];
    await this.set(key, atualizados);
    return item;
  },

  async removeItem(key: string, id: string) {
    const items = await this.get(key, []);
    const filtrados = items.filter((i: any) => i.id !== id);
    await this.set(key, filtrados);
    return filtrados;
  },
};

const garantirSeedAdmin = async () => {
  try {
    const SEED_ADMIN = {
      id: "admin-seed-001",
      nome: "Administrador",
      email: "admin@ministerio.com",
      senha: "admin123",
      papel: "admin",
      aprovado: true,
      areas: [],
      fotoPerfil: null,
      dataEntrada: new Date().toISOString(),
    };

    let users = await DB.get(DB.KEYS.USERS, []);

    // Remover qualquer versão corrompida do admin e reinserir limpo
    users = users.filter((u: any) => u.id !== "admin-seed-001" && u.email !== "admin@ministerio.com");
    users.unshift(SEED_ADMIN); // Inserir sempre na primeira posição

    await DB.set(DB.KEYS.USERS, users);

    console.log("✅ Seed admin garantido:", SEED_ADMIN);
    console.log("✅ Todos os usuários:", users);

    return users;
  } catch (err) {
    console.error("❌ Erro crítico no seed admin:", err);
    // Último recurso — salvar apenas o admin
    const fallback = [{
      id: "admin-seed-001",
      nome: "Administrador",
      email: "admin@ministerio.com",
      senha: "admin123",
      papel: "admin",
      aprovado: true,
      areas: [],
      fotoPerfil: null,
      dataEntrada: new Date().toISOString(),
    }];
    await DB.set(DB.KEYS.USERS, fallback);
    return fallback;
  }
};

const useDBState = (getter: any, setter: any, chave: string) => {
  const carregar = React.useCallback(async () => {
    try {
      const dados = await getter();
      setter(dados);
    } catch (err) {
      console.error(`[useDBState] Erro ao sincronizar "${chave}":`, err);
    }
  }, [getter, setter, chave]);

  return carregar;
};

// --- Image Helpers ---
const converterParaBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Falha ao ler arquivo"));
    reader.readAsDataURL(file);
  });
};

const redimensionarImagem = (base64: string, maxWidth: number, maxHeight: number): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx?.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.src = base64;
  });
};

const salvarFotoPerfil = async (base64: string, usuarioId: string, setUsuarioLogado: any) => {
  try {
    const users = await DB.getUsers();
    const atualizados = users.map((u: any) =>
      u.id === usuarioId ? { ...u, fotoPerfil: base64 } : u
    );

    await DB.setUsers(atualizados);

    const usuarioAtualizado = atualizados.find((u: any) => u.id === usuarioId);
    if (usuarioAtualizado) {
      setUsuarioLogado(usuarioAtualizado);
      await DB.setSession({
        userId: usuarioAtualizado.id,
        email: usuarioAtualizado.email,
        papel: usuarioAtualizado.papel,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (err) {
    console.error("Erro ao salvar foto:", err);
    throw err;
  }
};

const ProfilePhotoUpload = ({ usuarioLogado, onFotoAtualizada }: any) => {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [carregando, setCarregando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);

  const handleClick = () => {
    setErro(null);
    inputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const tiposPermitidos = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
    if (!tiposPermitidos.includes(file.type) && !file.type.startsWith("image/")) {
      setErro("Formato não suportado. Use JPG, PNG ou WEBP.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setErro("Imagem muito grande. Máximo 5MB.");
      return;
    }

    setCarregando(true);
    setErro(null);

    try {
      const base64 = await converterParaBase64(file);
      const base64Reduzido = await redimensionarImagem(base64, 300, 300);
      await onFotoAtualizada(base64Reduzido);
    } catch (err) {
      console.error("Erro ao processar imagem:", err);
      setErro("Erro ao carregar imagem. Tente novamente.");
    } finally {
      setCarregando(false);
      e.target.value = "";
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
      <div
        onClick={handleClick}
        style={{
          width: "90px",
          height: "90px",
          borderRadius: "50%",
          background: usuarioLogado.fotoPerfil ? "transparent" : "#f0f0f0",
          border: "2px solid #e5e5ea",
          overflow: "hidden",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
        }}
      >
        {usuarioLogado.fotoPerfil ? (
          <img
            src={usuarioLogado.fotoPerfil}
            alt="Foto de perfil"
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <span style={{ fontSize: "32px", color: "#6e6e73" }}>
            {usuarioLogado.nome?.charAt(0).toUpperCase()}
          </span>
        )}

        <div style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          background: "rgba(0,0,0,0.45)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "30px",
        }}>
          {carregando ? (
            <div style={{
              width: "14px", height: "14px",
              border: "2px solid white",
              borderTopColor: "transparent",
              borderRadius: "50%",
              animation: "spin 0.7s linear infinite",
            }}/>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24"
              fill="none" stroke="white" strokeWidth="2">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8
                a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
          )}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        style={{ display: "none" }}
      />

      <button
        onClick={handleClick}
        disabled={carregando}
        style={{
          background: "none",
          border: "none",
          color: "#1d1d1f",
          fontSize: "14px",
          fontWeight: "500",
          cursor: carregando ? "not-allowed" : "pointer",
          opacity: carregando ? 0.5 : 1,
          padding: "4px 0",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif",
        }}
      >
        {carregando ? "Carregando..." : usuarioLogado.fotoPerfil ? "Trocar foto" : "Adicionar foto"}
      </button>

      {erro && (
        <span style={{ fontSize: "12px", color: "#ff3b30", textAlign: "center" }}>
          {erro}
        </span>
      )}
    </div>
  );
};

const TIPO = {
  titulo:    { fontSize: "22px", fontWeight: "700", color: "#1d1d1f", letterSpacing: "-0.3px" },
  subtitulo: { fontSize: "17px", fontWeight: "600", color: "#1d1d1f" },
  corpo:     { fontSize: "15px", fontWeight: "400", color: "#1d1d1f", lineHeight: "1.5" },
  caption:   { fontSize: "13px", fontWeight: "400", color: "#6e6e73" },
  mini:      { fontSize: "11px", fontWeight: "400", color: "#6e6e73" },
  label:     { fontSize: "12px", fontWeight: "500", color: "#6e6e73", textTransform: "uppercase", letterSpacing: "0.5px" },
};

const SPACE = {
  xs:  "4px",
  sm:  "8px",
  md:  "16px",
  lg:  "24px",
  xl:  "32px",
  xxl: "48px",
};

const cardStyle = {
  background: "white",
  borderRadius: "14px",
  border: "1px solid #e5e5ea",
  padding: "16px",
  marginBottom: "12px",
};

const inputStyle = {
  width: "100%",
  padding: "13px 14px",
  borderRadius: "12px",
  border: "1px solid #e5e5ea",
  fontSize: "16px",
  color: "#1d1d1f",
  background: "white",
  outline: "none",
  boxSizing: "border-box",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif",
  WebkitAppearance: "none",
};

const btnPrimario = {
  width: "100%",
  padding: "14px",
  borderRadius: "12px",
  border: "none",
  background: "#1d1d1f",
  color: "white",
  fontSize: "16px",
  fontWeight: "600",
  cursor: "pointer",
  minHeight: "44px",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif",
};

const btnSecundario = {
  ...btnPrimario,
  background: "white",
  color: "#1d1d1f",
  border: "1px solid #e5e5ea",
};

const btnDestrutivo = {
  ...btnPrimario,
  background: "#ff3b30",
};

const btnVerde = {
  ...btnPrimario,
  background: "#1a6b3c",
};

const badgeStyle = (tipo: any) => {
  const estilos: any = {
    confirmado:           { bg: "#e8f5e9", color: "#1a6b3c" },
    indisponivel:         { bg: "#fce8e8", color: "#c0392b" },
    pendente:             { bg: "#f5f5f7", color: "#6e6e73" },
    aguardando_validacao: { bg: "#fff8e1", color: "#f39c12" },
    serviu:               { bg: "#e8f5e9", color: "#1a6b3c" },
    furou:                { bg: "#fce8e8", color: "#c0392b" },
    admin:                { bg: "#f5f5f7", color: "#1d1d1f" },
    leader:               { bg: "#f5f5f7", color: "#1d1d1f" },
    volunteer:            { bg: "#f5f5f7", color: "#6e6e73" },
    pending:              { bg: "#fff8e1", color: "#f39c12" },
  };
  const e = estilos[tipo] || estilos.pendente;
  return {
    display: "inline-block",
    padding: "3px 10px",
    borderRadius: "20px",
    fontSize: "12px",
    fontWeight: "600",
    background: e.bg,
    color: e.color,
  };
};

const SecaoLabel = ({ titulo }: { titulo: string }) => (
  <p style={{
    fontSize: "12px",
    fontWeight: "500",
    color: "#6e6e73",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    margin: "24px 0 8px 4px",
  }}>
    {titulo}
  </p>
);

const TelaVazia = ({ icone, titulo, descricao, botao, onBotao }: any) => (
  <div style={{
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "48px 24px",
    textAlign: "center",
    gap: "12px",
    animation: "fadeIn 0.2s ease",
  }}>
    <div style={{ fontSize: "40px", marginBottom: "4px" }}>{icone}</div>
    <p style={{
      fontSize: "17px",
      fontWeight: "600",
      color: "#1d1d1f",
      margin: 0,
    }}>{titulo}</p>
    <p style={{
      fontSize: "14px",
      color: "#6e6e73",
      margin: 0,
      lineHeight: "1.5",
      maxWidth: "260px",
    }}>{descricao}</p>
    {botao && (
      <button
        onClick={onBotao}
        style={{
          marginTop: "8px",
          padding: "11px 24px",
          borderRadius: "12px",
          border: "none",
          background: "#1d1d1f",
          color: "white",
          fontSize: "14px",
          fontWeight: "600",
          cursor: "pointer",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif",
        }}
      >
        {botao}
      </button>
    )}
  </div>
);

const Toast = ({ mensagem, tipo, visivel }: any) => {
  if (!visivel) return null;
  const cores: any = {
    sucesso: { bg: "#1a6b3c", icon: "✅" },
    erro:    { bg: "#c0392b", icon: "❌" },
    info:    { bg: "#1d1d1f", icon: "ℹ️" },
  };
  const { bg, icon } = cores[tipo] || cores.info;
  return (
    <div style={{
      position: "fixed",
      top: "70px",
      left: "50%",
      transform: "translateX(-50%)",
      background: bg,
      color: "white",
      padding: "12px 20px",
      borderRadius: "12px",
      fontSize: "14px",
      fontWeight: "500",
      zIndex: 99999,
      display: "flex",
      alignItems: "center",
      gap: "8px",
      maxWidth: "340px",
      width: "90%",
      boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
      animation: "fadeIn 0.2s ease",
    }}>
      <span>{icon}</span>
      <span>{mensagem}</span>
    </div>
  );
};

const BotaoAcao = ({ label, labelCarregando, onClick, carregando, style, variant = 'primary' }: any) => {
  const baseStyle = variant === 'secondary' ? btnSecundario : variant === 'destructive' ? btnDestrutivo : variant === 'green' ? btnVerde : btnPrimario;
  return (
    <button
      onClick={onClick}
      disabled={carregando}
      style={{
        ...baseStyle,
        ...style,
        opacity: carregando ? 0.7 : 1,
        cursor: carregando ? "not-allowed" : "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "8px",
        position: "relative",
      }}
    >
      {carregando && (
        <div style={{
          width: "14px", height: "14px",
          border: "2px solid rgba(255,255,255,0.4)",
          borderTopColor: "white",
          borderRadius: "50%",
          animation: "spin 0.7s linear infinite",
          flexShrink: 0,
        }}/>
      )}
      {carregando ? (labelCarregando || label) : label}
    </button>
  );
};

const useToast = () => {
  const [toast, setToast] = React.useState({ visivel: false, mensagem: "", tipo: "info" });

  const mostrarToast = (mensagem: string, tipo: string = "info", duracao: number = 3000) => {
    setToast({ visivel: true, mensagem, tipo });
    setTimeout(() => setToast(prev => ({ ...prev, visivel: false })), duracao);
  };

  return { toast, mostrarToast };
};

const TelaBoasVindas = ({ usuarioLogado, onContinuar }: any) => {
  const [animando, setAnimando] = React.useState(true);

  React.useEffect(() => {
    const t = setTimeout(() => setAnimando(false), 600);
    return () => clearTimeout(t);
  }, []);

  const primeiroNome = usuarioLogado?.nome?.split(" ")[0] || "Membro";

  return (
    <div style={{
      minHeight: "100dvh",
      background: "#1d1d1f",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "32px 24px",
      textAlign: "center",
      animation: "fadeIn 0.5s ease",
    }}>

      {/* Ícone animado */}
      <div style={{
        width: "80px", height: "80px",
        borderRadius: "50%",
        background: "#1a6b3c",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        marginBottom: "32px",
        transform: animando ? "scale(0.8)" : "scale(1)",
        transition: "transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
      }}>
        <svg width="40" height="40" viewBox="0 0 24 24"
          fill="none" stroke="white" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6L9 17l-5-5"
            style={{
              strokeDasharray: 100,
              strokeDashoffset: animando ? 100 : 0,
              transition: "stroke-dashoffset 0.6s ease 0.2s",
            }}
          />
        </svg>
      </div>

      {/* Texto */}
      <h1 style={{
        fontSize: "28px",
        fontWeight: "700",
        color: "white",
        margin: "0 0 12px",
        letterSpacing: "-0.5px",
      }}>
        Bem-vindo, {primeiroNome}!
      </h1>

      <p style={{
        fontSize: "16px",
        color: "rgba(255,255,255,0.65)",
        lineHeight: "1.6",
        margin: "0 0 48px",
        maxWidth: "280px",
      }}>
        Seu cadastro foi aprovado. Você agora faz parte da equipe de Filmagem do Kombo Alpha.
      </p>

      {/* Áreas */}
      {usuarioLogado?.areas?.length > 0 && (
        <div style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "8px",
          justifyContent: "center",
          marginBottom: "48px",
        }}>
          {usuarioLogado.areas.map((area: any) => (
            <span key={area} style={{
              padding: "6px 14px",
              borderRadius: "20px",
              background: "rgba(255,255,255,0.1)",
              color: "rgba(255,255,255,0.85)",
              fontSize: "13px",
              fontWeight: "500",
            }}>
              {area}
            </span>
          ))}
        </div>
      )}

      {/* Botão */}
      <button
        onClick={onContinuar}
        style={{
          padding: "15px 48px",
          borderRadius: "14px",
          border: "none",
          background: "white",
          color: "#1d1d1f",
          fontSize: "16px",
          fontWeight: "700",
          cursor: "pointer",
          minHeight: "44px",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif",
          letterSpacing: "-0.2px",
        }}
      >
        Acessar o app →
      </button>

    </div>
  );
};

// --- Constants & Styles ---

const EMAILS_AUTORIZADOS = [
  "lucas.mansur@filmagem.com",
  "felipe.augusto@filmagem.com",
  "felipe.luiz@filmagem.com",
  "gabriel@filmagem.com",
  "gabriel.mares@filmagem.com",
  "gibi@filmagem.com",
  "helena.lomeu@filmagem.com",
  "henrique.marcos@filmagem.com",
  "joao.gabriel@filmagem.com",
  "joao.pedro@filmagem.com",
  "kaue@filmagem.com",
  "laura@filmagem.com",
  "matheus@filmagem.com",
  "pedro@filmagem.com",
  "pietro.gabriel@filmagem.com",
  "arhur.miguel@filmagem.com",
];

const SENHAS_PADRAO: Record<string, string> = {
  "lucas.mansur@filmagem.com":    "lucas@123",
  "felipe.augusto@filmagem.com":  "felipe@123",
  "felipe.luiz@filmagem.com":     "felipe@123",
  "gabriel@filmagem.com":         "gabriel@123",
  "gabriel.mares@filmagem.com":   "gabriel@123",
  "gibi@filmagem.com":            "gibi@123",
  "helena.lomeu@filmagem.com":    "helena@123",
  "henrique.marcos@filmagem.com": "henrique@123",
  "joao.gabriel@filmagem.com":    "joao@123",
  "joao.pedro@filmagem.com":      "joao@123",
  "kaue@filmagem.com":            "kaue@123",
  "laura@filmagem.com":           "laura@123",
  "matheus@filmagem.com":         "matheus@123",
  "pedro@filmagem.com":           "pedro@123",
  "pietro.gabriel@filmagem.com":  "pietro@123",
  "arhur.miguel@filmagem.com":    "arhur@123",
};

const LogoFilmka = ({ size = "large" }) => {
  const isSmall = size === "small";
  return (
    <svg
      viewBox="0 0 300 200"
      style={{
        width: isSmall ? "80px" : "100%",
        maxWidth: isSmall ? "80px" : "280px",
        height: isSmall ? "54px" : "auto",
        display: "block",
        margin: isSmall ? "0" : "0 auto",
      }}
    >
      <text
        x="10" y="110"
        fontFamily="-apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif"
        fontWeight="900"
        fontSize="100"
        fill="#1d1d1f"
        letterSpacing="-3"
      >FILM</text>
      <text
        x="48" y="200"
        fontFamily="-apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif"
        fontWeight="900"
        fontSize="100"
        fill="#1d1d1f"
        letterSpacing="-3"
      >KA</text>
    </svg>
  );
};

const LikeButton = ({ post, currentUserId, onToggle }: { post: Post, currentUserId: string, onToggle: any }) => {
  const liked = post.likes?.includes(currentUserId);
  const [animating, setAnimating] = React.useState(false);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setAnimating(true);
    setTimeout(() => setAnimating(false), 200);
    onToggle(post.id);
  };

  return (
    <button
      onClick={handleClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "5px",
        background: "none",
        border: "none",
        cursor: "pointer",
        padding: "6px 0",
        color: liked ? "#1d1d1f" : "#6e6e73",
        fontSize: "14px",
        transform: animating ? "scale(1.3)" : "scale(1)",
        transition: "transform 200ms ease",
      }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24"
        fill={liked ? "#1d1d1f" : "none"}
        stroke={liked ? "#1d1d1f" : "#6e6e73"}
        strokeWidth="1.5">
        <path d="M12 21C12 21 3 14.5 3 8.5C3 5.42 5.42 3 8.5 3C10.24 3 11.91 3.81 13 5.08C14.09 3.81 15.76 3 17.5 3C20.58 3 23 5.42 23 8.5C23 14.5 12 21 12 21Z"/>
      </svg>
      <span>{post.likes?.length || 0}</span>
    </button>
  );
};

const COLORS = {
  black: '#1d1d1f',
  gray: '#6e6e73',
  bg: '#f5f5f7',
  white: '#ffffff',
  green: '#1a6b3c',
  red: '#ff3b30',
  border: '#e5e5ea',
  lightGray: '#f2f2f7',
};

const FONTS = {
  apple: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif',
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    fontFamily: FONTS.apple,
    backgroundColor: COLORS.bg,
    color: COLORS.black,
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    width: '100%',
  },
  appWrapper: {
    width: '100%',
    maxWidth: '480px',
    backgroundColor: COLORS.white,
    minHeight: '100vh',
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 0 20px rgba(0,0,0,0.05)',
  },
  topBar: {
    position: 'sticky',
    top: 0,
    zIndex: 100,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    borderBottom: `1px solid ${COLORS.border}`,
    padding: '12px 20px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: '60px',
  },
  bottomNav: {
    position: 'fixed',
    bottom: 0,
    width: '100%',
    maxWidth: '480px',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    borderTop: `1px solid ${COLORS.border}`,
    display: 'flex',
    justifyContent: 'space-around',
    padding: '10px 0 25px 0',
    zIndex: 100,
  },
  navItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
    cursor: 'pointer',
    color: COLORS.gray,
    transition: 'color 0.2s ease',
    position: 'relative',
  },
  navItemActive: {
    color: COLORS.black,
  },
  navLabel: {
    fontSize: '10px',
    fontWeight: 500,
  },
  content: {
    flex: 1,
    padding: '20px',
    paddingBottom: '100px',
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: '14px',
    borderTop: `1px solid ${COLORS.border}`,
    borderBottom: `1px solid ${COLORS.border}`,
    borderLeft: `1px solid ${COLORS.border}`,
    borderRight: `1px solid ${COLORS.border}`,
    padding: '16px',
    marginBottom: '16px',
  },
  button: {
    borderRadius: '14px',
    padding: '12px 20px',
    fontSize: '16px',
    fontWeight: 600,
    cursor: 'pointer',
    border: 'none',
    transition: 'all 0.2s ease',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
  },
  input: {
    width: '100%',
    borderRadius: '10px',
    border: `1px solid ${COLORS.border}`,
    padding: '12px',
    fontSize: '16px',
    marginBottom: '12px',
    outline: 'none',
    backgroundColor: COLORS.lightGray,
  },
  label: {
    fontSize: '13px',
    color: COLORS.gray,
    marginBottom: '6px',
    display: 'block',
    fontWeight: 500,
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '20px',
  },
  modalContent: {
    backgroundColor: COLORS.white,
    borderRadius: '20px',
    width: '100%',
    maxWidth: '400px',
    maxHeight: '80vh',
    overflowY: 'auto',
    padding: '24px',
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: '-4px',
    right: '-4px',
    backgroundColor: COLORS.red,
    color: 'white',
    fontSize: '10px',
    borderRadius: '10px',
    padding: '2px 6px',
    fontWeight: 'bold',
  },
  statusTag: {
    padding: '4px 8px',
    borderRadius: '6px',
    fontSize: '11px',
    fontWeight: 600,
    textTransform: 'uppercase',
  }
};

// --- Components ---

const Button = ({ children, onClick, style, variant = 'primary', disabled = false, loading = false }: any) => {
  const [isHovered, setIsHovered] = useState(false);
  
  const baseStyle: React.CSSProperties = {
    ...styles.button,
    opacity: disabled ? 0.5 : 1,
    cursor: disabled ? 'not-allowed' : 'pointer',
    transform: isHovered && !disabled ? 'scale(0.98)' : 'scale(1)',
    ...style
  };

  const variants: Record<string, React.CSSProperties> = {
    primary: { backgroundColor: COLORS.black, color: COLORS.white },
    secondary: { backgroundColor: COLORS.lightGray, color: COLORS.black },
    outline: { backgroundColor: 'transparent', border: `1px solid ${COLORS.border}`, color: COLORS.black },
    danger: { backgroundColor: COLORS.red, color: COLORS.white },
    success: { backgroundColor: COLORS.green, color: COLORS.white },
  };

  return (
    <button 
      onClick={onClick} 
      disabled={disabled || loading}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{ ...baseStyle, ...variants[variant] }}
    >
      {loading ? 'Carregando...' : children}
    </button>
  );
};

const Input = ({ label, type = 'text', value, onChange, placeholder, style }: any) => (
  <div style={{ width: '100%' }}>
    {label && <label style={styles.label}>{label}</label>}
    <input 
      type={type} 
      value={value} 
      onChange={(e) => onChange(e.target.value)} 
      placeholder={placeholder}
      style={{ ...styles.input, ...style }}
    />
  </div>
);

const Select = ({ label, value, onChange, options, style }: any) => (
  <div style={{ width: '100%', marginBottom: '12px' }}>
    {label && <label style={styles.label}>{label}</label>}
    <div style={{ position: 'relative' }}>
      <select 
        value={value} 
        onChange={(e) => onChange(e.target.value)}
        style={{ ...styles.input, appearance: 'none', marginBottom: 0, ...style }}
      >
        {options.map((opt: any) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      <ChevronDown size={18} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: COLORS.gray }} />
    </div>
  </div>
);

const Modal = ({ isOpen, onClose, title, children }: any) => {
  if (!isOpen) return null;
  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        style={styles.modalContent} 
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 700 }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.gray }}>
            <X size={24} />
          </button>
        </div>
        {children}
      </motion.div>
    </div>
  );
};

const StatusTag = ({ status }: { status: string }) => {
  const tags: any = {
    confirmado:           { label: "Confirmado",          bg: "#e8f5e9", color: "#1a6b3c" },
    indisponivel:         { label: "Indisponível",         bg: "#fce8e8", color: "#c0392b" },
    pendente:             { label: "Pendente",             bg: "#f5f5f7", color: "#6e6e73" },
    aguardando_validacao: { label: "Aguard. Validação",    bg: "#fff8e1", color: "#f39c12" },
    serviu:               { label: "Serviu",               bg: "#e8f5e9", color: "#1a6b3c" },
    furou:                { label: "Furou",                bg: "#fce8e8", color: "#c0392b" },
  };
  const config = tags[status] || tags.pendente;
  const { bg, color, label } = config;
  return (
    <span style={{ ...styles.statusTag, backgroundColor: bg, color }}>{label}</span>
  );
};

// --- Main App ---

export default function App() {
  const { toast, mostrarToast } = useToast();
  const [emailLogin, setEmailLogin] = React.useState("");
  const [senhaLogin, setSenhaLogin] = React.useState("");
  const [erroLogin, setErroLogin] = React.useState("");
  const [loginCarregando, setLoginCarregando] = React.useState(false);
  const [carregando, setCarregando] = React.useState(true);
  const [tela, setTela] = React.useState("landing");
  const [usuarioLogado, setUsuarioLogado] = React.useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [scales, setScales] = useState<Scale[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeTab, setActiveTab] = useState<'calendar' | 'scales' | 'members' | 'notifs' | 'messages' | 'profile'>('scales');
  const [processando, setProcessando] = useState(false);

  // --- Utility Functions for Notifications ---
  const buscarLideresEAdmins = async () => {
    try {
      const users = await DB.getUsers();
      return users
        .filter((u: any) => u.papel === "leader" || u.papel === "admin")
        .map((u: any) => u.id);
    } catch {
      return [];
    }
  };

  const criarNotificacoes = async (userIds: string[], mensagem: string) => {
    try {
      if (!userIds || userIds.length === 0) return;

      const existentes = await DB.getNotifs();

      const novas = userIds.map((uid, i) => ({
        id: `notif-${Date.now()}-${i}-${uid}`,
        userId: uid,
        mensagem,
        data: new Date().toISOString(),
        lida: false,
      }));

      const atualizadas = [...existentes, ...novas];
      await DB.setNotifs(atualizadas);
      
      // Update local state if the current user is among the recipients
      if (usuarioLogado && userIds.includes(usuarioLogado.id)) {
        const minhasNovas = novas.filter(n => n.userId === usuarioLogado.id);
        setNotifications(prev => [...prev, ...minhasNovas]);
      }
      
      return novas;
    } catch (err) {
      console.error("Erro ao criar notificações:", err);
    }
  };

  const carregarNotificacoes = async () => {
    if (!usuarioLogado) return;
    try {
      const todas = await DB.getNotifs();
      const minhas = todas.filter((n: any) => n.userId === usuarioLogado.id);
      setNotifications(minhas);
    } catch (err) {
      console.error("Erro ao carregar notificações:", err);
      setNotifications([]);
    }
  };

  const [regNome, setRegNome] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regSenha, setRegSenha] = useState('');
  const [regNasc, setRegNasc] = useState('');
  const [regAreas, setRegAreas] = useState<string[]>([]);
  const [erroCadastro, setErroCadastro] = useState<string | null>(null);
  
  // Candidacy Form States
  const [applyNome, setApplyNome] = useState('');
  const [applyTelefone, setApplyTelefone] = useState('');
  const [applyMensagem, setApplyMensagem] = useState('');
  const [mostrarPopupCandidatura, setMostrarPopupCandidatura] = useState(false);
  const [candidaturas, setCandidaturas] = useState<any[]>([]);
  const [selectedCandidacy, setSelectedCandidacy] = useState<any>(null);
  const [isCandidacyModalOpen, setIsCandidacyModalOpen] = useState(false);
  
  // Modal States
  const [isApplyModalOpen, setIsApplyModalOpen] = useState(false);
  const [isCandidacySuccessOpen, setIsCandidacySuccessOpen] = useState(false);
  const [isScaleModalOpen, setIsScaleModalOpen] = useState(false);
  const [isRankingModalOpen, setIsRankingModalOpen] = useState(false);
  const [isNewChatModalOpen, setIsNewChatModalOpen] = useState(false);
  const [editingScale, setEditingScale] = useState<Scale | null>(null);
  const [membroParaExcluir, setMembroParaExcluir] = React.useState<any>(null);
  const [membroEditandoAreas, setMembroEditandoAreas] = React.useState<any>(null);

  const AREAS_DISPONIVEIS = [
    "Filmagem — Ministério Geral",
    "Equipe Íris",
    "Corte",
    "Novos Membros",
  ];

  const verificarEscalasParaValidacao = async () => {
    try {
      const escalas = await DB.getSchedules();
      const agora = new Date();
      let houveAlteracao = false;

      const escalasAtualizadas = escalas.map((escala: any) => {
        const dataHoraEscala = new Date(`${escala.data}T${escala.horario}`);
        const umMinutoDepois = new Date(dataHoraEscala.getTime() + 60 * 1000);

        if (agora < umMinutoDepois) return escala; // Ainda não passou 1 minuto

        const novasConfirmacoes = { ...escala.confirmacoes };
        let alterou = false;

        // Verificar cada voluntário escalado
        Object.values(escala.posicoes || {}).forEach((userId: any) => {
          if (!userId) return;
          const statusAtual = novasConfirmacoes[userId];
          // Só muda para aguardando_validacao se ainda for pendente ou confirmado
          if (statusAtual === "pendente" || statusAtual === "confirmado" || !statusAtual) {
            novasConfirmacoes[userId] = "aguardando_validacao";
            alterou = true;
          }
        });

        if (alterou) houveAlteracao = true;
        return alterou ? { ...escala, confirmacoes: novasConfirmacoes } : escala;
      });

      if (houveAlteracao) {
        await DB.setSchedules(escalasAtualizadas);
        setScales(escalasAtualizadas);
      }
    } catch (err) {
      console.error("Erro ao verificar escalas:", err);
    }
  };

  const definirPresenca = async (escalaId: string, userId: string, status: string) => {
    try {
      const escalas = await DB.getSchedules();
      const atualizadas = escalas.map((e: any) => {
        if (e.id !== escalaId) return e;
        return {
          ...e,
          confirmacoes: { ...e.confirmacoes, [userId]: status }
        };
      });
      await DB.setSchedules(atualizadas);
      setScales(atualizadas);

      // Notificar o voluntário
      const msg = status === "serviu"
        ? `Sua presença na escala foi confirmada como ✅ Serviu.`
        : `Sua presença na escala foi marcada como ❌ Furou.`;
      await criarNotificacoes([userId], msg);

    } catch (err) {
      console.error("Erro ao definir presença:", err);
    }
  };

  const excluirMembro = async (userId: string) => {
    try {
      // Remover usuário
      await DB.removeItem(DB.KEYS.USERS, userId);

      // Remover das escalas onde estava alocado
      const escalas = await DB.getSchedules();
      const escalasAtualizadas = escalas.map((e: any) => {
        const novasPosicoes = { ...e.posicoes };
        Object.keys(novasPosicoes).forEach(pos => {
          if (novasPosicoes[pos] === userId) novasPosicoes[pos] = null;
        });
        const novasConfirmacoes = { ...e.confirmacoes };
        delete novasConfirmacoes[userId];
        return { ...e, posicoes: novasPosicoes, confirmacoes: novasConfirmacoes };
      });
      await DB.setSchedules(escalasAtualizadas);

      // Remover notificações e mensagens do usuário
      const notifs = await DB.getNotifs();
      await DB.setNotifs(notifs.filter((n: any) => n.userId !== userId));

      const messages = await DB.getMessages();
      await DB.setMessages(messages.filter((m: any) =>
        m.remetenteId !== userId && m.destinatarioId !== userId
      ));

      // Atualizar estado local
      setUsers(prev => prev.filter(u => u.id !== userId));
      setScales(escalasAtualizadas);
      setMembroParaExcluir(null);

    } catch (err) {
      console.error("Erro ao excluir membro:", err);
    }
  };

  const toggleAreaMembro = async (userId: string, area: string) => {
    try {
      const users = await DB.getUsers();
      const usuario = users.find((u: any) => u.id === userId);
      if (!usuario) return;

      const areasAtuais = usuario.areas || [];
      const novasAreas = areasAtuais.includes(area)
        ? areasAtuais.filter((a: any) => a !== area)
        : [...areasAtuais, area];

      await DB.updateItem(DB.KEYS.USERS, userId, { areas: novasAreas });

      setUsers(prev => prev.map(u =>
        u.id === userId ? { ...u, areas: novasAreas } : u
      ));
      setMembroEditandoAreas((prev: any) =>
        prev?.id === userId ? { ...prev, areas: novasAreas } : prev
      );
    } catch (err) {
      console.error("Erro ao editar áreas:", err);
    }
  };

  const AREAS = ["Filmagem — Ministério Geral", "Equipe Íris", "Corte", "Novos Membros"];

  const carregarUsuarios   = useDBState(DB.getUsers.bind(DB),   setUsers,   "users");
  const carregarEscalas    = useDBState(DB.getSchedules.bind(DB), setScales, "schedules");
  const carregarNotifs     = useDBState(DB.getNotifs.bind(DB),  setNotifications,    "notifs");
  const carregarPosts      = useDBState(DB.getPosts.bind(DB),   setPosts,     "posts");
  const carregarMensagens  = useDBState(DB.getMessages.bind(DB), setMessages, "messages");
  const carregarCandidaturas = useDBState(DB.getCandidaturas.bind(DB), setCandidaturas, "candidaturas");

  // Ranking
  const calcularEstatisticas = (userId: string, escalas: Scale[]) => {
    let serviu = 0, furou = 0, pendente = 0, aguardando = 0;

    escalas.forEach(escala => {
      const ehVoluntario = Object.values(escala.posicoes || {}).includes(userId);
      if (!ehVoluntario) return;

      const status = escala.confirmacoes?.[userId];
      if (status === "serviu")               serviu++;
      else if (status === "furou")           furou++;
      else if (status === "aguardando_validacao") aguardando++;
      else                                   pendente++;
    });

    return { serviu, furou, pendente, aguardando };
  };

  const ranking = useMemo(() => {
    return users
      .filter(u => u.aprovado)
      .map(u => {
        const stats = calcularEstatisticas(u.id, scales);
        return {
          id: u.id,
          nome: u.nome,
          serviu: stats.serviu,
          furou: stats.furou,
          pendente: stats.pendente,
          aguardando: stats.aguardando
        };
      })
      .sort((a, b) => {
        if (b.serviu !== a.serviu) return b.serviu - a.serviu;
        if (a.furou !== b.furou) return a.furou - b.furou;
        if (a.pendente !== b.pendente) return a.pendente - b.pendente;
        return a.nome.localeCompare(b.nome);
      });
  }, [users, scales]);

  useEffect(() => {
    const inicializar = async () => {
      setCarregando(true);
      try {
        // SEMPRE primeiro — seed admin nunca pode falhar
        await garantirSeedAdmin();

        // Tentar restaurar sessão existente
        let sessaoRestaurada = false;
        try {
          const sessao = await DB.getSession();
          if (sessao?.userId) {
            const users = await DB.getUsers();
            const usuario = users.find((u: any) => u.id === sessao.userId);

            if (usuario) {
              const dias = (new Date().getTime() - new Date(sessao.timestamp).getTime()) / 86400000;
              if (dias <= 30) {
                setUsuarioLogado(usuario);
                if (usuario.papel === "pending" || !usuario.aprovado) {
                  setTela("espera");
                } else if (usuario.papel === "admin" || usuario.papel === "leader") {
                  setTela("dashboardAdmin");
                } else {
                  setTela("dashboardVoluntario");
                }
                sessaoRestaurada = true;

                // Sincronização ao Reabrir o App
                const [usersData, schedulesData, notifsData, postsData, messagesData] = await Promise.all([
                  DB.getUsers(),
                  DB.getSchedules(),
                  DB.getNotifs(),
                  DB.getPosts(),
                  DB.getMessages(),
                ]);

                setUsers(usersData);
                setScales(schedulesData);
                setNotifications(notifsData.filter((n: any) => n.userId === usuario.id));
                setPosts(postsData);
                setMessages(messagesData);
                
                // Verificar escalas para validação na inicialização
                await verificarEscalasParaValidacao();
              } else {
                await DB.delete(DB.KEYS.SESSION);
              }
            }
          }
        } catch {
          sessaoRestaurada = false;
        }

        if (!sessaoRestaurada) {
          setTela("landing");
        }

        // Carregar outros dados no estado React (opcional, mas bom para manter sincronia)
        await Promise.all([
          carregarUsuarios(),
          carregarEscalas(),
          carregarNotifs(),
          carregarPosts(),
          carregarMensagens(),
          carregarCandidaturas(),
        ]);

      } catch (err) {
        console.error("❌ Erro na inicialização:", err);
        setTela("landing");
      } finally {
        setCarregando(false);
      }
    };

    inicializar();

    // Adicionar animação do spinner
    const style = document.createElement("style");
    style.innerHTML = `
      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
  }, []);

  useEffect(() => {
    if (activeTab === "notifs") carregarNotificacoes();
    verificarEscalasParaValidacao();
  }, [activeTab]);

  const fazerLogin = async () => {
    if (loginCarregando) return;
    setLoginCarregando(true);
    setErroLogin("");

    try {
      // Passo 1 — garantir seed antes de qualquer coisa
      const users = await garantirSeedAdmin();

      // Passo 2 — normalizar inputs
      const emailDigitado = (emailLogin || "").trim().toLowerCase();
      const senhaDigitada = (senhaLogin || "").trim();

      console.log("🔑 Tentativa de login:", emailDigitado);
      console.log("👥 Usuários disponíveis:", users.map((u: any) => ({ email: u.email, senha: u.senha, papel: u.papel })));

      if (!emailDigitado || !senhaDigitada) {
        setErroLogin("Preencha e-mail e senha.");
        return;
      }

      // Passo 3 — buscar usuário com comparação segura
      const usuario = users.find((u: any) => {
        const emailSalvo = (u.email || "").trim().toLowerCase();
        const senhaSalva = (u.senha || "").trim();
        return emailSalvo === emailDigitado && senhaSalva === senhaDigitada;
      });

      console.log("👤 Usuário encontrado:", usuario);

      if (!usuario) {
        setErroLogin("E-mail ou senha inválidos.");
        return;
      }

      // Passo 4 — salvar sessão
      await DB.setSession({
        userId: usuario.id,
        email: usuario.email,
        papel: usuario.papel,
        timestamp: new Date().toISOString(),
      });

      // Passo 5 — redirecionar conforme papel
      setUsuarioLogado(usuario);

      if (usuario.papel === "pending" || !usuario.aprovado) {
        setTela("espera");
        return;
      }

      if (usuario.papel === "admin" || usuario.papel === "leader") {
        setTela("dashboardAdmin");
        mostrarToast(`Bem-vindo, ${usuario.nome}!`, "sucesso");
        return;
      }

      if (!usuario.boasVindasExibido) {
        setTela("boasVindas");
      } else {
        setTela("dashboardVoluntario");
        mostrarToast(`Bem-vindo de volta, ${usuario.nome}!`, "sucesso");
      }

    } catch (err) {
      console.error("❌ Erro no login:", err);
      setErroLogin("Erro inesperado. Tente novamente.");
    } finally {
      setLoginCarregando(false);
    }
  };

  const handleRegister = async () => {
    try {
      const emailNormalizado = regEmail.trim().toLowerCase();
      const senhaNormalizada = regSenha.trim();

      // 1. Verificar se email é autorizado
      if (!EMAILS_AUTORIZADOS.includes(emailNormalizado)) {
        setErroCadastro("Este e-mail não está autorizado. Entre em contato com a liderança.");
        return;
      }

      // 2. Verificar se a senha bate com a senha padrão
      const senhaPadrao = SENHAS_PADRAO[emailNormalizado];
      if (senhaNormalizada !== senhaPadrao) {
        setErroCadastro(
          `Senha incorreta. Use a senha padrão fornecida pela liderança para o primeiro acesso.`
        );
        return;
      }

      // 3. Verificar se email já está cadastrado
      const users = await DB.getUsers();
      const jaExiste = users.some(u => u.email.trim().toLowerCase() === emailNormalizado);
      if (jaExiste) {
        setErroCadastro("Este e-mail já possui uma conta cadastrada.");
        return;
      }

      // 4. Criar usuário
      const novoUsuario: User = {
        id: `user-${Date.now()}`,
        nome: regNome.trim(),
        email: emailNormalizado,
        senha: senhaNormalizada,
        dataNascimento: regNasc,
        areas: regAreas,
        papel: "pending",
        aprovado: false,
        fotoPerfil: undefined,
        dataEntrada: new Date().toISOString(),
        boasVindasExibido: false,
      };

      await DB.addItem(DB.KEYS.USERS, novoUsuario);
      setUsers(prev => [...prev, novoUsuario]);

      // 5. Notificar líderes e admins
      const ids = await buscarLideresEAdmins();
      await criarNotificacoes(
        ids,
        `Novo membro aguardando aprovação: ${novoUsuario.nome}`
      );

      setTela("espera");
      setUsuarioLogado(novoUsuario);

    } catch (err) {
      console.error("Erro no cadastro:", err);
      setErroCadastro("Erro ao criar conta. Tente novamente.");
    }
  };

  const handleApply = async () => {
    try {
      if (!applyNome || !applyTelefone || !applyMensagem) {
        alert('Preencha todos os campos da candidatura.');
        return;
      }

      const novaCandidatura = {
        id: `cand-${Date.now()}`,
        nome: applyNome.trim(),
        telefone: applyTelefone.trim(),
        mensagem: applyMensagem.trim(),
        data: new Date().toISOString(),
      };

      await DB.addItem(DB.KEYS.CANDIDATURAS, novaCandidatura);
      setCandidaturas(prev => [...prev, novaCandidatura]);

      // Notificar todos os líderes e admins
      const ids = await buscarLideresEAdmins();
      await criarNotificacoes(
        ids,
        `Nova candidatura recebida de: ${novaCandidatura.nome} — Tel: ${novaCandidatura.telefone}`
      );

      // Exibir pop-up de sucesso
      setMostrarPopupCandidatura(true);
      setIsApplyModalOpen(false);
      setApplyNome('');
      setApplyTelefone('');
      setApplyMensagem('');
      setTimeout(() => setMostrarPopupCandidatura(false), 4000);

    } catch (err) {
      console.error("Erro ao enviar candidatura:", err);
    }
  };

  const handleBoasVindasContinuar = async () => {
    if (!usuarioLogado) return;
    try {
      await DB.updateItem(DB.KEYS.USERS, usuarioLogado.id, { boasVindasExibido: true });
      setUsuarioLogado({ ...usuarioLogado, boasVindasExibido: true });
      setTela("dashboardVoluntario");
      mostrarToast("Bem-vindo à equipe!", "sucesso");
    } catch (err) {
      console.error("Erro ao atualizar boas-vindas:", err);
      setTela("dashboardVoluntario");
    }
  };

  const handleLogout = async () => {
    try {
      await DB.delete(DB.KEYS.SESSION);
      setUsuarioLogado(null);
      setTela("landing");
      setActiveTab("scales");
      mostrarToast("Sessão encerrada.", "info");
    } catch (err) {
      console.error("Erro ao fazer logout:", err);
    }
  };

  const handleApproveUser = async (userId: string, approve: boolean) => {
    if (!approve) {
      await DB.removeItem(DB.KEYS.USERS, userId);
      setUsers(prev => prev.filter(u => u.id !== userId));
    } else {
      const changes = { aprovado: true, papel: 'volunteer' as Role };
      await DB.updateItem(DB.KEYS.USERS, userId, changes);
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, ...changes } : u));
      
      await criarNotificacoes([userId], "Seu cadastro foi aprovado! Bem-vindo ao ministério.");
      
      if (usuarioLogado?.id === userId) {
        setUsuarioLogado({ ...usuarioLogado, ...changes });
        await DB.setSession({
          userId: usuarioLogado.id,
          email: usuarioLogado.email,
          papel: 'volunteer',
          timestamp: new Date().toISOString(),
        });
      }
    }
  };

  const handlePromoteUser = async (userId: string) => {
    const u = users.find(u => u.id === userId);
    if (!u) return;

    const newPapel: Role = u.papel === 'volunteer' ? 'leader' : 'volunteer';
    await DB.updateItem(DB.KEYS.USERS, userId, { papel: newPapel });
    
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, papel: newPapel } : u));
    
    if (usuarioLogado?.id === userId) {
      setUsuarioLogado({ ...usuarioLogado, papel: newPapel });
      await DB.setSession({
        userId: usuarioLogado.id,
        email: usuarioLogado.email,
        papel: newPapel,
        timestamp: new Date().toISOString(),
      });
    }
  };

  const handleMarkNotifRead = async (notifId: string) => {
    try {
      await DB.updateItem(DB.KEYS.NOTIFS, notifId, { lida: true });
      setNotifications(prev => prev.map(n =>
        n.id === notifId ? { ...n, lida: true } : n
      ));
    } catch (err) {
      console.error("Erro ao marcar notificação como lida:", err);
    }
  };

  const handleNavigateToMembers = () => {
    setActiveTab('members');
  };

  const handleViewCandidacy = (mensagem: string) => {
    // Extract telephone from message: "Nova candidatura recebida de: [nome] — Tel: [telefone]"
    const parts = mensagem.split(' — Tel: ');
    if (parts.length < 2) return;
    const tel = parts[1].trim();
    const cand = candidaturas.find(c => c.telefone === tel);
    if (cand) {
      setSelectedCandidacy(cand);
      setIsCandidacyModalOpen(true);
    }
  };

  const handleSaveScale = async (scaleData: any) => {
    const isAdminOrLeader = usuarioLogado?.papel === 'admin' || usuarioLogado?.papel === 'leader';
    if (!isAdminOrLeader) return;
    
    if (editingScale) {
      await DB.updateItem(DB.KEYS.SCHEDULES, editingScale.id, scaleData);
      setScales(prev => prev.map(s => s.id === editingScale.id ? { ...s, ...scaleData } : s));
    } else {
      const newScale: Scale = {
        id: Math.random().toString(36).substr(2, 9),
        ...scaleData,
        confirmacoes: {},
        criadoPor: usuarioLogado?.id || ''
      };
      
      await DB.addItem(DB.KEYS.SCHEDULES, newScale);
      setScales(prev => [newScale, ...prev]);
      
      // Notify designated volunteers
      const pos = scaleData.posicoes;
      const designated = [pos.corte, pos.camera1, pos.camera2, pos.camera3].filter(id => id);
      for (const vid of designated) {
        const posName = Object.keys(pos).find(key => pos[key] === vid);
        const formattedPos = posName === 'corte' ? 'Corte' : posName?.replace('camera', 'Câmera ');
        await criarNotificacoes([vid], `Você foi escalado: ${scaleData.titulo} — ${scaleData.data} às ${scaleData.horario} | Posição: ${formattedPos}`);
      }
    }
    setIsScaleModalOpen(false);
    setEditingScale(null);
  };

  const handleDeleteScale = async (id: string) => {
    const isAdminOrLeader = usuarioLogado?.papel === 'admin' || usuarioLogado?.papel === 'leader';
    if (!isAdminOrLeader) return;
    
    if (confirm('Deseja excluir esta escala?')) {
      await DB.removeItem(DB.KEYS.SCHEDULES, id);
      setScales(prev => prev.filter(s => s.id !== id));
    }
  };

  const handleConfirmPresence = async (scaleId: string, status: 'confirmado' | 'recusado') => {
    const changes = { confirmacoes: { ...scales.find(s => s.id === scaleId)?.confirmacoes, [usuarioLogado!.id]: status } };
    await DB.updateItem(DB.KEYS.SCHEDULES, scaleId, changes);
    setScales(prev => prev.map(s => s.id === scaleId ? { ...s, ...changes } : s));
  };

  const handlePost = async (conteudo: string) => {
    const newPost: Post = {
      id: Math.random().toString(36).substr(2, 9),
      autorId: usuarioLogado!.id,
      autorNome: usuarioLogado!.nome,
      autorFoto: usuarioLogado!.fotoPerfil,
      conteudo,
      data: new Date().toISOString(),
      lida: [usuarioLogado!.id],
      likes: []
    };
    
    await DB.addItem(DB.KEYS.POSTS, newPost);
    setPosts(prev => [newPost, ...prev]);
    
    // Notify all approved members
    const approvedUsers = users.filter(u => u.aprovado);
    const idsToNotify = approvedUsers.filter(u => u.id !== usuarioLogado!.id).map(u => u.id);
    if (idsToNotify.length > 0) {
      await criarNotificacoes(idsToNotify, `Novo aviso de ${usuarioLogado!.nome}: ${conteudo.substring(0, 50)}...`);
    }
  };

  const handleToggleLike = async (postId: string) => {
    if (!usuarioLogado) return;
    const post = posts.find(p => p.id === postId);
    if (!post) return;

    const likes = post.likes || [];
    const newLikes = likes.includes(usuarioLogado.id) 
      ? likes.filter(id => id !== usuarioLogado.id) 
      : [...likes, usuarioLogado.id];
    
    await DB.updateItem(DB.KEYS.POSTS, postId, { likes: newLikes });
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, likes: newLikes } : p));
  };

  const handleDeletePost = async (id: string) => {
    if (confirm('Deseja excluir este post?')) {
      await DB.removeItem(DB.KEYS.POSTS, id);
      setPosts(prev => prev.filter(p => p.id !== id));
    }
  };

  const markPostAsRead = async (id: string) => {
    const post = posts.find(p => p.id === id);
    if (post && !post.lida.includes(usuarioLogado!.id)) {
      const newLida = [...post.lida, usuarioLogado!.id];
      await DB.updateItem(DB.KEYS.POSTS, id, { lida: newLida });
      setPosts(prev => prev.map(p => p.id === id ? { ...p, lida: newLida } : p));
    }
  };

  const handleSendMessage = async (destinatarioId: string, conteudo: string, isSystem = false, senderIdOverride?: string) => {
    const newMessage: Message = {
      id: Math.random().toString(36).substr(2, 9),
      remetenteId: senderIdOverride || usuarioLogado!.id,
      destinatarioId,
      conteudo,
      data: new Date().toISOString(),
      lida: false,
      isSystem
    };
    
    await DB.addItem(DB.KEYS.MESSAGES, newMessage);
    setMessages(prev => [...prev, newMessage]);
  };

  const handleReactToMessage = async (messageId: string, emoji: string) => {
    const msg = messages.find(m => m.id === messageId);
    if (!msg) return;

    const reacoes = { ...(msg.reacoes || {}), [usuarioLogado!.id]: emoji };
    await DB.updateItem(DB.KEYS.MESSAGES, messageId, { reacoes });
    setMessages(prev => prev.map(m => m.id === messageId ? { ...m, reacoes } : m));
  };

  const markMessagesAsRead = async (otherUserId: string) => {
    const unreadIds = messages
      .filter(m => m.remetenteId === otherUserId && m.destinatarioId === usuarioLogado!.id && !m.lida)
      .map(m => m.id);
    
    if (unreadIds.length === 0) return;

    const allMessages = await DB.getMessages();
    const updated = allMessages.map((m: any) => 
      unreadIds.includes(m.id) ? { ...m, lida: true } : m
    );
    await DB.setMessages(updated);
    
    setMessages(prev => prev.map(m => unreadIds.includes(m.id) ? { ...m, lida: true } : m));
  };

  const checkAutoFails = async (currentScales: Scale[]) => {
    if (!usuarioLogado) return;
    const now = new Date();
    let changed = false;
    const updatedScales = [...currentScales];
    
    for (let i = 0; i < updatedScales.length; i++) {
      const s = updatedScales[i];
      const [year, month, day] = s.data.split('-').map(Number);
      const [hour, minute] = s.horario.split(':').map(Number);
      const scaleDateTime = new Date(year, month - 1, day, hour, minute);
      
      const diffInMs = scaleDateTime.getTime() - now.getTime();
      const diffInHours = diffInMs / (1000 * 60 * 60);

      // Se falta menos de 24h e ainda está pendente
      let scaleChanged = false;
      const newConfirmacoes = { ...s.confirmacoes };
      
      const posicoesValues = Object.values(s.posicoes);
      for (const userId of posicoesValues) {
        if (userId && !newConfirmacoes[userId] && diffInHours < 24 && diffInHours > -1) {
          newConfirmacoes[userId] = 'furou';
          scaleChanged = true;
          changed = true;
          await criarNotificacoes([userId], `Sua presença na escala "${s.titulo}" foi marcada como falta por ausência de confirmação.`);
          
          // Send system message in chat
          const leader = users.find(u => u.papel === 'leader' || u.papel === 'admin');
          if (leader) {
            handleSendMessage(leader.id, "Solicitação de revisão de status enviada", true, userId);
          }
        }
      }
      
      if (scaleChanged) {
        updatedScales[i] = { ...s, confirmacoes: newConfirmacoes };
      }
    }

    if (changed) {
      await DB.setSchedules(updatedScales);
      setScales(updatedScales);
    }
  };

  useEffect(() => {
    if (tela === 'dashboardAdmin' || tela === 'dashboardVoluntario') {
      checkAutoFails(scales);
    }
  }, [tela, activeTab]);

  // --- Render Helpers ---

  if (carregando) {
    return (
      <div style={{ ...styles.container, justifyContent: 'center' }}>
        <motion.div 
          animate={{ rotate: 360 }} 
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
          style={{ 
            width: '40px', 
            height: '40px', 
            borderTop: `4px solid ${COLORS.black}`,
            borderBottom: `4px solid ${COLORS.border}`,
            borderLeft: `4px solid ${COLORS.border}`,
            borderRight: `4px solid ${COLORS.border}`,
            borderRadius: '50%' 
          }}
        />
      </div>
    );
  }

  const renderLanding = () => (
    <div style={{ ...styles.appWrapper, padding: '40px 20px', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', margin: '60px 0' }}>
        <LogoFilmka size="large" />
      </div>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <Button onClick={() => setTela('login')}>Entrar</Button>
        <Button variant="secondary" onClick={() => setTela('register')}>Criar conta</Button>
      </div>

      <div 
        style={{ ...styles.card, marginTop: 'auto', cursor: 'pointer', textAlign: 'center' }}
        onClick={() => setIsApplyModalOpen(true)}
      >
        <p style={{ fontSize: '14px', fontWeight: 600 }}>Não é membro? Se candidate hoje</p>
      </div>

      <Modal isOpen={isApplyModalOpen} onClose={() => setIsApplyModalOpen(false)} title="Candidatura">
        <p style={{ color: COLORS.gray, fontSize: '14px', marginBottom: '20px' }}>Deixe seu interesse em participar do nosso ministério.</p>
        <Input label="Nome completo" placeholder="Seu nome" value={applyNome} onChange={setApplyNome} />
        <div style={{ marginBottom: '20px' }}>
          <label style={styles.label}>Número de telefone</label>
          <input
            type="tel"
            placeholder="Número de telefone (ex: 11 99999-9999)"
            value={applyTelefone}
            onChange={e => setApplyTelefone(e.target.value)}
            style={{
              width: "100%",
              padding: "12px 14px",
              borderRadius: "10px",
              border: "1px solid #e5e5ea",
              fontSize: "15px",
              fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif",
              outline: "none",
              boxSizing: "border-box",
              backgroundColor: COLORS.lightGray,
            }}
          />
        </div>
        <div style={{ marginBottom: '20px' }}>
          <label style={styles.label}>Mensagem</label>
          <textarea 
            style={{ ...styles.input, height: '100px', resize: 'none' }} 
            placeholder="Por que você quer participar?" 
            value={applyMensagem}
            onChange={(e) => setApplyMensagem(e.target.value)}
          />
        </div>
        <Button onClick={handleApply} style={{ width: '100%' }}>Enviar Interesse</Button>
      </Modal>

      <CandidacySuccessModal isOpen={mostrarPopupCandidatura} onClose={() => setMostrarPopupCandidatura(false)} />
    </div>
  );

  const renderLogin = () => (
    <div style={{ ...styles.appWrapper, padding: '40px 20px' }}>
      <button onClick={() => setTela('landing')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', color: COLORS.gray, marginBottom: '40px' }}>
        <ChevronLeft size={20} /> Voltar
      </button>
      <div style={{ marginBottom: '20px' }}>
        <LogoFilmka size="large" />
      </div>
      <h2 style={{ fontSize: '28px', fontWeight: 700, marginBottom: '30px' }}>Entrar</h2>
      
      <div style={{ marginBottom: '16px' }}>
        <label style={styles.label}>E-mail</label>
        <input
          type="email"
          value={emailLogin}
          onChange={e => setEmailLogin(e.target.value)}
          onKeyDown={e => e.key === "Enter" && fazerLogin()}
          placeholder="E-mail"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          style={styles.input}
        />
      </div>

      <div style={{ marginBottom: '16px' }}>
        <label style={styles.label}>Senha</label>
        <input
          type="password"
          value={senhaLogin}
          onChange={e => setSenhaLogin(e.target.value)}
          onKeyDown={e => e.key === "Enter" && fazerLogin()}
          placeholder="Senha"
          style={styles.input}
        />
      </div>

      {erroLogin ? (
        <p style={{ color: "#ff3b30", fontSize: "13px", textAlign: "center", marginTop: '10px' }}>
          {erroLogin}
        </p>
      ) : null}

      <button 
        onClick={fazerLogin} 
        disabled={loginCarregando}
        style={{ 
          ...styles.button,
          width: '100%', 
          marginTop: '20px',
          opacity: loginCarregando ? 0.6 : 1,
          cursor: loginCarregando ? "not-allowed" : "pointer",
          backgroundColor: COLORS.black,
          color: COLORS.white,
        }}
      >
        {loginCarregando ? "Entrando..." : "Entrar"}
      </button>
    </div>
  );

  const renderRegister = () => (
    <div style={{ ...styles.appWrapper, padding: '40px 20px' }}>
      <button onClick={() => setTela('landing')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', color: COLORS.gray, marginBottom: '40px' }}>
        <ChevronLeft size={20} /> Voltar
      </button>
      <div style={{ marginBottom: '20px' }}>
        <LogoFilmka size="large" />
      </div>
      <h2 style={{ fontSize: '28px', fontWeight: 700, marginBottom: '30px' }}>Criar conta</h2>
      <Input label="Nome completo" value={regNome} onChange={setRegNome} placeholder="Seu nome" />
      <Input label="Data de nascimento" type="date" value={regNasc} onChange={setRegNasc} />
      <Input label="Email" value={regEmail} onChange={setRegEmail} placeholder="seu@email.com" />
      <Input label="Senha" type="password" value={regSenha} onChange={setRegSenha} placeholder="Mínimo 6 caracteres" />
      <p style={{
        fontSize: "12px",
        color: "#6e6e73",
        margin: "4px 0 0 4px",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif",
      }}>
        Use a senha padrão fornecida pela liderança para o primeiro acesso.
      </p>
      {erroCadastro && <p style={{ color: COLORS.red, fontSize: '14px', marginTop: '10px', marginBottom: '10px' }}>{erroCadastro}</p>}
      
      <div style={{ marginBottom: '20px' }}>
        <label style={styles.label}>Áreas de atuação (Selecione uma ou mais)</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {AREAS.map(area => (
            <div 
              key={area} 
              onClick={() => {
                if (regAreas.includes(area)) setRegAreas(regAreas.filter(a => a !== area));
                else setRegAreas([...regAreas, area]);
              }}
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '12px', 
                cursor: 'pointer',
                padding: '12px',
                borderRadius: '12px',
                backgroundColor: regAreas.includes(area) ? '#e8f5e9' : COLORS.lightGray,
                border: `1px solid ${regAreas.includes(area) ? COLORS.green : 'transparent'}`,
                transition: 'all 0.2s ease'
              }}
            >
              <div style={{ 
                width: '20px', 
                height: '20px', 
                borderRadius: '50%', 
                border: `2px solid ${regAreas.includes(area) ? COLORS.green : COLORS.border}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: regAreas.includes(area) ? COLORS.green : 'transparent'
              }}>
                {regAreas.includes(area) && <Check size={12} color="white" strokeWidth={4} />}
              </div>
              <span style={{ fontSize: '15px', fontWeight: 500 }}>{area}</span>
            </div>
          ))}
        </div>
      </div>

      <Button onClick={handleRegister} style={{ width: '100%', marginTop: '20px' }}>Finalizar Cadastro</Button>
    </div>
  );

  const renderWaiting = () => (
    <div style={{ ...styles.appWrapper, padding: '40px 20px', justifyContent: 'center', textAlign: 'center' }}>
      <div style={{ marginBottom: '20px' }}>
        <LogoFilmka size="small" />
      </div>
      <div style={{ marginBottom: '30px' }}>
        <Clock size={60} color={COLORS.gray} style={{ margin: '0 auto' }} />
      </div>
      <h2 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '16px' }}>Perfil em análise</h2>
      <p style={{ color: COLORS.gray, lineHeight: '1.5', marginBottom: '40px' }}>
        Olá, {usuarioLogado?.nome}! Seu cadastro foi recebido. Um líder ou administrador irá revisar e aprovar seu acesso em breve.
      </p>
      <Button variant="secondary" onClick={handleLogout} style={{ width: '100%' }}>Sair</Button>
    </div>
  );

  const renderDashboard = () => {
    const isAdminOrLeader = usuarioLogado?.papel === 'admin' || usuarioLogado?.papel === 'leader';
    const unreadPostsCount = posts.filter(p => usuarioLogado && !p.lida.includes(usuarioLogado.id)).length;
    const unreadNotifsCount = notifications.filter(n => usuarioLogado && n.userId === usuarioLogado.id && !n.lida).length;
    const totalUnreadAvisos = unreadPostsCount + unreadNotifsCount;
    const unreadMessagesCount = messages.filter(m => m.destinatarioId === usuarioLogado?.id && !m.lida).length;
    
    return (
      <div style={{ ...styles.appWrapper, overflow: 'hidden' }}>
        <div style={{
          ...styles.topBar,
          position: 'fixed',
          top: 0,
          width: '100%',
          maxWidth: '480px',
          zIndex: 1000,
        }}>
          <div style={{ width: '80px' }}>
            <LogoFilmka size="small" />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {activeTab === 'scales' && isAdminOrLeader && (
              <button onClick={() => { setEditingScale(null); setIsScaleModalOpen(true); }} style={{ background: COLORS.black, color: 'white', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Plus size={20} />
              </button>
            )}
            {activeTab === 'messages' && (
              <button onClick={() => setIsNewChatModalOpen(true)} style={{ background: 'none', border: 'none', color: COLORS.black, cursor: 'pointer', padding: '4px' }}>
                <Plus size={24} />
              </button>
            )}
            <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: COLORS.lightGray, overflow: 'hidden' }}>
              {usuarioLogado?.fotoPerfil ? <img src={usuarioLogado.fotoPerfil} style={{ width: '100%', height: '100%', objectFit: 'cover' }} referrerPolicy="no-referrer" /> : <UserIcon size={20} style={{ margin: '6px' }} />}
            </div>
          </div>
        </div>

        <div style={{
          ...styles.content,
          paddingTop: '80px',
          paddingBottom: '100px',
          height: '100dvh',
          overflowY: 'auto',
          boxSizing: 'border-box',
          WebkitOverflowScrolling: 'touch',
        }}>
          {activeTab === 'calendar' && <CalendarTab scales={scales} usuarioLogado={usuarioLogado} users={users} ranking={ranking} onOpenRanking={() => setIsRankingModalOpen(true)} />}
          {activeTab === 'scales' && (
            <ScalesTab 
              scales={scales} 
              usuarioLogado={usuarioLogado!} 
              users={users}
              onConfirm={handleConfirmPresence} 
              onEdit={(s: Scale) => { setEditingScale(s); setIsScaleModalOpen(true); }} 
              onDelete={handleDeleteScale}
              definirPresenca={definirPresenca}
            />
          )}
          {activeTab === 'members' && (
            <MembersTab 
              users={users} 
              currentUser={usuarioLogado!} 
              onApprove={handleApproveUser} 
              onPromote={handlePromoteUser} 
              onDeleteMember={(u: any) => setMembroParaExcluir(u)}
              onEditAreas={(u: any) => setMembroEditandoAreas(u)}
            />
          )}
          {activeTab === 'notifs' && (
            <AvisosTab 
              posts={posts} 
              notifications={notifications}
              usuarioLogado={usuarioLogado!} 
              users={users}
              onPost={handlePost} 
              onDeletePost={handleDeletePost} 
              onMarkRead={markPostAsRead} 
              onMarkNotifRead={handleMarkNotifRead}
              onToggleLike={handleToggleLike}
              onNavigateToMembers={handleNavigateToMembers}
              onViewCandidacy={handleViewCandidacy}
            />
          )}
          {activeTab === 'messages' && (
            <MessagesTab 
              users={users} 
              messages={messages} 
              currentUser={usuarioLogado!} 
              onSendMessage={handleSendMessage} 
              onMarkRead={markMessagesAsRead} 
              onReact={handleReactToMessage}
              isNewChatModalOpen={isNewChatModalOpen}
              setIsNewChatModalOpen={setIsNewChatModalOpen}
            />
          )}
          {activeTab === 'profile' && (
            <ProfileTab 
              usuarioLogado={usuarioLogado!} 
              users={users} 
              setUsers={setUsers} 
              setUser={setUsuarioLogado} 
              onLogout={handleLogout} 
            />
          )}
        </div>

        <div style={{
          ...styles.bottomNav,
          position: 'fixed',
          bottom: 0,
          width: '100%',
          maxWidth: '480px',
          zIndex: 1000,
          paddingBottom: 'calc(10px + env(safe-area-inset-bottom))',
        }}>
          <div style={{ ...styles.navItem, ...(activeTab === 'calendar' ? styles.navItemActive : {}) }} onClick={() => setActiveTab('calendar')}>
            <CalendarIcon size={24} />
            <span style={styles.navLabel}>Calendário</span>
          </div>
          <div style={{ ...styles.navItem, ...(activeTab === 'scales' ? styles.navItemActive : {}) }} onClick={() => setActiveTab('scales')}>
            <ClipboardList size={24} />
            <span style={styles.navLabel}>Escalas</span>
          </div>
          {isAdminOrLeader && (
            <div style={{ ...styles.navItem, ...(activeTab === 'members' ? styles.navItemActive : {}) }} onClick={() => setActiveTab('members')}>
              <UserCheck size={24} />
              <span style={styles.navLabel}>Membros</span>
            </div>
          )}
          <div style={{ ...styles.navItem, ...(activeTab === 'notifs' ? styles.navItemActive : {}) }} onClick={() => setActiveTab('notifs')}>
            <Bell size={24} />
            <span style={styles.navLabel}>Avisos</span>
            {totalUnreadAvisos > 0 && <span style={styles.badge}>{totalUnreadAvisos}</span>}
          </div>
          {usuarioLogado?.papel !== 'pending' && (
            <div style={{ ...styles.navItem, ...(activeTab === 'messages' ? styles.navItemActive : {}) }} onClick={() => setActiveTab('messages')}>
              <div style={{ position: 'relative' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
                {unreadMessagesCount > 0 && <span style={styles.badge}>{unreadMessagesCount}</span>}
              </div>
              <span style={styles.navLabel}>Mensagens</span>
            </div>
          )}
          <div style={{ ...styles.navItem, ...(activeTab === 'profile' ? styles.navItemActive : {}) }} onClick={() => setActiveTab('profile')}>
            <UserIcon size={24} />
            <span style={styles.navLabel}>Perfil</span>
          </div>
        </div>

        <ScaleModal 
          isOpen={isScaleModalOpen} 
          onClose={() => { setIsScaleModalOpen(false); setEditingScale(null); }} 
          onSave={handleSaveScale}
          editingScale={editingScale}
          users={users.filter(u => u.aprovado)}
        />

        <RankingModal 
          isOpen={isRankingModalOpen} 
          onClose={() => setIsRankingModalOpen(false)} 
          ranking={ranking}
        />

        {/* Modal de confirmação de exclusão */}
        {membroParaExcluir && (
          <div style={{
            position: "fixed", inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 9999, padding: "20px",
          }}>
            <div style={{
              background: "white", borderRadius: "16px",
              padding: "24px", width: "100%", maxWidth: "320px",
              textAlign: "center",
            }}>
              <p style={{ fontSize: "17px", fontWeight: "600", color: "#1d1d1f", marginBottom: "8px" }}>
                Excluir membro?
              </p>
              <p style={{ fontSize: "14px", color: "#6e6e73", marginBottom: "24px" }}>
                "{membroParaExcluir?.nome}" será removido permanentemente do sistema.
              </p>
              <div style={{ display: "flex", gap: "12px" }}>
                <button onClick={() => setMembroParaExcluir(null)}
                  style={{ flex: 1, padding: "12px", borderRadius: "10px",
                    border: "1px solid #e5e5ea", background: "white",
                    fontSize: "15px", cursor: "pointer" }}>
                  Cancelar
                </button>
                <button onClick={() => excluirMembro(membroParaExcluir.id)}
                  style={{ flex: 1, padding: "12px", borderRadius: "10px",
                    border: "none", background: "#ff3b30", color: "white",
                    fontSize: "15px", fontWeight: "600", cursor: "pointer" }}>
                  Excluir
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal de edição de áreas */}
        {membroEditandoAreas && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 9999, padding: "20px" }}>
            <div style={{ background: "white", borderRadius: "16px",
              padding: "24px", width: "100%", maxWidth: "360px" }}>
              <p style={{ fontSize: "17px", fontWeight: "600", marginBottom: "16px" }}>
                Áreas de {membroEditandoAreas?.nome}
              </p>
              {AREAS_DISPONIVEIS.map(area => {
                const selecionada = (membroEditandoAreas?.areas || []).includes(area);
                return (
                  <div key={area}
                    onClick={() => toggleAreaMembro(membroEditandoAreas.id, area)}
                    style={{ display: "flex", alignItems: "center", gap: "12px",
                      padding: "12px 0", borderBottom: "1px solid #f0f0f0",
                      cursor: "pointer" }}>
                    <div style={{
                      width: "22px", height: "22px", borderRadius: "50%",
                      border: selecionada ? "none" : "1.5px solid #c7c7cc",
                      background: selecionada ? "#1a6b3c" : "transparent",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      flexShrink: 0,
                    }}>
                      {selecionada && (
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.8"
                            strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </div>
                    <span style={{ fontSize: "15px", color: "#1d1d1f" }}>{area}</span>
                  </div>
                );
              })}
              <button
                onClick={() => setMembroEditandoAreas(null)}
                style={{ width: "100%", marginTop: "20px", padding: "13px",
                  borderRadius: "12px", border: "none", background: "#1d1d1f",
                  color: "white", fontSize: "15px", fontWeight: "600", cursor: "pointer" }}>
                Concluído
              </button>
            </div>
          </div>
        )}

        <Modal isOpen={isCandidacyModalOpen} onClose={() => setIsCandidacyModalOpen(false)} title="Detalhes da Candidatura">
          {selectedCandidacy && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={styles.label}>Nome</label>
                <p style={{ fontSize: '16px', fontWeight: 600 }}>{selectedCandidacy.nome}</p>
              </div>
              <div>
                <label style={styles.label}>Telefone</label>
                <p style={{ fontSize: '16px', fontWeight: 600 }}>{selectedCandidacy.telefone}</p>
              </div>
              <div>
                <label style={styles.label}>Mensagem</label>
                <p style={{ fontSize: '15px', lineHeight: '1.5', backgroundColor: COLORS.lightGray, padding: '12px', borderRadius: '10px' }}>{selectedCandidacy.mensagem}</p>
              </div>
              <Button onClick={() => setIsCandidacyModalOpen(false)} style={{ marginTop: '10px' }}>Fechar</Button>
            </div>
          )}
        </Modal>
      </div>
    );
  };

  if (carregando) {
    return (
      <div style={{ ...styles.container, justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ 
          width: '40px', 
          height: '40px', 
          border: `4px solid ${COLORS.lightGray}`, 
          borderTop: `4px solid ${COLORS.black}`, 
          borderRadius: '50%', 
          animation: 'spin 1s linear infinite' 
        }} />
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <Toast mensagem={toast.mensagem} tipo={toast.tipo} visivel={toast.visivel} />
      {tela === 'landing' && renderLanding()}
      {tela === 'login' && renderLogin()}
      {tela === 'register' && renderRegister()}
      {tela === 'espera' && renderWaiting()}
      {tela === 'boasVindas' && <TelaBoasVindas usuarioLogado={usuarioLogado} onContinuar={handleBoasVindasContinuar} />}
      {tela === 'dashboardAdmin' && renderDashboard()}
      {tela === 'dashboardVoluntario' && renderDashboard()}
    </div>
  );
}

// --- Tab Components ---

const CalendarTab = ({ scales, usuarioLogado, users, ranking, onOpenRanking }: { scales: Scale[], usuarioLogado: User | null, users: User[], ranking: any[], onOpenRanking: () => void }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();
  
  const monthName = currentDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const blanks = Array.from({ length: firstDayOfMonth }, (_, i) => i);

  const userScales = scales.filter(s => {
    const pos = s.posicoes;
    return Object.values(pos).includes(usuarioLogado?.id || '');
  });

  const isDayEscalated = (day: number) => {
    const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return userScales.some(s => s.data === dateStr);
  };

  // Stats
  const calcularEstatisticas = (userId: string, escalas: Scale[]) => {
    let serviu = 0, furou = 0, pendente = 0, aguardando = 0;
    escalas.forEach(escala => {
      const ehVoluntario = Object.values(escala.posicoes || {}).includes(userId);
      if (!ehVoluntario) return;
      const status = escala.confirmacoes?.[userId];
      if (status === "serviu")               serviu++;
      else if (status === "furou")           furou++;
      else if (status === "aguardando_validacao") aguardando++;
      else                                   pendente++;
    });
    return { serviu, furou, pendente, aguardando };
  };

  const stats = usuarioLogado ? calcularEstatisticas(usuarioLogado.id, scales) : { serviu: 0, furou: 0, pendente: 0, aguardando: 0 };
  const totalParticipations = stats.serviu;
  const totalFails = stats.furou;
  const totalPending = stats.pendente;
  const totalAguardando = stats.aguardando;

  return (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 700, textTransform: 'capitalize' }}>{monthName}</h2>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><ChevronLeft size={20} /></button>
          <button onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><ChevronRight size={20} /></button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '1px', backgroundColor: COLORS.border, border: `1px solid ${COLORS.border}`, borderRadius: '14px', overflow: 'hidden', marginBottom: '24px' }}>
        {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(d => (
          <div key={d} style={{ backgroundColor: COLORS.lightGray, padding: '10px 0', textAlign: 'center', fontSize: '12px', fontWeight: 600, color: COLORS.gray }}>{d}</div>
        ))}
        {blanks.map(b => <div key={`b-${b}`} style={{ backgroundColor: COLORS.white, height: '50px' }} />)}
        {days.map(d => {
          const escalated = isDayEscalated(d);
          return (
            <div key={d} style={{ backgroundColor: COLORS.white, height: '50px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
              <span style={{ fontSize: '14px', fontWeight: escalated ? 700 : 400 }}>{d}</span>
              {escalated && <div style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: COLORS.black, marginTop: '4px' }} />}
            </div>
          );
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '24px' }}>
        <div style={{ ...styles.card, margin: 0, textAlign: 'center', padding: '12px' }}>
          <span style={{ fontSize: '20px', fontWeight: 800, color: COLORS.green }}>{totalParticipations}</span>
          <p style={{ fontSize: '10px', color: COLORS.gray, textTransform: 'uppercase', marginTop: '4px' }}>Serviu</p>
        </div>
        <div style={{ ...styles.card, margin: 0, textAlign: 'center', padding: '12px' }}>
          <span style={{ fontSize: '20px', fontWeight: 800, color: COLORS.red }}>{totalFails}</span>
          <p style={{ fontSize: '10px', color: COLORS.gray, textTransform: 'uppercase', marginTop: '4px' }}>Furou</p>
        </div>
        <div style={{ ...styles.card, margin: 0, textAlign: 'center', padding: '12px' }}>
          <span style={{ fontSize: '20px', fontWeight: 800, color: COLORS.gray }}>{totalPending}</span>
          <p style={{ fontSize: '10px', color: COLORS.gray, textTransform: 'uppercase', marginTop: '4px' }}>Pendente</p>
        </div>
      </div>

      <div style={{ ...styles.card, cursor: 'pointer' }} onClick={onOpenRanking}>
        <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '16px' }}>Ranking de Voluntários</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {ranking.slice(0, 5).map((r, i) => (
            <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: i < 4 ? `1px solid ${COLORS.border}` : 'none', paddingBottom: i < 4 ? '12px' : 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: COLORS.gray }}>{i + 1}º</span>
                <span style={{ fontSize: '14px', fontWeight: 500 }}>{r.nome}</span>
              </div>
              <div style={{ display: 'flex', gap: '12px', fontSize: '12px', fontWeight: 700 }}>
                <span style={{ color: COLORS.green }}>{r.serviu} serviu</span>
                <span style={{ color: COLORS.gray }}>{r.furou} furou</span>
                <span style={{ color: COLORS.gray }}>{r.pendente} pend.</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const AvisosTab = ({ posts, notifications, usuarioLogado, users, onPost, onDeletePost, onMarkRead, onMarkNotifRead, onToggleLike, onNavigateToMembers, onViewCandidacy }: any) => {
  const [activeSubTab, setActiveSubTab] = useState<'posts' | 'notifs'>('posts');
  const [newPost, setNewPost] = useState('');
  const isAdminOrLeader = usuarioLogado?.papel === 'admin' || usuarioLogado?.papel === 'leader';

  const sortedPosts = [...posts].sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
  
  const unreadPostsCount = posts.filter((p: any) => !p.lida.includes(usuarioLogado.id)).length;
  const unreadNotifsCount = notifications.filter((n: any) => n.userId === usuarioLogado.id && !n.lida).length;

  const getRelativeTime = (dateStr: string) => {
    const now = new Date();
    const date = new Date(dateStr);
    const diffInMs = now.getTime() - date.getTime();
    const diffInMins = Math.floor(diffInMs / (1000 * 60));
    const diffInHours = Math.floor(diffInMins / 60);
    const diffInDays = Math.floor(diffInHours / 24);

    if (diffInMins < 1) return 'agora';
    if (diffInMins < 60) return `há ${diffInMins}min`;
    if (diffInHours < 24) return `há ${diffInHours}h`;
    return `há ${diffInDays} dias`;
  };

  const getAutorFuncao = (autorId: string) => {
    const autor = users.find((u: any) => u.id === autorId);
    if (!autor) return 'Voluntário';
    return autor.papel === 'admin' ? 'Administrador' : autor.papel === 'leader' ? 'Líder' : 'Voluntário';
  };

  return (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>
      {isAdminOrLeader && (
        <div style={{ display: 'flex', gap: '20px', marginBottom: '20px', borderBottom: `1px solid ${COLORS.border}` }}>
          <button 
            onClick={() => setActiveSubTab('posts')}
            style={{ 
              padding: '10px 0', 
              fontSize: '14px', 
              fontWeight: 600, 
              color: activeSubTab === 'posts' ? COLORS.black : COLORS.gray,
              borderTop: 'none',
              borderLeft: 'none',
              borderRight: 'none',
              borderBottom: activeSubTab === 'posts' ? `2px solid ${COLORS.black}` : 'none',
              background: 'none',
              cursor: 'pointer',
              position: 'relative'
            }}
          >
            Avisos
            {unreadPostsCount > 0 && <span style={{ ...styles.badge, position: 'absolute', top: '0', right: '-15px', fontSize: '10px', width: '16px', height: '16px' }}>{unreadPostsCount}</span>}
          </button>
          <button 
            onClick={() => setActiveSubTab('notifs')}
            style={{ 
              padding: '10px 0', 
              fontSize: '14px', 
              fontWeight: 600, 
              color: activeSubTab === 'notifs' ? COLORS.black : COLORS.gray,
              borderTop: 'none',
              borderLeft: 'none',
              borderRight: 'none',
              borderBottom: activeSubTab === 'notifs' ? `2px solid ${COLORS.black}` : 'none',
              background: 'none',
              cursor: 'pointer',
              position: 'relative'
            }}
          >
            Notificações
            {unreadNotifsCount > 0 && <span style={{ ...styles.badge, position: 'absolute', top: '0', right: '-15px', fontSize: '10px', width: '16px', height: '16px' }}>{unreadNotifsCount}</span>}
          </button>
        </div>
      )}

      {activeSubTab === 'posts' ? (
        <>
          {isAdminOrLeader && (
            <div style={{ ...styles.card, padding: '16px', marginBottom: '20px' }}>
              <textarea 
                value={newPost}
                onChange={(e) => setNewPost(e.target.value)}
                placeholder="O que está acontecendo?"
                style={{ ...styles.input, height: '80px', resize: 'none', border: 'none', backgroundColor: 'transparent', padding: 0, marginBottom: '12px' }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: `1px solid ${COLORS.border}`, paddingTop: '12px' }}>
                <Button 
                  onClick={() => { onPost(newPost); setNewPost(''); }} 
                  disabled={!newPost.trim()}
                  style={{ padding: '8px 20px', fontSize: '14px' }}
                >
                  Publicar
                </Button>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {sortedPosts.length === 0 ? (
              <TelaVazia
                icone="📢"
                titulo="Nenhum aviso"
                descricao="Ainda não há avisos publicados para a equipe."
              />
            ) : (
              sortedPosts.map((post) => {
                const isRead = post.lida.includes(usuarioLogado.id);
                return (
                  <div 
                    key={post.id} 
                    onClick={() => onMarkRead(post.id)}
                    style={{ 
                      display: 'flex', 
                      gap: '12px', 
                      padding: '16px', 
                      borderBottom: `1px solid ${COLORS.border}`,
                      cursor: 'pointer',
                      backgroundColor: isRead ? 'transparent' : 'rgba(26, 107, 60, 0.05)'
                    }}
                  >
                    <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: COLORS.lightGray, overflow: 'hidden', flexShrink: 0 }}>
                      {post.autorFoto ? <img src={post.autorFoto} style={{ width: '100%', height: '100%', objectFit: 'cover' }} referrerPolicy="no-referrer" /> : <UserIcon size={20} style={{ margin: '10px' }} />}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 700, fontSize: '15px' }}>{post.autorNome}</span>
                          <span style={{ color: COLORS.gray, fontSize: '12px', backgroundColor: COLORS.lightGray, padding: '1px 6px', borderRadius: '4px' }}>{getAutorFuncao(post.autorId)}</span>
                          <span style={{ color: COLORS.gray, fontSize: '13px' }}>· {getRelativeTime(post.data)}</span>
                        </div>
                        {isAdminOrLeader && post.autorId === usuarioLogado.id && (
                          <button onClick={(e) => { e.stopPropagation(); onDeletePost(post.id); }} style={{ background: 'none', border: 'none', color: COLORS.gray, cursor: 'pointer' }}>
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                      <p style={{ fontSize: '15px', lineHeight: '1.4', color: COLORS.black }}>{post.conteudo}</p>
                      <LikeButton post={post} currentUserId={usuarioLogado.id} onToggle={onToggleLike} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      ) : (
        <NotifsTab 
          notifications={notifications} 
          usuarioLogado={usuarioLogado} 
          onMarkAsRead={onMarkNotifRead} 
          onNavigateToMembers={onNavigateToMembers}
          onViewCandidacy={onViewCandidacy}
        />
      )}
    </div>
  );
};

const MessagesTab = ({ users, messages, currentUser, onSendMessage, onMarkRead, onReact, isNewChatModalOpen, setIsNewChatModalOpen }: any) => {
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [chatText, setChatText] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [longPressMessageId, setLongPressMessageId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const longPressTimer = useRef<any>(null);

  const approvedUsers = users.filter((u: User) => u.aprovado && u.id !== currentUser.id);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [selectedUser, messages]);

  const getConversations = () => {
    const userMap = new Map();
    messages.forEach((m: Message) => {
      const otherId = m.remetenteId === currentUser.id ? m.destinatarioId : m.remetenteId;
      if (!userMap.has(otherId)) {
        const otherUser = users.find((u: User) => u.id === otherId);
        if (otherUser) userMap.set(otherId, { user: otherUser, lastMessage: m, unreadCount: 0 });
      } else {
        const conv = userMap.get(otherId);
        if (new Date(m.data) > new Date(conv.lastMessage.data)) {
          conv.lastMessage = m;
        }
      }
      if (m.destinatarioId === currentUser.id && !m.lida) {
        const conv = userMap.get(m.remetenteId);
        if (conv) conv.unreadCount++;
      }
    });

    return Array.from(userMap.values())
      .filter(c => c.user.nome.toLowerCase().includes(searchTerm.toLowerCase()))
      .sort((a, b) => new Date(b.lastMessage.data).getTime() - new Date(a.lastMessage.data).getTime());
  };

  const conversations = getConversations();

  const handleStartLongPress = (messageId: string) => {
    longPressTimer.current = setTimeout(() => {
      setLongPressMessageId(messageId);
    }, 500);
  };

  const handleEndLongPress = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  };

  const formatDateSeparator = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);

    if (date.toDateString() === now.toDateString()) return 'Hoje';
    if (date.toDateString() === yesterday.toDateString()) return 'Ontem';
    return date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' });
  };

  if (selectedUser) {
    const chatMessages = messages.filter((m: Message) => 
      (m.remetenteId === currentUser.id && m.destinatarioId === selectedUser.id) ||
      (m.remetenteId === selectedUser.id && m.destinatarioId === currentUser.id)
    ).sort((a: Message, b: Message) => new Date(a.data).getTime() - new Date(b.data).getTime());

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 150px)', animation: 'fadeInUp 0.3s ease', backgroundColor: COLORS.white }}>
        {/* Chat TopBar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 16px', borderBottom: `1px solid ${COLORS.border}`, backgroundColor: COLORS.white, position: 'sticky', top: 0, zIndex: 10 }}>
          <button onClick={() => setSelectedUser(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}><ChevronLeft /></button>
          <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: COLORS.black, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
            {selectedUser.fotoPerfil ? <img src={selectedUser.fotoPerfil} style={{ width: '100%', height: '100%', objectFit: 'cover' }} referrerPolicy="no-referrer" /> : <span style={{ fontSize: '14px', fontWeight: 700 }}>{selectedUser.nome[0]}</span>}
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontWeight: 700, fontSize: '15px', color: COLORS.black }}>{selectedUser.nome}</p>
            <p style={{ fontSize: '11px', color: COLORS.gray }}>{selectedUser.papel === 'admin' ? 'Administrador' : selectedUser.papel === 'leader' ? 'Líder' : 'Voluntário'}</p>
          </div>
        </div>

        {/* Messages Area */}
        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {chatMessages.map((m: Message, idx: number) => {
            const isMe = m.remetenteId === currentUser.id;
            const prevMsg = chatMessages[idx - 1];
            const showDate = !prevMsg || new Date(m.data).toDateString() !== new Date(prevMsg.data).toDateString();
            const isConsecutive = prevMsg && prevMsg.remetenteId === m.remetenteId && !showDate;

            return (
              <React.Fragment key={m.id}>
                {showDate && (
                  <div style={{ textAlign: 'center', margin: '16px 0', fontSize: '11px', color: COLORS.gray, fontWeight: 600 }}>
                    {formatDateSeparator(m.data)}
                  </div>
                )}
                {m.isSystem ? (
                  <div style={{ textAlign: 'center', margin: '8px 0', fontSize: '12px', color: COLORS.gray, fontStyle: 'italic' }}>
                    {m.conteudo}
                  </div>
                ) : (
                  <div 
                    style={{ 
                      alignSelf: isMe ? 'flex-end' : 'flex-start', 
                      maxWidth: '80%', 
                      marginTop: isConsecutive ? '2px' : '8px',
                      position: 'relative'
                    }}
                    onMouseDown={() => handleStartLongPress(m.id)}
                    onMouseUp={handleEndLongPress}
                    onMouseLeave={handleEndLongPress}
                    onTouchStart={() => handleStartLongPress(m.id)}
                    onTouchEnd={handleEndLongPress}
                  >
                    <div style={{ 
                      backgroundColor: isMe ? COLORS.black : '#f0f0f0', 
                      color: isMe ? 'white' : COLORS.black,
                      padding: '10px 14px',
                      borderRadius: isMe ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                      fontSize: '14px',
                      lineHeight: '1.4',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                    }}>
                      {m.conteudo}
                    </div>
                    
                    {/* Reactions */}
                    {m.reacoes && Object.keys(m.reacoes).length > 0 && (
                      <div style={{ 
                        position: 'absolute', 
                        bottom: '-10px', 
                        [isMe ? 'left' : 'right']: '4px',
                        backgroundColor: 'white',
                        borderRadius: '10px',
                        padding: '2px 4px',
                        fontSize: '10px',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                        display: 'flex',
                        gap: '2px'
                      }}>
                        {Object.values(m.reacoes).map((emoji, i) => <span key={i}>{emoji}</span>)}
                      </div>
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px', justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
                      <p style={{ fontSize: '10px', color: COLORS.gray }}>
                        {new Date(m.data).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                      {isMe && (
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          <span style={{ fontSize: '12px', color: m.lida ? COLORS.black : COLORS.gray, lineHeight: 1 }}>
                            {m.lida ? '✓✓' : '✓'}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Long Press Menu */}
                    {longPressMessageId === m.id && (
                      <div style={{ 
                        position: 'absolute', 
                        top: '-40px', 
                        left: '50%', 
                        transform: 'translateX(-50%)', 
                        backgroundColor: 'white', 
                        borderRadius: '20px', 
                        padding: '6px 12px', 
                        display: 'flex', 
                        gap: '12px', 
                        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                        zIndex: 100
                      }}>
                        {['❤️', '👍', '😂', '🙏'].map(emoji => (
                          <span 
                            key={emoji} 
                            onClick={() => { onReact(m.id, emoji); setLongPressMessageId(null); }}
                            style={{ cursor: 'pointer', fontSize: '18px' }}
                          >
                            {emoji}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </React.Fragment>
            );
          })}
          {isTyping && (
            <div style={{ alignSelf: 'flex-start', backgroundColor: '#f0f0f0', padding: '8px 12px', borderRadius: '18px', fontSize: '14px', marginTop: '8px' }}>
              <motion.span animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1 }}>...</motion.span>
            </div>
          )}
        </div>

        {/* Input Bar */}
        <div style={{ padding: '12px 16px', borderTop: `1px solid ${COLORS.border}`, backgroundColor: COLORS.white, display: 'flex', gap: '10px', alignItems: 'center' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <input 
              value={chatText}
              onChange={(e) => setChatText(e.target.value)}
              onFocus={() => setIsTyping(true)}
              onBlur={() => setIsTyping(false)}
              onKeyPress={(e) => e.key === 'Enter' && chatText.trim() && (onSendMessage(selectedUser.id, chatText), setChatText(''))}
              placeholder="Mensagem..."
              style={{ 
                width: '100%',
                padding: '10px 16px',
                borderRadius: '22px',
                border: `1px solid ${COLORS.border}`,
                fontSize: '14px',
                outline: 'none',
                backgroundColor: COLORS.bg
              }}
            />
          </div>
          <button 
            onClick={() => { if (chatText.trim()) { onSendMessage(selectedUser.id, chatText); setChatText(''); } }}
            style={{ 
              backgroundColor: chatText.trim() ? COLORS.black : 'transparent', 
              color: chatText.trim() ? 'white' : COLORS.gray, 
              border: 'none', 
              borderRadius: '50%', 
              width: '40px', 
              height: '40px', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              cursor: chatText.trim() ? 'pointer' : 'default',
              transition: 'all 0.2s ease'
            }}
          >
            {chatText.trim() ? <ArrowRight size={20} /> : <Mic size={20} />}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ animation: 'fadeInUp 0.3s ease', backgroundColor: COLORS.bg, minHeight: 'calc(100vh - 150px)' }}>
      {/* Search Bar */}
      <div style={{ padding: '12px 16px', backgroundColor: COLORS.white, borderBottom: `1px solid ${COLORS.border}` }}>
        <div style={{ position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: COLORS.gray }} />
          <input 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar conversas..."
            style={{ 
              width: '100%', 
              padding: '8px 12px 8px 36px', 
              borderRadius: '10px', 
              border: 'none', 
              backgroundColor: COLORS.bg,
              fontSize: '14px'
            }}
          />
        </div>
      </div>

      {/* Conversations List */}
      <div style={{ backgroundColor: COLORS.white }}>
        {conversations.length > 0 ? conversations.map((conv: any) => (
          <div 
            key={conv.user.id} 
            onClick={() => { setSelectedUser(conv.user); onMarkRead(conv.user.id); }}
            style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderBottom: `1px solid #f0f0f0`, cursor: 'pointer' }}
          >
            <div style={{ width: '52px', height: '52px', borderRadius: '50%', backgroundColor: COLORS.black, overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
              {conv.user.fotoPerfil ? <img src={conv.user.fotoPerfil} style={{ width: '100%', height: '100%', objectFit: 'cover' }} referrerPolicy="no-referrer" /> : <span style={{ fontSize: '18px', fontWeight: 700 }}>{conv.user.nome[0]}</span>}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 700, fontSize: '15px' }}>{conv.user.nome}</span>
                <span style={{ fontSize: '11px', color: COLORS.gray }}>
                  {new Date(conv.lastMessage.data).toLocaleDateString() === new Date().toLocaleDateString() 
                    ? new Date(conv.lastMessage.data).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                    : new Date(conv.lastMessage.data).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })}
                </span>
              </div>
              <p style={{ fontSize: '12px', color: COLORS.gray, marginBottom: '2px' }}>{conv.user.papel === 'admin' ? 'Administrador' : conv.user.papel === 'leader' ? 'Líder' : 'Voluntário'}</p>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <p style={{ fontSize: '13px', color: conv.unreadCount > 0 ? COLORS.black : COLORS.gray, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: conv.unreadCount > 0 ? 600 : 400 }}>
                  {conv.lastMessage.conteudo}
                </p>
                {conv.unreadCount > 0 && (
                  <span style={{ backgroundColor: COLORS.black, color: 'white', fontSize: '10px', fontWeight: 700, borderRadius: '10px', padding: '2px 6px', minWidth: '20px', textAlign: 'center' }}>
                    {conv.unreadCount}
                  </span>
                )}
              </div>
            </div>
          </div>
        )) : (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: COLORS.gray }}>
            <p>Nenhuma conversa encontrada.</p>
          </div>
        )}
      </div>

      {/* New Chat Modal */}
      {isNewChatModalOpen && (
        <Modal isOpen={isNewChatModalOpen} onClose={() => setIsNewChatModalOpen(false)} title="Nova Conversa">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {approvedUsers.map((u: User) => (
              <div 
                key={u.id} 
                onClick={() => { setSelectedUser(u); setIsNewChatModalOpen(false); }}
                style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', borderRadius: '12px', cursor: 'pointer', backgroundColor: COLORS.bg }}
              >
                <div style={{ width: '40px', height: '40px', borderRadius: '20px', backgroundColor: COLORS.black, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                  {u.fotoPerfil ? <img src={u.fotoPerfil} style={{ width: '100%', height: '100%', objectFit: 'cover' }} referrerPolicy="no-referrer" /> : <span style={{ fontWeight: 700 }}>{u.nome[0]}</span>}
                </div>
                <div>
                  <p style={{ fontWeight: 700, fontSize: '14px' }}>{u.nome}</p>
                  <p style={{ fontSize: '11px', color: COLORS.gray }}>{u.papel === 'admin' ? 'Administrador' : u.papel === 'leader' ? 'Líder' : 'Voluntário'}</p>
                </div>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
};

const RankingModal = ({ isOpen, onClose, ranking }: any) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Ranking Completo">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {ranking.map((r: any, i: number) => (
          <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${COLORS.border}`, paddingBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '14px', fontWeight: 700, color: COLORS.gray, width: '24px' }}>{i + 1}º</span>
              <span style={{ fontSize: '15px', fontWeight: 600 }}>{r.nome}</span>
            </div>
            <div style={{ display: 'flex', gap: '16px', fontSize: '13px', fontWeight: 700 }}>
              <div style={{ textAlign: 'center' }}>
                <span style={{ color: COLORS.green }}>{r.serviu}</span>
                <p style={{ fontSize: '9px', color: COLORS.gray, textTransform: 'uppercase' }}>Serviu</p>
              </div>
              <div style={{ textAlign: 'center' }}>
                <span style={{ color: COLORS.red }}>{r.furou}</span>
                <p style={{ fontSize: '9px', color: COLORS.gray, textTransform: 'uppercase' }}>Furou</p>
              </div>
              <div style={{ textAlign: 'center' }}>
                <span style={{ color: COLORS.gray }}>{r.pendente}</span>
                <p style={{ fontSize: '9px', color: COLORS.gray, textTransform: 'uppercase' }}>Pend.</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
};

const CandidacySuccessModal = ({ isOpen, onClose }: any) => {
  if (!isOpen) return null;
  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <motion.div 
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        style={{ ...styles.modalContent, textAlign: 'center', padding: '40px 24px' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ marginBottom: '24px' }}>
          <svg width="80" height="80" viewBox="0 0 80 80">
            <motion.circle 
              cx="40" cy="40" r="38" 
              fill="none" 
              stroke={COLORS.green} 
              strokeWidth="4"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.5 }}
            />
            <motion.path 
              d="M20 42L34 56L60 26" 
              fill="none" 
              stroke={COLORS.green} 
              strokeWidth="6" 
              strokeLinecap="round" 
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.5, delay: 0.4 }}
            />
          </svg>
        </div>
        <p style={{ fontSize: '15px', fontWeight: 500, color: COLORS.black, lineHeight: '1.5' }}>
          Ficamos muito felizes pelo seu interesse em atuar na Filmagem do Kombo Alpha, em breve, um de nossos representantes entrará em contato!
        </p>
      </motion.div>
    </div>
  );
};

const ScalesTab = ({ scales, usuarioLogado, users, onConfirm, onEdit, onDelete, definirPresenca }: { scales: Scale[], usuarioLogado: User, users: User[], onConfirm: any, onEdit: any, onDelete: any, definirPresenca: any }) => {
  const isAdminOrLeader = usuarioLogado?.papel === 'admin' || usuarioLogado?.papel === 'leader';
  const today = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  
  const upcomingScales = scales.filter(s => new Date(s.data) >= new Date(new Date().setHours(0,0,0,0))).sort((a,b) => new Date(a.data).getTime() - new Date(b.data).getTime());
  const pastScales = scales.filter(s => new Date(s.data) < new Date(new Date().setHours(0,0,0,0))).sort((a,b) => new Date(b.data).getTime() - new Date(a.data).getTime());

  const aguardandoValidacao: any[] = [];
  if (isAdminOrLeader) {
    scales.forEach(escala => {
      Object.entries(escala.posicoes || {}).forEach(([posicao, userId]) => {
        if (userId && escala.confirmacoes?.[userId] === "aguardando_validacao") {
          const usuario = users.find(u => u.id === userId);
          if (usuario) {
            aguardandoValidacao.push({ escala, usuario, posicao });
          }
        }
      });
    });
  }

  return (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>
      <div style={{ marginBottom: '24px' }}>
        <p style={{ color: COLORS.gray, fontSize: '14px' }}>{today}</p>
        <h2 style={{ fontSize: '24px', fontWeight: 800 }}>Olá, {usuarioLogado?.nome.split(' ')[0]}!</h2>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '24px' }}>
        <div style={{ ...styles.card, margin: 0, backgroundColor: COLORS.black, color: 'white' }}>
          <span style={{ fontSize: '24px', fontWeight: 800 }}>{upcomingScales.length}</span>
          <p style={{ fontSize: '12px', opacity: 0.8 }}>Próximas Escalas</p>
        </div>
        <div style={{ ...styles.card, margin: 0 }}>
          <span style={{ fontSize: '24px', fontWeight: 800 }}>{pastScales.length}</span>
          <p style={{ fontSize: '12px', color: COLORS.gray }}>Realizadas</p>
        </div>
      </div>

      {aguardandoValidacao.length > 0 && (
        <div style={{ ...styles.card, marginBottom: '24px', border: `1px solid ${COLORS.border}` }}>
          <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '16px', color: '#f39c12' }}>Aguardando Validação</h3>
          {aguardandoValidacao.map(({ escala, usuario, posicao }, idx) => (
            <div key={`${escala.id}-${usuario.id}-${idx}`} style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 0",
              borderBottom: idx === aguardandoValidacao.length - 1 ? "none" : "1px solid #f0f0f0",
            }}>
              <div>
                <p style={{ fontSize: "14px", fontWeight: "600", color: "#1d1d1f" }}>
                  {usuario.nome}
                </p>
                <p style={{ fontSize: "12px", color: "#6e6e73" }}>
                  {escala.titulo} — {posicao}
                </p>
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  onClick={() => definirPresenca(escala.id, usuario.id, "serviu")}
                  style={{
                    padding: "6px 14px",
                    borderRadius: "8px",
                    border: "none",
                    background: "#1a6b3c",
                    color: "white",
                    fontSize: "13px",
                    fontWeight: "600",
                    cursor: "pointer",
                  }}
                >
                  Serviu
                </button>
                <button
                  onClick={() => definirPresenca(escala.id, usuario.id, "furou")}
                  style={{
                    padding: "6px 14px",
                    borderRadius: "8px",
                    border: "none",
                    background: "#1d1d1f",
                    color: "white",
                    fontSize: "13px",
                    fontWeight: "600",
                    cursor: "pointer",
                  }}
                >
                  Furou
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <SecaoLabel titulo="Próximas Escalas" />
      {upcomingScales.length === 0 ? (
        <TelaVazia
          icone="📅"
          titulo="Nenhuma escala futura"
          descricao="Você não tem escalas agendadas para os próximos dias."
        />
      ) : (
        <VirtualList items={upcomingScales} renderItem={(s: Scale) => (
          <ScaleCard 
            key={s.id} 
            scale={s} 
            usuarioLogado={usuarioLogado} 
            onConfirm={onConfirm}
            onEdit={isAdminOrLeader ? () => onEdit(s) : undefined}
            onDelete={isAdminOrLeader ? () => onDelete(s.id) : undefined}
          />
        )} />
      )}

      <SecaoLabel titulo="Histórico" />
      {pastScales.length === 0 ? (
        <TelaVazia
          icone="📜"
          titulo="Histórico vazio"
          descricao="Ainda não há registros de escalas passadas."
        />
      ) : (
        <div style={{ opacity: 0.6 }}>
          {pastScales.map(s => (
            <ScaleCard key={s.id} scale={s} usuarioLogado={usuarioLogado} isPast />
          ))}
        </div>
      )}
    </div>
  );
};

const MembersTab = ({ users, currentUser, onApprove, onPromote, onDeleteMember, onEditAreas }: { users: User[], currentUser: User, onApprove: any, onPromote: any, onDeleteMember: any, onEditAreas: any }) => {
  const pendingUsers = users.filter(u => !u.aprovado);
  const approvedUsers = users.filter(u => u.aprovado);
  const podeGerenciar = currentUser?.papel === 'admin' || currentUser?.papel === 'leader';

  return (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>
      {pendingUsers.length > 0 && (
        <div style={{ marginBottom: '30px' }}>
          <SecaoLabel titulo={`Pendentes (${pendingUsers.length})`} />
          {pendingUsers.map(u => (
            <div key={u.id} style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                <div>
                  <p style={{ fontWeight: 700 }}>{u.nome}</p>
                  <p style={{ fontSize: '12px', color: COLORS.gray }}>{u.email}</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '6px' }}>
                    {u.areas.map(a => <span key={a} style={{ fontSize: '10px', backgroundColor: COLORS.lightGray, padding: '2px 6px', borderRadius: '4px' }}>{a}</span>)}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <BotaoAcao label="Aprovar" variant="green" style={{ flex: 1, padding: '8px' }} onClick={() => onApprove(u.id, true)} />
                <BotaoAcao label="Recusar" variant="destructive" style={{ flex: 1, padding: '8px' }} onClick={() => onApprove(u.id, false)} />
              </div>
            </div>
          ))}
        </div>
      )}

      <SecaoLabel titulo={`Membros Aprovados (${approvedUsers.length})`} />
      {approvedUsers.length === 0 ? (
        <TelaVazia
          icone="👥"
          titulo="Nenhum membro"
          descricao="Ainda não há membros aprovados no sistema."
        />
      ) : (
        approvedUsers.map(u => (
          <div key={u.id} style={{ ...cardStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ fontWeight: 600 }}>{u.nome}</p>
              <p style={{ fontSize: '12px', color: COLORS.gray }}>{u.papel === 'admin' ? 'Administrador' : u.papel === 'leader' ? 'Líder' : 'Voluntário'}</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                {u.areas.map(a => <span key={a} style={{ fontSize: '9px', backgroundColor: COLORS.lightGray, padding: '1px 4px', borderRadius: '3px' }}>{a}</span>)}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {podeGerenciar && u.id !== currentUser.id && (
                <>
                  <button
                    onClick={() => onEditAreas(u)}
                    style={{
                      background: "none",
                      border: "1px solid #e5e5ea",
                      borderRadius: "8px",
                      padding: "5px 10px",
                      cursor: "pointer",
                      color: "#1d1d1f",
                      fontSize: "12px",
                      fontWeight: "500",
                    }}
                  >
                    Editar áreas
                  </button>
                  <button
                    onClick={() => onDeleteMember(u)}
                    style={{
                      background: "none",
                      border: "1px solid #e5e5ea",
                      borderRadius: "8px",
                      padding: "5px 10px",
                      cursor: "pointer",
                      color: "#ff3b30",
                      fontSize: "12px",
                      fontWeight: "500",
                    }}
                  >
                    Excluir
                  </button>
                </>
              )}
              {currentUser?.papel === 'admin' && u.id !== currentUser.id && (
                <button
                  onClick={() => onPromote(u.id)}
                  style={{
                    background: "none",
                    border: "1px solid #e5e5ea",
                    borderRadius: "8px",
                    padding: "5px 10px",
                    cursor: "pointer",
                    color: "#1d1d1f",
                    fontSize: "12px",
                    fontWeight: "500",
                  }}
                >
                  {u.papel === 'volunteer' ? 'Tornar Líder' : 'Tornar Voluntário'}
                </button>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
};

const NotifsTab = ({ notifications, usuarioLogado, onMarkAsRead, onNavigateToMembers, onViewCandidacy }: { notifications: Notification[], usuarioLogado: User, onMarkAsRead: any, onNavigateToMembers: any, onViewCandidacy: any }) => {
  const myNotifs = notifications.filter(n => n.userId === usuarioLogado?.id);
  return (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>
      {myNotifs.length === 0 ? (
        <p style={{ textAlign: 'center', color: COLORS.gray, padding: '40px 0' }}>Nenhum aviso por aqui.</p>
      ) : (
        myNotifs.map(n => (
          <div 
            key={n.id} 
            onClick={() => onMarkAsRead(n.id)}
            style={{ ...styles.card, opacity: n.lida ? 0.6 : 1, borderLeft: n.lida ? `1px solid ${COLORS.border}` : `4px solid ${COLORS.black}`, cursor: 'pointer' }}
          >
            <p style={{ fontSize: '14px', lineHeight: '1.4', marginBottom: '8px' }}>{n.mensagem}</p>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {n.mensagem.includes("Novo membro") && (
                <Button variant="secondary" onClick={(e: any) => { e.stopPropagation(); onNavigateToMembers(); }} style={{ fontSize: '12px', padding: '4px 12px' }}>
                  Ver pendentes
                </Button>
              )}
              {n.mensagem.includes("Nova candidatura") && (
                <Button variant="secondary" onClick={(e: any) => { e.stopPropagation(); onViewCandidacy(n.mensagem); }} style={{ fontSize: '12px', padding: '4px 12px' }}>
                  Ver candidatura
                </Button>
              )}
            </div>
            <p style={{ fontSize: '11px', color: COLORS.gray, marginTop: '8px' }}>{new Date(n.data).toLocaleString('pt-BR')}</p>
          </div>
        ))
      )}
    </div>
  );
};

const ProfileTab = ({ usuarioLogado, users, setUsers, setUser, onLogout }: { usuarioLogado: User, users: User[], setUsers: any, setUser: any, onLogout: any }) => {
  const [mostrarAlterarSenha, setMostrarAlterarSenha] = React.useState(false);
  const [senhaAtual, setSenhaAtual] = React.useState("");
  const [novaSenha, setNovaSenha] = React.useState("");
  const [confirmarNovaSenha, setConfirmarNovaSenha] = React.useState("");
  const [erroSenha, setErroSenha] = React.useState("");
  const [sucessoSenha, setSucessoSenha] = React.useState(false);

  const alterarSenha = async () => {
    setErroSenha("");
    setSucessoSenha(false);

    try {
      const senhaAtualNorm = senhaAtual.trim();
      const novaSenhaNorm = novaSenha.trim();
      const confirmarNorm = confirmarNovaSenha.trim();

      // Validações
      if (!senhaAtualNorm || !novaSenhaNorm || !confirmarNorm) {
        setErroSenha("Preencha todos os campos.");
        return;
      }

      if (senhaAtualNorm !== usuarioLogado.senha) {
        setErroSenha("Senha atual incorreta.");
        return;
      }

      if (novaSenhaNorm.length < 6) {
        setErroSenha("A nova senha deve ter pelo menos 6 caracteres.");
        return;
      }

      if (novaSenhaNorm !== confirmarNorm) {
        setErroSenha("As senhas não coincidem.");
        return;
      }

      if (novaSenhaNorm === senhaAtualNorm) {
        setErroSenha("A nova senha deve ser diferente da senha atual.");
        return;
      }

      // Salvar nova senha no banco
      await DB.updateItem(DB.KEYS.USERS, usuarioLogado.id, { senha: novaSenhaNorm });

      // Atualizar usuário logado no estado e na sessão
      const usuarioAtualizado = { ...usuarioLogado, senha: novaSenhaNorm };
      setUser(usuarioAtualizado);

      await DB.setSession({
        userId: usuarioAtualizado.id,
        email: usuarioAtualizado.email,
        papel: usuarioAtualizado.papel,
        timestamp: new Date().toISOString(),
      });

      // Feedback e reset
      setSucessoSenha(true);
      setSenhaAtual("");
      setNovaSenha("");
      setConfirmarNovaSenha("");

      // Fechar após 2 segundos
      setTimeout(() => {
        setMostrarAlterarSenha(false);
        setSucessoSenha(false);
      }, 2000);

    } catch (err) {
      console.error("Erro ao alterar senha:", err);
      setErroSenha("Erro ao salvar. Tente novamente.");
    }
  };

  return (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>
      <div style={{ ...styles.card, backgroundColor: COLORS.black, color: 'white', textAlign: 'center', padding: '30px 20px', borderTop: 'none', borderBottom: 'none', borderLeft: 'none', borderRight: 'none' }}>
        <ProfilePhotoUpload
          usuarioLogado={usuarioLogado}
          onFotoAtualizada={async (base64: string) => {
            await salvarFotoPerfil(base64, usuarioLogado.id, setUser);
            // Sincronizar lista de usuários também
            const updated = await DB.getUsers();
            setUsers(updated);
          }}
        />
        <h2 style={{ fontSize: '22px', fontWeight: 700, marginTop: '12px' }}>{usuarioLogado?.nome}</h2>
        <p style={{ opacity: 0.7, fontSize: '14px', marginTop: '4px' }}>{usuarioLogado?.areas.join(' • ')}</p>
      </div>

      <div style={styles.card}>
        <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '16px' }}>Informações</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: COLORS.gray }}>Email</span>
            <span>{usuarioLogado?.email}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: COLORS.gray }}>Função</span>
            <span style={{ textTransform: 'capitalize' }}>{usuarioLogado?.papel === 'admin' ? 'Administrador' : usuarioLogado?.papel === 'leader' ? 'Líder' : 'Voluntário'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: COLORS.gray }}>Membro desde</span>
            <span>{new Date(usuarioLogado?.dataEntrada || '').toLocaleDateString('pt-BR')}</span>
          </div>
        </div>
      </div>

      <div style={{ marginBottom: '16px' }}>
        <button
          onClick={() => {
            setMostrarAlterarSenha(v => !v);
            setErroSenha("");
            setSucessoSenha(false);
            setSenhaAtual("");
            setNovaSenha("");
            setConfirmarNovaSenha("");
          }}
          style={{
            width: "100%",
            padding: "13px",
            borderRadius: "12px",
            border: "1px solid #e5e5ea",
            background: "white",
            fontSize: "15px",
            fontWeight: "500",
            color: "#1d1d1f",
            cursor: "pointer",
            textAlign: "left",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif",
          }}
        >
          <span>Alterar senha</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="#6e6e73" strokeWidth="1.5">
            <path d="M9 18l6-6-6-6"/>
          </svg>
        </button>

        {mostrarAlterarSenha && (
          <div style={{
            background: "#f5f5f7",
            borderRadius: "12px",
            padding: "16px",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            marginTop: "4px",
          }}>
            {/* Senha atual */}
            <input
              type="password"
              placeholder="Senha atual"
              value={senhaAtual}
              onChange={e => { setSenhaAtual(e.target.value); setErroSenha(""); setSucessoSenha(false); }}
              style={{
                width: "100%",
                padding: "11px 14px",
                borderRadius: "10px",
                border: "1px solid #e5e5ea",
                fontSize: "15px",
                background: "white",
                outline: "none",
                boxSizing: "border-box",
                fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif",
              }}
            />

            {/* Nova senha */}
            <input
              type="password"
              placeholder="Nova senha"
              value={novaSenha}
              onChange={e => { setNovaSenha(e.target.value); setErroSenha(""); setSucessoSenha(false); }}
              style={{
                width: "100%",
                padding: "11px 14px",
                borderRadius: "10px",
                border: "1px solid #e5e5ea",
                fontSize: "15px",
                background: "white",
                outline: "none",
                boxSizing: "border-box",
                fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif",
              }}
            />

            {/* Confirmar nova senha */}
            <input
              type="password"
              placeholder="Confirmar nova senha"
              value={confirmarNovaSenha}
              onChange={e => { setConfirmarNovaSenha(e.target.value); setErroSenha(""); setSucessoSenha(false); }}
              style={{
                width: "100%",
                padding: "11px 14px",
                borderRadius: "10px",
                border: "1px solid #e5e5ea",
                fontSize: "15px",
                background: "white",
                outline: "none",
                boxSizing: "border-box",
                fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif",
              }}
            />

            {/* Erro ou sucesso */}
            {erroSenha ? (
              <p style={{ fontSize: "13px", color: "#ff3b30", margin: 0 }}>{erroSenha}</p>
            ) : null}
            {sucessoSenha ? (
              <p style={{ fontSize: "13px", color: "#1a6b3c", margin: 0 }}>
                ✅ Senha alterada com sucesso!
              </p>
            ) : null}

            {/* Botão salvar */}
            <button
              onClick={alterarSenha}
              style={{
                padding: "12px",
                borderRadius: "10px",
                border: "none",
                background: "#1d1d1f",
                color: "white",
                fontSize: "15px",
                fontWeight: "600",
                cursor: "pointer",
                fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif",
              }}
            >
              Salvar nova senha
            </button>
          </div>
        )}
      </div>

      <Button variant="outline" style={{ width: '100%', color: COLORS.red, borderColor: COLORS.red }} onClick={onLogout}>
        <LogOut size={20} /> Sair da conta
      </Button>
    </div>
  );
};

// --- Sub-components ---

const ScaleCard = ({ scale, usuarioLogado, onConfirm, onEdit, onDelete, isPast = false }: any) => {
  const [isHoveredConfirm, setIsHoveredConfirm] = useState(false);
  const [isHoveredDecline, setIsHoveredDecline] = useState(false);

  const myPos = Object.keys(scale.posicoes).find(key => scale.posicoes[key] === usuarioLogado.id);
  const formattedPos = myPos === 'corte' ? 'Corte' : myPos?.replace('camera', 'Câmera ');
  const myStatus = scale.confirmacoes[usuarioLogado.id] || 'pendente';

  const dateFormatted = new Date(scale.data).toLocaleDateString("pt-BR", { day:"2-digit", month:"long", year:"numeric" });

  return (
    <div style={styles.card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
        <div>
          <h4 style={{ fontSize: '16px', fontWeight: 700 }}>{scale.titulo}</h4>
          <p style={{ fontSize: '13px', color: COLORS.gray, marginTop: '2px' }}>{dateFormatted} às {scale.horario}</p>
        </div>
        {!isPast && <StatusTag status={myStatus} />}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
        <div style={{ backgroundColor: COLORS.lightGray, padding: '6px 10px', borderRadius: '8px', fontSize: '12px' }}>
          <span style={{ color: COLORS.gray }}>Área:</span> <span style={{ fontWeight: 600 }}>{scale.area}</span>
        </div>
        {formattedPos && (
          <div style={{ backgroundColor: COLORS.black, color: 'white', padding: '6px 10px', borderRadius: '8px', fontSize: '12px' }}>
            <span style={{ opacity: 0.7 }}>Sua posição:</span> <span style={{ fontWeight: 600 }}>{formattedPos}</span>
          </div>
        )}
      </div>

      {scale.notas && (
        <div style={{ backgroundColor: '#fff9c4', padding: '10px', borderRadius: '8px', fontSize: '12px', marginBottom: '16px', border: '1px solid #fbc02d' }}>
          <p style={{ fontWeight: 700, marginBottom: '2px' }}>Notas:</p>
          <p>{scale.notas}</p>
        </div>
      )}

      {!isPast && myPos && myStatus === 'pendente' && (
        <div style={{ display: 'flex', gap: '8px' }}>
          <button 
            onMouseEnter={() => setIsHoveredConfirm(true)}
            onMouseLeave={() => setIsHoveredConfirm(false)}
            onClick={() => onConfirm(scale.id, 'confirmado')}
            style={{ 
              flex: 1, 
              backgroundColor: COLORS.green, 
              color: 'white', 
              border: 'none', 
              borderRadius: '10px', 
              padding: '10px', 
              fontWeight: 600, 
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              transform: isHoveredConfirm ? 'scale(1.02)' : 'scale(1)',
              filter: isHoveredConfirm ? 'brightness(1.1)' : 'none'
            }}
          >
            Confirmar Presença
          </button>
          <button 
            onMouseEnter={() => setIsHoveredDecline(true)}
            onMouseLeave={() => setIsHoveredDecline(false)}
            onClick={() => onConfirm(scale.id, 'recusado')}
            style={{ 
              flex: 1, 
              backgroundColor: COLORS.lightGray, 
              color: COLORS.red, 
              border: 'none', 
              borderRadius: '10px', 
              padding: '10px', 
              fontWeight: 600, 
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              transform: isHoveredDecline ? 'scale(1.02)' : 'scale(1)',
              filter: isHoveredDecline ? 'brightness(0.95)' : 'none'
            }}
          >
            Indisponível
          </button>
        </div>
      )}

      {(onEdit || onDelete) && (
        <div style={{ display: 'flex', gap: '8px', marginTop: '12px', borderTop: `1px solid ${COLORS.border}`, paddingTop: '12px' }}>
          <button onClick={onEdit} style={{ background: 'none', border: 'none', color: COLORS.gray, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px' }}><Edit2 size={14} /> Editar</button>
          <button onClick={onDelete} style={{ background: 'none', border: 'none', color: COLORS.red, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px' }}><Trash2 size={14} /> Excluir</button>
        </div>
      )}
    </div>
  );
};

const ScaleModal = ({ isOpen, onClose, onSave, editingScale, users }: any) => {
  const [titulo, setTitulo] = useState('');
  const [data, setData] = useState('');
  const [horario, setHorario] = useState('');
  const [area, setArea] = useState('Filmagem — Ministério Geral');
  const [notas, setNotas] = useState('');
  const [posicoes, setPosicoes] = useState({ corte: '', camera1: '', camera2: '', camera3: '' });

  useEffect(() => {
    if (editingScale) {
      setTitulo(editingScale.titulo);
      setData(editingScale.data);
      setHorario(editingScale.horario);
      setArea(editingScale.area);
      setNotas(editingScale.notas);
      setPosicoes({
        corte: editingScale.posicoes.corte || '',
        camera1: editingScale.posicoes.camera1 || '',
        camera2: editingScale.posicoes.camera2 || '',
        camera3: editingScale.posicoes.camera3 || '',
      });
    } else {
      setTitulo(''); setData(''); setHorario(''); setArea('Filmagem — Ministério Geral'); setNotas('');
      setPosicoes({ corte: '', camera1: '', camera2: '', camera3: '' });
    }
  }, [editingScale, isOpen]);

  const handleSave = () => {
    if (!titulo || !data || !horario) {
      alert('Preencha os campos obrigatórios.');
      return;
    }
    onSave({ titulo, data, horario, area, notas, posicoes });
  };

  const userOptions = [{ value: '', label: 'Selecione um voluntário...' }, ...users.map((u: any) => ({ value: u.id, label: u.nome }))];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={editingScale ? "Editar Escala" : "Nova Escala"}>
      <Input label="Título do Evento" value={titulo} onChange={setTitulo} placeholder="Ex: Culto de Domingo" />
      <div style={{ display: 'flex', gap: '12px' }}>
        <Input label="Data" type="date" value={data} onChange={setData} />
        <Input label="Horário" type="time" value={horario} onChange={setHorario} />
      </div>
      <Select label="Área" value={area} onChange={setArea} options={[
        { value: "Filmagem — Ministério Geral", label: "Filmagem — Ministério Geral" },
        { value: "Equipe Íris", label: "Equipe Íris" },
        { value: "Corte", label: "Corte" },
        { value: "Novos Membros", label: "Novos Membros" }
      ]} />
      
      <div style={{ marginBottom: '20px' }}>
        <label style={styles.label}>Posições da Escala</label>
        <Select label="Corte" value={posicoes.corte} onChange={(v: string) => setPosicoes({ ...posicoes, corte: v })} options={userOptions} />
        <Select label="Câmera 1" value={posicoes.camera1} onChange={(v: string) => setPosicoes({ ...posicoes, camera1: v })} options={userOptions} />
        <Select label="Câmera 2" value={posicoes.camera2} onChange={(v: string) => setPosicoes({ ...posicoes, camera2: v })} options={userOptions} />
        <Select label="Câmera 3" value={posicoes.camera3} onChange={(v: string) => setPosicoes({ ...posicoes, camera3: v })} options={userOptions} />
      </div>

      <div style={{ marginBottom: '20px' }}>
        <label style={styles.label}>Notas Internas (Líderes/Admin)</label>
        <textarea style={{ ...styles.input, height: '80px', resize: 'none' }} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Observações importantes..." />
      </div>

      <Button onClick={handleSave} style={{ width: '100%' }}>Salvar Escala</Button>
    </Modal>
  );
};

// Simple Virtual List for performance
const VirtualList = ({ items, renderItem }: any) => {
  const [visibleCount, setVisibleCount] = useState(10);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      if (!containerRef.current) return;
      const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
      if (scrollTop + clientHeight >= scrollHeight - 100) {
        setVisibleCount(prev => Math.min(prev + 10, items.length));
      }
    };
    
    const el = containerRef.current;
    el?.addEventListener('scroll', handleScroll);
    return () => el?.removeEventListener('scroll', handleScroll);
  }, [items.length]);

  return (
    <div ref={containerRef} style={{ maxHeight: '600px', overflowY: 'auto', paddingRight: '4px' }}>
      {items.slice(0, visibleCount).map(renderItem)}
    </div>
  );
};

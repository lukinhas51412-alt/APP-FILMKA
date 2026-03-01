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
  confirmacoes: Record<string, 'confirmado' | 'recusado' | 'furou'>;
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

// --- Storage API Wrapper ---
const Storage = {
  async get<T>(key: string): Promise<T | null> {
    try {
      // @ts-ignore - window.storage is provided by the environment
      if (typeof window === 'undefined' || !window.storage) {
        console.warn('window.storage is not available');
        return null;
      }
      // @ts-ignore
      return await window.storage.get(key);
    } catch (e) {
      console.error(`Error getting ${key}:`, e);
      return null;
    }
  },
  async set(key: string, value: any): Promise<void> {
    try {
      // @ts-ignore
      if (typeof window === 'undefined' || !window.storage) {
        console.warn('window.storage is not available');
        return;
      }
      // @ts-ignore
      await window.storage.set(key, value);
    } catch (e) {
      console.error(`Error setting ${key}:`, e);
    }
  },
  async delete(key: string): Promise<void> {
    try {
      // @ts-ignore
      if (typeof window === 'undefined' || !window.storage) return;
      // @ts-ignore
      await window.storage.delete(key);
    } catch (e) {
      console.error(`Error deleting ${key}:`, e);
    }
  },
  async list(): Promise<string[]> {
    try {
      // @ts-ignore
      if (typeof window === 'undefined' || !window.storage) return [];
      // @ts-ignore
      return await window.storage.list();
    } catch (e) {
      console.error('Error listing storage:', e);
      return [];
    }
  }
};

// --- Constants & Styles ---

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
    border: `1px solid ${COLORS.border}`,
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

const StatusTag = ({ status }: { status: 'confirmado' | 'recusado' | 'pendente' }) => {
  const config = {
    confirmado: { bg: '#e8f5e9', color: COLORS.green, label: 'Confirmado' },
    recusado: { bg: '#ffebee', color: COLORS.red, label: 'Indisponível' },
    pendente: { bg: COLORS.lightGray, color: COLORS.gray, label: 'Pendente' },
  };
  const { bg, color, label } = config[status];
  return (
    <span style={{ ...styles.statusTag, backgroundColor: bg, color }}>{label}</span>
  );
};

// --- Main App ---

export default function App() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [screen, setScreen] = useState<'landing' | 'login' | 'register' | 'waiting' | 'dashboard'>('landing');
  const [users, setUsers] = useState<User[]>([]);
  const [scales, setScales] = useState<Scale[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeTab, setActiveTab] = useState<'calendar' | 'scales' | 'members' | 'notifs' | 'messages' | 'profile'>('scales');
  
  // Form States
  const [loginEmail, setLoginEmail] = useState('');
  const [loginSenha, setLoginSenha] = useState('');
  const [regNome, setRegNome] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regSenha, setRegSenha] = useState('');
  const [regNasc, setRegNasc] = useState('');
  const [regAreas, setRegAreas] = useState<string[]>([]);
  
  // Candidacy Form States
  const [applyNome, setApplyNome] = useState('');
  const [applyEmail, setApplyEmail] = useState('');
  const [applyMensagem, setApplyMensagem] = useState('');
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

  const AREAS = ["Filmagem — Ministério Geral", "Equipe Íris", "Corte", "Novos Membros"];

  useEffect(() => {
    init();
  }, []);

  const init = async () => {
    try {
      const storedUsers = await Storage.get<User[]>('church-users') || [];
      const storedScales = await Storage.get<Scale[]>('church-schedules') || [];
      const storedNotifs = await Storage.get<Notification[]>('church-notifs') || [];
      const storedPosts = await Storage.get<Post[]>('church-posts') || [];
      const storedMessages = await Storage.get<Message[]>('church-messages') || [];
      const storedCandidaturas = await Storage.get<any[]>('church-candidaturas') || [];
      
      // Seed Admin
      const adminEmail = 'admin@ministerio.com';
      if (!storedUsers.find(u => u.email === adminEmail)) {
        const admin: User = {
          id: 'admin-1',
          nome: 'Administrador',
          email: adminEmail,
          senha: 'admin123',
          papel: 'admin',
          aprovado: true,
          areas: ['Admin'],
          dataNascimento: '1990-01-01',
          dataEntrada: new Date().toISOString(),
        };
        storedUsers.push(admin);
        await Storage.set('church-users', storedUsers);
      }

      setUsers(storedUsers);
      setScales(storedScales);
      setNotifications(storedNotifs);
      setPosts(storedPosts);
      setMessages(storedMessages);
      setCandidaturas(storedCandidaturas);
      
      // Check if user is already logged in (simulated session)
      const session = sessionStorage.getItem('church-session');
      if (session) {
        const u = storedUsers.find(u => u.id === session);
        if (u) {
          setUser(u);
          if (!u.aprovado) setScreen('waiting');
          else setScreen('dashboard');
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setTimeout(() => setLoading(false), 1000);
    }
  };

  const handleLogin = () => {
    const u = users.find(u => u.email === loginEmail && u.senha === loginSenha);
    if (u) {
      setUser(u);
      sessionStorage.setItem('church-session', u.id);
      if (!u.aprovado) setScreen('waiting');
      else setScreen('dashboard');
    } else {
      alert('Email ou senha incorretos.');
    }
  };

  const handleRegister = async () => {
    if (!regNome || !regEmail || !regSenha || regAreas.length === 0) {
      alert('Preencha todos os campos e selecione ao menos uma área.');
      return;
    }
    if (users.find(u => u.email === regEmail)) {
      alert('Email já cadastrado.');
      return;
    }

    const newUser: User = {
      id: Math.random().toString(36).substr(2, 9),
      nome: regNome,
      email: regEmail,
      senha: regSenha,
      dataNascimento: regNasc,
      areas: regAreas,
      aprovado: false,
      papel: 'pending',
      dataEntrada: new Date().toISOString(),
    };

    const updatedUsers = [...users, newUser];
    setUsers(updatedUsers);
    await Storage.set('church-users', updatedUsers);
    
    // Notificação para líderes e admins — Novo cadastro
    const allUsers = await Storage.get<User[]>("church-users") || [];
    const leaders = allUsers.filter((u: any) => u.papel === "leader" || u.papel === "admin");

    const allNotifs = await Storage.get<Notification[]>("church-notifs") || [];

    const newNotifs = leaders.map((leader: any) => ({
      id: Date.now().toString() + leader.id,
      userId: leader.id,
      mensagem: `Novo membro aguardando aprovação: ${newUser.nome}`,
      data: new Date().toISOString(),
      lida: false,
    }));

    await Storage.set("church-notifs", [...allNotifs, ...newNotifs]);
    setNotifications([...allNotifs, ...newNotifs]);

    setUser(newUser);
    setScreen('waiting');
  };

  const handleApply = async () => {
    if (!applyNome || !applyEmail || !applyMensagem) {
      alert('Preencha todos os campos da candidatura.');
      return;
    }

    const candidatura = {
      id: Math.random().toString(36).substr(2, 9),
      nome: applyNome,
      email: applyEmail,
      mensagem: applyMensagem,
      data: new Date().toISOString()
    };

    const updatedCandidaturas = [...candidaturas, candidatura];
    setCandidaturas(updatedCandidaturas);
    await Storage.set('church-candidaturas', updatedCandidaturas);

    // Notificação para líderes e admins — Nova candidatura
    const allUsers = await Storage.get<User[]>("church-users") || [];
    const leaders = allUsers.filter((u: any) => u.papel === "leader" || u.papel === "admin");

    const allNotifs = await Storage.get<Notification[]>("church-notifs") || [];

    const newNotifs = leaders.map((leader: any) => ({
      id: Date.now().toString() + leader.id,
      userId: leader.id,
      mensagem: `Nova candidatura recebida de: ${candidatura.nome} — ${candidatura.email}`,
      data: new Date().toISOString(),
      lida: false,
    }));

    await Storage.set("church-notifs", [...allNotifs, ...newNotifs]);
    setNotifications([...allNotifs, ...newNotifs]);

    setIsApplyModalOpen(false);
    setIsCandidacySuccessOpen(true);
    setApplyNome('');
    setApplyEmail('');
    setApplyMensagem('');
    setTimeout(() => setIsCandidacySuccessOpen(false), 4000);
  };

  const handleLogout = () => {
    setUser(null);
    sessionStorage.removeItem('church-session');
    setScreen('landing');
    setActiveTab('scales');
  };

  const createNotification = async (userId: string, mensagem: string) => {
    const newNotif: Notification = {
      id: Math.random().toString(36).substr(2, 9),
      userId,
      mensagem,
      data: new Date().toISOString(),
      lida: false
    };
    const updatedNotifs = [newNotif, ...notifications];
    setNotifications(updatedNotifs);
    await Storage.set('church-notifs', updatedNotifs);
  };

  const handleApproveUser = async (userId: string, approve: boolean) => {
    const updatedUsers = users.map(u => {
      if (u.id === userId) {
        return { ...u, aprovado: approve, papel: approve ? 'volunteer' : 'pending' as Role };
      }
      return u;
    });
    
    if (!approve) {
      // If recused, we just remove from pending list in UI or delete? Prompt says approve/recuse.
      // Let's just keep them as pending or remove. Let's remove for "recuse".
      const filtered = updatedUsers.filter(u => u.id !== userId);
      setUsers(filtered);
      await Storage.set('church-users', filtered);
    } else {
      setUsers(updatedUsers);
      await Storage.set('church-users', updatedUsers);
      await createNotification(userId, "Seu perfil foi aprovado! Bem-vindo ao ministério.");
    }
  };

  const handlePromoteUser = async (userId: string) => {
    const updatedUsers = users.map(u => {
      if (u.id === userId) {
        const newPapel: Role = u.papel === 'volunteer' ? 'leader' : 'volunteer';
        return { ...u, papel: newPapel };
      }
      return u;
    });
    setUsers(updatedUsers);
    await Storage.set('church-users', updatedUsers);
  };

  const handleMarkNotifRead = async (id: string) => {
    const updated = notifications.map(n => n.id === id ? { ...n, lida: true } : n);
    setNotifications(updated);
    await Storage.set('church-notifs', updated);
  };

  const handleNavigateToMembers = () => {
    setActiveTab('members');
  };

  const handleViewCandidacy = (mensagem: string) => {
    // Extract email from message: "Nova candidatura recebida de: [nome] — [email]"
    const parts = mensagem.split(' — ');
    if (parts.length < 2) return;
    const email = parts[1].trim();
    const cand = candidaturas.find(c => c.email === email);
    if (cand) {
      setSelectedCandidacy(cand);
      setIsCandidacyModalOpen(true);
    }
  };

  const handleSaveScale = async (scaleData: any) => {
    let updatedScales;
    if (editingScale) {
      updatedScales = scales.map(s => s.id === editingScale.id ? { ...s, ...scaleData } : s);
    } else {
      const newScale: Scale = {
        id: Math.random().toString(36).substr(2, 9),
        ...scaleData,
        confirmacoes: {},
        criadoPor: user?.id || ''
      };
      updatedScales = [newScale, ...scales];
      
      // Notify designated volunteers
      const pos = scaleData.posicoes;
      const designated = [pos.corte, pos.camera1, pos.camera2, pos.camera3].filter(id => id);
      for (const vid of designated) {
        const posName = Object.keys(pos).find(key => pos[key] === vid);
        const formattedPos = posName === 'corte' ? 'Corte' : posName?.replace('camera', 'Câmera ');
        await createNotification(vid, `Você foi escalado para: ${scaleData.titulo} em ${new Date(scaleData.data).toLocaleDateString('pt-BR')} às ${scaleData.horario} na posição ${formattedPos}.`);
      }
    }
    setScales(updatedScales);
    await Storage.set('church-schedules', updatedScales);
    setIsScaleModalOpen(false);
    setEditingScale(null);
  };

  const handleDeleteScale = async (id: string) => {
    if (confirm('Deseja excluir esta escala?')) {
      const updated = scales.filter(s => s.id !== id);
      setScales(updated);
      await Storage.set('church-schedules', updated);
    }
  };

  const handleConfirmPresence = async (scaleId: string, status: 'confirmado' | 'recusado') => {
    const updated = scales.map(s => {
      if (s.id === scaleId) {
        return { ...s, confirmacoes: { ...s.confirmacoes, [user!.id]: status } };
      }
      return s;
    });
    setScales(updated);
    await Storage.set('church-schedules', updated);
  };

  const markNotifAsRead = async (id: string) => {
    const updated = notifications.map(n => n.id === id ? { ...n, lida: true } : n);
    setNotifications(updated);
    await Storage.set('church-notifs', updated);
  };

  const handlePost = async (conteudo: string) => {
    const newPost: Post = {
      id: Math.random().toString(36).substr(2, 9),
      autorId: user!.id,
      autorNome: user!.nome,
      autorFoto: user!.fotoPerfil,
      conteudo,
      data: new Date().toISOString(),
      lida: [user!.id],
      likes: []
    };
    const updatedPosts = [newPost, ...posts];
    setPosts(updatedPosts);
    await Storage.set('church-posts', updatedPosts);
    
    // Notify all approved members
    const approvedUsers = users.filter(u => u.aprovado);
    for (const u of approvedUsers) {
      if (u.id !== user!.id) {
        await createNotification(u.id, `Novo aviso de ${user!.nome}: ${conteudo.substring(0, 50)}...`);
      }
    }
  };

  const handleToggleLike = async (postId: string) => {
    if (!user) return;
    const updated = posts.map(p => {
      if (p.id === postId) {
        const likes = p.likes || [];
        const newLikes = likes.includes(user.id) 
          ? likes.filter(id => id !== user.id) 
          : [...likes, user.id];
        return { ...p, likes: newLikes };
      }
      return p;
    });
    setPosts(updated);
    await Storage.set('church-posts', updated);
  };

  const handleDeletePost = async (id: string) => {
    if (confirm('Deseja excluir este post?')) {
      const updated = posts.filter(p => p.id !== id);
      setPosts(updated);
      await Storage.set('church-posts', updated);
    }
  };

  const markPostAsRead = async (id: string) => {
    const updated = posts.map(p => {
      if (p.id === id && !p.lida.includes(user!.id)) {
        return { ...p, lida: [...p.lida, user!.id] };
      }
      return p;
    });
    setPosts(updated);
    await Storage.set('church-posts', updated);
  };

  const handleSendMessage = async (destinatarioId: string, conteudo: string, isSystem = false, senderIdOverride?: string) => {
    const newMessage: Message = {
      id: Math.random().toString(36).substr(2, 9),
      remetenteId: senderIdOverride || user!.id,
      destinatarioId,
      conteudo,
      data: new Date().toISOString(),
      lida: false,
      isSystem
    };
    const updatedMessages = [...messages, newMessage];
    setMessages(updatedMessages);
    await Storage.set('church-messages', updatedMessages);
  };

  const handleReactToMessage = async (messageId: string, emoji: string) => {
    const updatedMessages = messages.map(m => {
      if (m.id === messageId) {
        return { ...m, reacoes: { ...(m.reacoes || {}), [user!.id]: emoji } };
      }
      return m;
    });
    setMessages(updatedMessages);
    await Storage.set('church-messages', updatedMessages);
  };

  const markMessagesAsRead = async (otherUserId: string) => {
    const updated = messages.map(m => {
      if (m.remetenteId === otherUserId && m.destinatarioId === user!.id && !m.lida) {
        return { ...m, lida: true };
      }
      return m;
    });
    setMessages(updated);
    await Storage.set('church-messages', updated);
  };

  const checkAutoFails = async (currentScales: Scale[]) => {
    if (!user) return;
    const now = new Date();
    let changed = false;
    const updatedScales = currentScales.map(s => {
      // Parse data e horário. Formato esperado: data: "YYYY-MM-DD", horario: "HH:MM"
      const [year, month, day] = s.data.split('-').map(Number);
      const [hour, minute] = s.horario.split(':').map(Number);
      const scaleDateTime = new Date(year, month - 1, day, hour, minute);
      
      const diffInMs = scaleDateTime.getTime() - now.getTime();
      const diffInHours = diffInMs / (1000 * 60 * 60);

      // Se falta menos de 24h e ainda está pendente
      let scaleChanged = false;
      const newConfirmacoes = { ...s.confirmacoes };
      
      Object.values(s.posicoes).forEach(userId => {
        if (userId && !newConfirmacoes[userId] && diffInHours < 24 && diffInHours > -1) {
          newConfirmacoes[userId] = 'furou';
          scaleChanged = true;
          changed = true;
          createNotification(userId, `Aviso: Sua escala em "${s.titulo}" foi marcada como 'furou' automaticamente por falta de confirmação em menos de 24h.`);
          
          // Send system message in chat
          const leader = users.find(u => u.papel === 'leader' || u.papel === 'admin');
          if (leader) {
            handleSendMessage(leader.id, "Solicitação de revisão de status enviada", true, userId);
          }
        }
      });
      
      if (scaleChanged) return { ...s, confirmacoes: newConfirmacoes };
      return s;
    });

    if (changed) {
      setScales(updatedScales);
      await Storage.set('church-schedules', updatedScales);
    }
  };

  useEffect(() => {
    if (screen === 'dashboard') {
      checkAutoFails(scales);
    }
  }, [screen, activeTab]);

  // --- Render Helpers ---

  if (loading) {
    return (
      <div style={{ ...styles.container, justifyContent: 'center' }}>
        <motion.div 
          animate={{ rotate: 360 }} 
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
          style={{ width: '40px', height: '40px', border: `4px solid ${COLORS.border}`, borderTopColor: COLORS.black, borderRadius: '50%' }}
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
        <Button onClick={() => setScreen('login')}>Entrar</Button>
        <Button variant="secondary" onClick={() => setScreen('register')}>Criar conta</Button>
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
        <Input label="Email" placeholder="seu@email.com" value={applyEmail} onChange={setApplyEmail} />
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

      <CandidacySuccessModal isOpen={isCandidacySuccessOpen} onClose={() => setIsCandidacySuccessOpen(false)} />
    </div>
  );

  const renderLogin = () => (
    <div style={{ ...styles.appWrapper, padding: '40px 20px' }}>
      <button onClick={() => setScreen('landing')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', color: COLORS.gray, marginBottom: '40px' }}>
        <ChevronLeft size={20} /> Voltar
      </button>
      <div style={{ marginBottom: '20px' }}>
        <LogoFilmka size="large" />
      </div>
      <h2 style={{ fontSize: '28px', fontWeight: 700, marginBottom: '30px' }}>Entrar</h2>
      <Input label="Email" value={loginEmail} onChange={setLoginEmail} placeholder="seu@email.com" />
      <Input label="Senha" type="password" value={loginSenha} onChange={setLoginSenha} placeholder="Sua senha" />
      <Button onClick={handleLogin} style={{ width: '100%', marginTop: '20px' }}>Entrar</Button>
    </div>
  );

  const renderRegister = () => (
    <div style={{ ...styles.appWrapper, padding: '40px 20px' }}>
      <button onClick={() => setScreen('landing')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', color: COLORS.gray, marginBottom: '40px' }}>
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
        Olá, {user?.nome}! Seu cadastro foi recebido. Um líder ou administrador irá revisar e aprovar seu acesso em breve.
      </p>
      <Button variant="secondary" onClick={handleLogout} style={{ width: '100%' }}>Sair</Button>
    </div>
  );

  const renderDashboard = () => {
    const isAdminOrLeader = user?.papel === 'admin' || user?.papel === 'leader';
    const unreadPostsCount = posts.filter(p => user && !p.lida.includes(user.id)).length;
    const unreadNotifsCount = notifications.filter(n => user && n.userId === user.id && !n.lida).length;
    const totalUnreadAvisos = unreadPostsCount + unreadNotifsCount;
    const unreadMessagesCount = messages.filter(m => m.destinatarioId === user?.id && !m.lida).length;
    
    return (
      <div style={styles.appWrapper}>
        <div style={styles.topBar}>
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
              {user?.fotoPerfil ? <img src={user.fotoPerfil} style={{ width: '100%', height: '100%', objectFit: 'cover' }} referrerPolicy="no-referrer" /> : <UserIcon size={20} style={{ margin: '6px' }} />}
            </div>
          </div>
        </div>

        <div style={styles.content}>
          {activeTab === 'calendar' && <CalendarTab scales={scales} user={user} users={users} onOpenRanking={() => setIsRankingModalOpen(true)} />}
          {activeTab === 'scales' && (
            <ScalesTab 
              scales={scales} 
              user={user!} 
              onConfirm={handleConfirmPresence} 
              onEdit={(s: Scale) => { setEditingScale(s); setIsScaleModalOpen(true); }} 
              onDelete={handleDeleteScale} 
            />
          )}
          {activeTab === 'members' && (
            <MembersTab 
              users={users} 
              currentUser={user!} 
              onApprove={handleApproveUser} 
              onPromote={handlePromoteUser} 
            />
          )}
          {activeTab === 'notifs' && (
            <AvisosTab 
              posts={posts} 
              notifications={notifications}
              user={user!} 
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
              currentUser={user!} 
              onSendMessage={handleSendMessage} 
              onMarkRead={markMessagesAsRead} 
              onReact={handleReactToMessage}
              isNewChatModalOpen={isNewChatModalOpen}
              setIsNewChatModalOpen={setIsNewChatModalOpen}
            />
          )}
          {activeTab === 'profile' && (
            <ProfileTab 
              user={user!} 
              users={users} 
              setUsers={setUsers} 
              setUser={setUser} 
              onLogout={handleLogout} 
            />
          )}
        </div>

        <div style={styles.bottomNav}>
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
          {user?.papel !== 'pending' && (
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
          ranking={users
            .filter(u => u.aprovado)
            .map(u => {
              const uScales = scales.filter(s => Object.values(s.posicoes).includes(u.id));
              return {
                id: u.id,
                nome: u.nome,
                serviu: uScales.filter(s => s.confirmacoes[u.id] === 'confirmado').length,
                furou: uScales.filter(s => s.confirmacoes[u.id] === 'furou' || s.confirmacoes[u.id] === 'recusado').length,
                pendente: uScales.filter(s => !s.confirmacoes[u.id]).length
              };
            })
            .sort((a, b) => {
              if (b.serviu !== a.serviu) return b.serviu - a.serviu;
              if (a.furou !== b.furou) return a.furou - b.furou;
              if (a.pendente !== b.pendente) return a.pendente - b.pendente;
              return a.nome.localeCompare(b.nome);
            })
          }
        />
      </div>
    );
  };

  return (
    <div style={styles.container}>
      {screen === 'landing' && renderLanding()}
      {screen === 'login' && renderLogin()}
      {screen === 'register' && renderRegister()}
      {screen === 'waiting' && renderWaiting()}
      {screen === 'dashboard' && renderDashboard()}
    </div>
  );
}

// --- Tab Components ---

const CalendarTab = ({ scales, user, users, onOpenRanking }: { scales: Scale[], user: User | null, users: User[], onOpenRanking: () => void }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();
  
  const monthName = currentDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const blanks = Array.from({ length: firstDayOfMonth }, (_, i) => i);

  const userScales = scales.filter(s => {
    const pos = s.posicoes;
    return [pos.corte, pos.camera1, pos.camera2, pos.camera3].includes(user?.id || '');
  });

  const isDayEscalated = (day: number) => {
    const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return userScales.some(s => s.data === dateStr);
  };

  // Stats
  const totalParticipations = userScales.filter(s => s.confirmacoes[user?.id || ''] === 'confirmado').length;
  const totalFails = userScales.filter(s => s.confirmacoes[user?.id || ''] === 'furou' || s.confirmacoes[user?.id || ''] === 'recusado').length;
  const totalPending = userScales.filter(s => !s.confirmacoes[user?.id || '']).length;

  // Ranking
  const ranking = users
    .filter(u => u.aprovado)
    .map(u => {
      const uScales = scales.filter(s => Object.values(s.posicoes).includes(u.id));
      return {
        id: u.id,
        nome: u.nome,
        serviu: uScales.filter(s => s.confirmacoes[u.id] === 'confirmado').length,
        furou: uScales.filter(s => s.confirmacoes[u.id] === 'furou' || s.confirmacoes[u.id] === 'recusado').length,
        pendente: uScales.filter(s => !s.confirmacoes[u.id]).length
      };
    })
    .sort((a, b) => {
      if (b.serviu !== a.serviu) return b.serviu - a.serviu;
      if (a.furou !== b.furou) return a.furou - b.furou;
      if (a.pendente !== b.pendente) return a.pendente - b.pendente;
      return a.nome.localeCompare(b.nome);
    });

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

const AvisosTab = ({ posts, notifications, user, users, onPost, onDeletePost, onMarkRead, onMarkNotifRead, onToggleLike, onNavigateToMembers, onViewCandidacy }: any) => {
  const [activeSubTab, setActiveSubTab] = useState<'posts' | 'notifs'>('posts');
  const [newPost, setNewPost] = useState('');
  const isAdminOrLeader = user?.papel === 'admin' || user?.papel === 'leader';

  const sortedPosts = [...posts].sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
  
  const unreadPostsCount = posts.filter((p: any) => !p.lida.includes(user.id)).length;
  const unreadNotifsCount = notifications.filter((n: any) => n.userId === user.id && !n.lida).length;

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
              borderBottom: activeSubTab === 'posts' ? `2px solid ${COLORS.black}` : 'none',
              background: 'none',
              border: 'none',
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
              borderBottom: activeSubTab === 'notifs' ? `2px solid ${COLORS.black}` : 'none',
              background: 'none',
              border: 'none',
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
            {sortedPosts.map((post) => {
              const isRead = post.lida.includes(user.id);
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
                      {isAdminOrLeader && post.autorId === user.id && (
                        <button onClick={(e) => { e.stopPropagation(); onDeletePost(post.id); }} style={{ background: 'none', border: 'none', color: COLORS.gray, cursor: 'pointer' }}>
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                    <p style={{ fontSize: '15px', lineHeight: '1.4', color: COLORS.black }}>{post.conteudo}</p>
                    <LikeButton post={post} currentUserId={user.id} onToggle={onToggleLike} />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <NotifsTab 
          notifications={notifications} 
          user={user} 
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

const ScalesTab = ({ scales, user, onConfirm, onEdit, onDelete }: { scales: Scale[], user: User, onConfirm: any, onEdit: any, onDelete: any }) => {
  const isAdminOrLeader = user?.papel === 'admin' || user?.papel === 'leader';
  const today = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  
  const upcomingScales = scales.filter(s => new Date(s.data) >= new Date(new Date().setHours(0,0,0,0))).sort((a,b) => new Date(a.data).getTime() - new Date(b.data).getTime());
  const pastScales = scales.filter(s => new Date(s.data) < new Date(new Date().setHours(0,0,0,0))).sort((a,b) => new Date(b.data).getTime() - new Date(a.data).getTime());

  return (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>
      <div style={{ marginBottom: '24px' }}>
        <p style={{ color: COLORS.gray, fontSize: '14px' }}>{today}</p>
        <h2 style={{ fontSize: '24px', fontWeight: 800 }}>Olá, {user?.nome.split(' ')[0]}!</h2>
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

      <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '16px' }}>Próximas Escalas</h3>
      {upcomingScales.length === 0 ? (
        <p style={{ textAlign: 'center', color: COLORS.gray, padding: '40px 0' }}>Nenhuma escala agendada.</p>
      ) : (
        <VirtualList items={upcomingScales} renderItem={(s: Scale) => (
          <ScaleCard 
            key={s.id} 
            scale={s} 
            user={user} 
            onConfirm={onConfirm}
            onEdit={isAdminOrLeader ? () => onEdit(s) : undefined}
            onDelete={isAdminOrLeader ? () => onDelete(s.id) : undefined}
          />
        )} />
      )}

      {pastScales.length > 0 && (
        <>
          <h3 style={{ fontSize: '18px', fontWeight: 700, margin: '24px 0 16px' }}>Histórico</h3>
          <div style={{ opacity: 0.6 }}>
            {pastScales.map(s => (
              <ScaleCard key={s.id} scale={s} user={user} isPast />
            ))}
          </div>
        </>
      )}
    </div>
  );
};

const MembersTab = ({ users, currentUser, onApprove, onPromote }: { users: User[], currentUser: User, onApprove: any, onPromote: any }) => {
  const pendingUsers = users.filter(u => !u.aprovado);
  const approvedUsers = users.filter(u => u.aprovado);

  return (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>
      {pendingUsers.length > 0 && (
        <div style={{ marginBottom: '30px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '12px', color: COLORS.red }}>Pendentes ({pendingUsers.length})</h3>
          {pendingUsers.map(u => (
            <div key={u.id} style={styles.card}>
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
                <Button variant="success" style={{ flex: 1, padding: '8px' }} onClick={() => onApprove(u.id, true)}>Aprovar</Button>
                <Button variant="outline" style={{ flex: 1, padding: '8px', color: COLORS.red }} onClick={() => onApprove(u.id, false)}>Recusar</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '12px' }}>Membros Aprovados ({approvedUsers.length})</h3>
      {approvedUsers.map(u => (
        <div key={u.id} style={{ ...styles.card, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p style={{ fontWeight: 600 }}>{u.nome}</p>
            <p style={{ fontSize: '12px', color: COLORS.gray }}>{u.papel === 'admin' ? 'Administrador' : u.papel === 'leader' ? 'Líder' : 'Voluntário'}</p>
          </div>
          {currentUser?.papel === 'admin' && u.id !== currentUser.id && (
            <Button variant="outline" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => onPromote(u.id)}>
              {u.papel === 'volunteer' ? 'Tornar Líder' : 'Tornar Voluntário'}
            </Button>
          )}
        </div>
      ))}
    </div>
  );
};

const NotifsTab = ({ notifications, user, onMarkAsRead, onNavigateToMembers, onViewCandidacy }: { notifications: Notification[], user: User, onMarkAsRead: any, onNavigateToMembers: any, onViewCandidacy: any }) => {
  const myNotifs = notifications.filter(n => n.userId === user?.id);
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

const ProfileTab = ({ user, users, setUsers, setUser, onLogout }: { user: User, users: User[], setUsers: any, setUser: any, onLogout: any }) => {
  const handlePhotoChange = async () => {
    const url = prompt('Insira a URL da nova foto de perfil:');
    if (url) {
      const updatedUsers = users.map(u => u.id === user?.id ? { ...u, fotoPerfil: url } : u);
      setUsers(updatedUsers);
      setUser({ ...user!, fotoPerfil: url });
      await Storage.set('church-users', updatedUsers);
    }
  };

  return (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>
      <div style={{ ...styles.card, backgroundColor: COLORS.black, color: 'white', textAlign: 'center', padding: '30px 20px' }}>
        <div style={{ position: 'relative', width: '100px', height: '100px', margin: '0 auto 16px' }}>
          <div style={{ width: '100%', height: '100%', borderRadius: '50%', backgroundColor: COLORS.gray, overflow: 'hidden', border: '3px solid rgba(255,255,255,0.2)' }}>
            {user?.fotoPerfil ? <img src={user.fotoPerfil} style={{ width: '100%', height: '100%', objectFit: 'cover' }} referrerPolicy="no-referrer" /> : <UserIcon size={50} style={{ margin: '22px' }} />}
          </div>
          <button onClick={handlePhotoChange} style={{ position: 'absolute', bottom: 0, right: 0, backgroundColor: COLORS.white, color: COLORS.black, border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 10px rgba(0,0,0,0.2)' }}>
            <Camera size={16} />
          </button>
        </div>
        <h2 style={{ fontSize: '22px', fontWeight: 700 }}>{user?.nome}</h2>
        <p style={{ opacity: 0.7, fontSize: '14px', marginTop: '4px' }}>{user?.areas.join(' • ')}</p>
      </div>

      <div style={styles.card}>
        <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '16px' }}>Informações</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: COLORS.gray }}>Email</span>
            <span>{user?.email}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: COLORS.gray }}>Função</span>
            <span style={{ textTransform: 'capitalize' }}>{user?.papel === 'admin' ? 'Administrador' : user?.papel === 'leader' ? 'Líder' : 'Voluntário'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: COLORS.gray }}>Membro desde</span>
            <span>{new Date(user?.dataEntrada || '').toLocaleDateString('pt-BR')}</span>
          </div>
        </div>
      </div>

      <Button variant="outline" style={{ width: '100%', color: COLORS.red, borderColor: COLORS.red }} onClick={onLogout}>
        <LogOut size={20} /> Sair da conta
      </Button>
    </div>
  );
};

// --- Sub-components ---

const ScaleCard = ({ scale, user, onConfirm, onEdit, onDelete, isPast = false }: any) => {
  const [isHoveredConfirm, setIsHoveredConfirm] = useState(false);
  const [isHoveredDecline, setIsHoveredDecline] = useState(false);

  const myPos = Object.keys(scale.posicoes).find(key => scale.posicoes[key] === user.id);
  const formattedPos = myPos === 'corte' ? 'Corte' : myPos?.replace('camera', 'Câmera ');
  const myStatus = scale.confirmacoes[user.id] || 'pendente';

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

import React, { useState, useEffect, createContext, useContext, useMemo, Component } from 'react';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  User as FirebaseUser 
} from 'firebase/auth';
import { 
  collection, 
  doc, 
  onSnapshot, 
  setDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  serverTimestamp,
  Timestamp,
  getDoc,
  getDocs,
  writeBatch
} from 'firebase/firestore';
import { 
  LayoutDashboard, 
  FileText, 
  CheckCircle, 
  User as UserIcon, 
  LogOut, 
  Plus, 
  Search, 
  ChevronLeft, 
  ChevronRight, 
  Clock, 
  AlertCircle,
  MoreVertical,
  Printer,
  Download,
  Trash2,
  Edit,
  X,
  Check,
  Image as ImageIcon,
  BookOpen,
  Upload,
  Menu
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import { auth, db, OperationType, handleFirestoreError } from './lib/firebase';
import { cn } from './lib/utils';

// --- Types ---

interface UserProfile {
  uid: string;
  nim?: string;
  name: string;
  email: string;
  role: 'admin' | 'student';
  status: 'active' | 'inactive';
  createdAt: any;
}

interface ExamPackage {
  id: string;
  title: string;
  type: 'multiple-choice' | 'essay';
  optionsCount?: number;
  duration: number;
  questionCount: number;
  status: 'active' | 'inactive' | 'running';
  description?: string;
  shuffle: boolean;
  createdAt: any;
}

interface Passage {
  id: string;
  packageId: string;
  title: string;
  content: string;
}

interface Question {
  id: string;
  packageId: string;
  passageId?: string;
  text: string;
  imageUrl?: string;
  options?: Record<string, string>;
  correctKey?: string;
  weight: number;
}

interface ExamResult {
  id: string;
  studentUid: string;
  studentNim: string;
  studentName: string;
  packageId: string;
  packageTitle: string;
  score: number;
  correctCount: number;
  totalQuestions: number;
  answers: Record<string, string>;
  startTime: any;
  endTime: any;
}

// --- Context ---

interface AuthContextType {
  user: FirebaseUser | null;
  profile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  isAdmin: false
});

const useAuth = () => useContext(AuthContext);

// --- Main App ---

const ConfirmModal = ({ 
  isOpen, 
  title, 
  message, 
  onConfirm, 
  onCancel,
  confirmText = "Hapus",
  cancelText = "Batal",
  variant = "danger"
}: { 
  isOpen: boolean; 
  title: string; 
  message: string; 
  onConfirm: () => void; 
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
  variant?: "danger" | "primary"
}) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
      >
        <div className="p-6">
          <h3 className="text-xl font-bold text-gray-900 mb-2">{title}</h3>
          <p className="text-gray-600">{message}</p>
        </div>
        <div className="bg-gray-50 px-6 py-4 flex justify-end gap-3">
          <button 
            onClick={onCancel}
            className="px-4 py-2 text-sm font-bold text-gray-500 hover:bg-gray-200 rounded-lg transition-colors"
          >
            {cancelText}
          </button>
          <button 
            onClick={onConfirm}
            className={cn(
              "px-6 py-2 text-sm font-bold text-white rounded-lg transition-colors shadow-sm",
              variant === "danger" ? "bg-rose-600 hover:bg-rose-700" : "bg-[#7B1C2A] hover:bg-[#9E2D3F]"
            )}
          >
            {confirmText}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

const Toast = ({ message, type = 'success', onClose }: { message: string, type?: 'success' | 'error', onClose: () => void }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 50 }}
      className={cn(
        "fixed bottom-8 left-1/2 -translate-x-1/2 z-[200] px-6 py-3 rounded-xl shadow-xl text-white font-bold text-sm flex items-center gap-3",
        type === 'success' ? "bg-green-600" : "bg-rose-600"
      )}
    >
      {type === 'success' ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
      {message}
    </motion.div>
  );
};

const Badge = ({ children, variant = 'default' }: { children: React.ReactNode, variant?: 'default' | 'green' | 'red' | 'blue' | 'gold' | 'maroon' }) => {
  const variants = {
    default: 'bg-gray-100 text-gray-600',
    green: 'bg-green-100 text-green-700',
    red: 'bg-red-100 text-red-700',
    blue: 'bg-blue-100 text-blue-700',
    gold: 'bg-amber-100 text-amber-700',
    maroon: 'bg-rose-100 text-rose-900'
  };
  return (
    <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', variants[variant])}>
      {children}
    </span>
  );
};

// --- Views ---

const LoginView = () => {
  const [loginMode, setLoginMode] = useState<'google' | 'email'>('google');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleGoogleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: any) {
      console.error("Email login failed", err);
      setError('Email atau password salah.');
    }
  };

  return (
    <div className="min-h-screen bg-[#f7f2f3] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl shadow-xl border border-[#e0d0d3] w-full max-w-md overflow-hidden"
      >
        <div className="bg-[#5A1220] p-8 text-center">
          <div className="text-white/70 text-sm mb-1">Universitas Harkat Negeri</div>
          <h1 className="text-white text-2xl font-bold">Sistem Ujian Online</h1>
          <div className="text-white/40 text-xs mt-2">Masuk untuk mengakses ujian</div>
        </div>
        <div className="p-8">
          {loginMode === 'google' ? (
            <div className="space-y-4">
              <button 
                onClick={handleGoogleLogin}
                className="w-full flex items-center justify-center gap-3 bg-white border border-gray-300 py-3 rounded-xl font-medium hover:bg-gray-50 transition-all shadow-sm"
              >
                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="Google" />
                Masuk dengan Google
              </button>
              <button 
                onClick={() => setLoginMode('email')}
                className="w-full text-xs text-gray-500 hover:text-[#7B1C2A] font-medium transition-colors"
              >
                Atau masuk dengan Email/Password
              </button>
            </div>
          ) : (
            <form onSubmit={handleEmailLogin} className="space-y-4">
              {error && <div className="p-3 bg-red-50 text-red-600 text-xs rounded-lg border border-red-100">{error}</div>}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Email</label>
                <input 
                  type="email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#7B1C2A]/20 outline-none text-sm" 
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Password</label>
                <input 
                  type="password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#7B1C2A]/20 outline-none text-sm" 
                />
              </div>
              <button 
                type="submit"
                className="w-full bg-[#7B1C2A] text-white py-3 rounded-xl font-bold hover:bg-[#9E2D3F] transition-all shadow-sm"
              >
                Masuk
              </button>
              <button 
                type="button"
                onClick={() => setLoginMode('google')}
                className="w-full text-xs text-gray-500 hover:text-[#7B1C2A] font-medium transition-colors"
              >
                Kembali ke Login Google
              </button>
            </form>
          )}
          <div className="mt-6 text-center text-xs text-gray-400">
            Pastikan menggunakan akun yang telah terdaftar oleh admin.
          </div>
        </div>
      </motion.div>
    </div>
  );
};

const AdminDashboard = () => {
  const [stats, setStats] = useState({
    totalStudents: 0,
    activePackages: 0,
    completedExams: 0,
    avgScore: 0
  });

  const [recentResults, setRecentResults] = useState<ExamResult[]>([]);

  useEffect(() => {
    const unsubUsers = onSnapshot(query(collection(db, 'users'), where('role', '==', 'student')), (snap) => {
      setStats(prev => ({ ...prev, totalStudents: snap.size }));
    }, (err) => handleFirestoreError(err, OperationType.GET, 'users'));

    const unsubPackages = onSnapshot(query(collection(db, 'examPackages'), where('status', '==', 'active')), (snap) => {
      setStats(prev => ({ ...prev, activePackages: snap.size }));
    }, (err) => handleFirestoreError(err, OperationType.GET, 'examPackages'));

    const unsubResults = onSnapshot(query(collection(db, 'examResults'), orderBy('endTime', 'desc')), (snap) => {
      const results = snap.docs.map(d => ({ id: d.id, ...d.data() } as ExamResult));
      setRecentResults(results.slice(0, 5));
      setStats(prev => ({ 
        ...prev, 
        completedExams: snap.size,
        avgScore: snap.size > 0 ? results.reduce((acc, r) => acc + r.score, 0) / snap.size : 0
      }));
    }, (err) => handleFirestoreError(err, OperationType.GET, 'examResults'));

    return () => {
      unsubUsers();
      unsubPackages();
      unsubResults();
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Mahasiswa', value: stats.totalStudents, sub: 'Terdaftar', color: 'border-[#7B1C2A]' },
          { label: 'Paket Soal Aktif', value: stats.activePackages, sub: 'Siap dikerjakan', color: 'border-[#C9963A]' },
          { label: 'Ujian Selesai', value: stats.completedExams, sub: 'Total pengerjaan', color: 'border-green-600' },
          { label: 'Rata-rata Nilai', value: stats.avgScore.toFixed(1), sub: 'Seluruh paket', color: 'border-blue-600' },
        ].map((s, i) => (
          <div key={i} className={cn("bg-white p-5 rounded-xl border border-[#e0d0d3] border-t-4 shadow-sm", s.color)}>
            <div className="text-xs text-gray-500 font-medium uppercase tracking-wider">{s.label}</div>
            <div className="text-3xl font-bold text-gray-900 mt-1">{s.value}</div>
            <div className="text-[11px] text-gray-400 mt-1">{s.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-[#e0d0d3] shadow-sm overflow-hidden">
          <div className="p-4 border-bottom border-[#e0d0d3] flex items-center justify-between">
            <h3 className="font-bold text-sm">Hasil Ujian Terbaru</h3>
            <button className="text-xs text-[#7B1C2A] font-medium">Lihat Semua</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-[10px] uppercase font-bold tracking-wider">
                <tr>
                  <th className="px-4 py-3 text-left">Mahasiswa</th>
                  <th className="px-4 py-3 text-left">Paket</th>
                  <th className="px-4 py-3 text-left">Skor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentResults.map((r) => (
                  <tr key={r.id} className="hover:bg-rose-50/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{r.studentName}</div>
                      <div className="text-[10px] text-gray-400">{r.studentNim}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{r.packageTitle}</td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        "font-bold",
                        r.score >= 75 ? "text-green-600" : r.score >= 50 ? "text-amber-600" : "text-red-600"
                      )}>
                        {r.score.toFixed(0)}
                      </span>
                    </td>
                  </tr>
                ))}
                {recentResults.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-gray-400 italic">Belum ada data hasil ujian</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-[#e0d0d3] shadow-sm overflow-hidden">
          <div className="p-4 border-bottom border-[#e0d0d3]">
            <h3 className="font-bold text-sm">Informasi Sistem</h3>
          </div>
          <div className="p-6 space-y-4">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg bg-rose-50 flex items-center justify-center text-[#7B1C2A] shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-bold text-gray-900">Panduan Admin</div>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                  Kelola paket soal melalui menu "Paket Soal". Anda dapat mengimpor soal dari Excel atau menambahkannya secara manual. Pastikan status paket adalah "Aktif" agar mahasiswa dapat mengerjakan.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600 shrink-0">
                <UserIcon className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-bold text-gray-900">Manajemen Akun</div>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                  Daftarkan mahasiswa baru melalui menu "Pengaturan Akun". Mahasiswa hanya dapat login jika status akun mereka adalah "Aktif".
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const AdminQuestions = ({ packageId, onBack }: { packageId: string, onBack: () => void }) => {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [passages, setPassages] = useState<Passage[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [showPassageModal, setShowPassageModal] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [editingPassage, setEditingPassage] = useState<Passage | null>(null);
  const [pkg, setPkg] = useState<ExamPackage | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string, type: 'question' | 'passage' } | null>(null);
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    const unsubPkg = onSnapshot(doc(db, 'examPackages', packageId), (snap) => {
      if (snap.exists()) setPkg({ id: snap.id, ...snap.data() } as ExamPackage);
    }, (err) => handleFirestoreError(err, OperationType.GET, `examPackages/${packageId}`));

    const unsubQs = onSnapshot(query(collection(db, 'examPackages', packageId, 'questions')), (snap) => {
      setQuestions(snap.docs.map(d => ({ id: d.id, ...d.data() } as Question)));
    }, (err) => handleFirestoreError(err, OperationType.GET, `examPackages/${packageId}/questions`));

    const unsubPassages = onSnapshot(query(collection(db, 'examPackages', packageId, 'passages')), (snap) => {
      setPassages(snap.docs.map(d => ({ id: d.id, ...d.data() } as Passage)));
    }, (err) => handleFirestoreError(err, OperationType.GET, `examPackages/${packageId}/passages`));

    return () => { unsubPkg(); unsubQs(); unsubPassages(); };
  }, [packageId]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    const options: Record<string, string> = {};
    if (pkg?.type === 'multiple-choice') {
      const count = pkg.optionsCount || 4;
      for (let i = 0; i < count; i++) {
        const key = String.fromCharCode(65 + i);
        options[key] = formData.get(`option${key}`) as string;
      }
    }

    const data = {
      packageId,
      passageId: formData.get('passageId') as string || null,
      text: formData.get('text') as string,
      imageUrl: formData.get('imageUrl') as string || null,
      correctKey: formData.get('correctKey') as string || null,
      weight: parseInt(formData.get('weight') as string) || 1,
      options: pkg?.type === 'multiple-choice' ? options : null
    };

    try {
      if (editingQuestion) {
        await updateDoc(doc(db, 'examPackages', packageId, 'questions', editingQuestion.id), data);
        setToast({ message: "Soal berhasil diperbarui.", type: 'success' });
      } else {
        await addDoc(collection(db, 'examPackages', packageId, 'questions'), data);
        await updateDoc(doc(db, 'examPackages', packageId), {
          questionCount: questions.length + 1
        });
        setToast({ message: "Soal berhasil ditambahkan.", type: 'success' });
      }
      setShowModal(false);
      setEditingQuestion(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `examPackages/${packageId}/questions`);
    }
  };

  const handlePassageSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = {
      packageId,
      title: formData.get('title') as string,
      content: formData.get('content') as string
    };

    try {
      if (editingPassage) {
        await updateDoc(doc(db, 'examPackages', packageId, 'passages', editingPassage.id), data);
        setToast({ message: "Teks bacaan berhasil diperbarui.", type: 'success' });
      } else {
        await addDoc(collection(db, 'examPackages', packageId, 'passages'), data);
        setToast({ message: "Teks bacaan berhasil ditambahkan.", type: 'success' });
      }
      setShowPassageModal(false);
      setEditingPassage(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `examPackages/${packageId}/passages`);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    const { id, type } = confirmDelete;
    try {
      if (type === 'question') {
        await deleteDoc(doc(db, 'examPackages', packageId, 'questions', id));
        await updateDoc(doc(db, 'examPackages', packageId), {
          questionCount: Math.max(0, questions.length - 1)
        });
        setToast({ message: "Soal berhasil dihapus.", type: 'success' });
      } else {
        await deleteDoc(doc(db, 'examPackages', packageId, 'passages', id));
        setToast({ message: "Teks bacaan berhasil dihapus.", type: 'success' });
      }
      setConfirmDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `examPackages/${packageId}/${type}s/${id}`);
    }
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !pkg) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws) as any[];

        const batch = writeBatch(db);
        let count = 0;

        for (const row of data) {
          const qData: any = {
            packageId,
            text: row.Pertanyaan || row.Question || row.text,
            weight: parseInt(row.Bobot || row.Weight || row.weight) || 1,
            imageUrl: row.Gambar || row.ImageUrl || row.imageUrl || null,
            passageId: row.PassageId || row.passageId || null,
          };

          if (pkg.type === 'multiple-choice') {
            const options: Record<string, string> = {};
            const optCount = pkg.optionsCount || 4;
            for (let i = 0; i < optCount; i++) {
              const key = String.fromCharCode(65 + i);
              options[key] = row[key] || row[`Pilihan ${key}`] || '';
            }
            qData.options = options;
            qData.correctKey = (row.Kunci || row.CorrectKey || row.correctKey || '').toString().toUpperCase();
          }

          const newDocRef = doc(collection(db, 'examPackages', packageId, 'questions'));
          batch.set(newDocRef, qData);
          count++;
        }

        await batch.commit();
        await updateDoc(doc(db, 'examPackages', packageId), {
          questionCount: questions.length + count
        });
        setToast({ message: `Berhasil mengimpor ${count} soal!`, type: 'success' });
      } catch (error) {
        console.error("Excel import failed", error);
        setToast({ message: "Gagal mengimpor soal. Pastikan format Excel benar.", type: 'error' });
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleDownloadTemplate = () => {
    const template = [
      {
        Pertanyaan: "Apa ibukota Indonesia?",
        Bobot: 1,
        A: "Jakarta",
        B: "Bandung",
        C: "Surabaya",
        D: "Medan",
        E: "Makassar",
        Kunci: "A",
        Gambar: "",
        PassageId: ""
      }
    ];
    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template Soal");
    XLSX.writeFile(wb, "template_soal_siujian.xlsx");
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div>
          <h2 className="text-lg font-bold text-gray-900">{pkg?.title}</h2>
          <div className="text-xs text-gray-500">
            Tipe: {pkg?.type === 'multiple-choice' ? 'Pilihan Ganda' : 'Essay'} • {questions.length} soal
          </div>
        </div>
        <div className="ml-auto flex gap-3">
          <button 
            onClick={handleDownloadTemplate}
            className="flex items-center gap-2 bg-white text-blue-600 border border-blue-600 px-4 py-2 rounded-lg text-sm font-bold hover:bg-blue-50 transition-colors"
          >
            <Download className="w-4 h-4" />
            Template Excel
          </button>
          <label className="flex items-center gap-2 bg-white text-green-600 border border-green-600 px-4 py-2 rounded-lg text-sm font-bold hover:bg-green-50 transition-colors cursor-pointer">
            <Upload className="w-4 h-4" />
            Import Excel
            <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleImportExcel} />
          </label>
          <button 
            onClick={() => { setEditingPassage(null); setShowPassageModal(true); }}
            className="flex items-center gap-2 bg-white text-[#7B1C2A] border border-[#7B1C2A] px-4 py-2 rounded-lg text-sm font-bold hover:bg-rose-50 transition-colors"
          >
            <BookOpen className="w-4 h-4" />
            Kelola Bacaan
          </button>
          <button 
            onClick={() => { setEditingQuestion(null); setShowModal(true); }}
            className="flex items-center gap-2 bg-[#7B1C2A] text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-[#9E2D3F] transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Tambah Soal
          </button>
        </div>
      </div>

      {/* Passages Section */}
      {passages.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-gray-700 flex items-center gap-2">
            <BookOpen className="w-4 h-4" />
            Daftar Teks Bacaan
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {passages.map(p => (
              <div key={p.id} className="bg-rose-50/50 p-4 rounded-xl border border-rose-100 flex justify-between items-start">
                <div>
                  <div className="font-bold text-sm text-[#7B1C2A]">{p.title}</div>
                  <div className="text-xs text-gray-500 line-clamp-1 mt-1">{p.content}</div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => { setEditingPassage(p); setShowPassageModal(true); }} className="p-1.5 text-blue-600 hover:bg-white rounded-lg">
                    <Edit className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => setConfirmDelete({ id: p.id, type: 'passage' })} className="p-1.5 text-red-600 hover:bg-white rounded-lg">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6">
        {questions.map((q, i) => (
          <div key={q.id} className="bg-white p-6 rounded-xl border border-[#e0d0d3] shadow-sm">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="text-xs font-bold text-[#7B1C2A] uppercase tracking-widest">Soal {i + 1}</div>
                {q.passageId && (
                  <Badge variant="gold">
                    <BookOpen className="w-3 h-3 mr-1" />
                    {passages.find(p => p.id === q.passageId)?.title}
                  </Badge>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setEditingQuestion(q); setShowModal(true); }} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                  <Edit className="w-4 h-4" />
                </button>
                <button onClick={() => setConfirmDelete({ id: q.id, type: 'question' })} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            
            {q.imageUrl && (
              <img src={q.imageUrl} alt="Soal" className="max-h-48 rounded-lg mb-4 object-contain bg-gray-50 p-2 border border-gray-100" referrerPolicy="no-referrer" />
            )}
            
            <p className="text-gray-800 mb-4 whitespace-pre-wrap">{q.text}</p>
            
            {pkg?.type === 'multiple-choice' && q.options && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {Object.entries(q.options).map(([key, val]) => (
                  <div key={key} className={cn(
                    "p-3 rounded-lg border text-sm flex items-center gap-3",
                    q.correctKey === key ? "bg-green-50 border-green-200 text-green-800" : "bg-gray-50 border-gray-100 text-gray-600"
                  )}>
                    <div className={cn(
                      "w-6 h-6 rounded-full flex items-center justify-center font-bold text-[10px]",
                      q.correctKey === key ? "bg-green-600 text-white" : "bg-gray-200 text-gray-400"
                    )}>{key}</div>
                    {val}
                  </div>
                ))}
              </div>
            )}
            {pkg?.type === 'essay' && (
              <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-700 italic">
                Tipe Essay - Jawaban akan diperiksa secara manual.
              </div>
            )}
          </div>
        ))}
        {questions.length === 0 && (
          <div className="bg-white p-12 rounded-xl border border-[#e0d0d3] text-center text-gray-400 italic">
            Belum ada soal dalam paket ini. Klik "Tambah Soal" untuk memulai.
          </div>
        )}
      </div>

      {/* Question Modal */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden max-h-[90vh] flex flex-col"
            >
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                <h3 className="font-bold text-gray-900">{editingQuestion ? 'Edit Soal' : 'Tambah Soal Baru'}</h3>
                <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Teks Bacaan (Opsional)</label>
                    <select name="passageId" defaultValue={editingQuestion?.passageId || ''} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#7B1C2A]/20 outline-none bg-white">
                      <option value="">Tanpa Bacaan</option>
                      {passages.map(p => (
                        <option key={p.id} value={p.id}>{p.title}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">URL Gambar (Opsional)</label>
                    <input name="imageUrl" defaultValue={editingQuestion?.imageUrl} type="url" className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#7B1C2A]/20 outline-none" placeholder="https://example.com/image.jpg" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Pertanyaan</label>
                    <textarea name="text" defaultValue={editingQuestion?.text} required className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#7B1C2A]/20 outline-none h-24 resize-none" placeholder="Ketikkan pertanyaan di sini..." />
                  </div>
                </div>

                {pkg?.type === 'multiple-choice' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      {Array.from({ length: pkg.optionsCount || 4 }).map((_, idx) => {
                        const key = String.fromCharCode(65 + idx);
                        return (
                          <div key={key}>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Pilihan {key}</label>
                            <input name={`option${key}`} defaultValue={editingQuestion?.options?.[key]} required type="text" className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#7B1C2A]/20 outline-none" />
                          </div>
                        );
                      })}
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Kunci Jawaban</label>
                        <select name="correctKey" defaultValue={editingQuestion?.correctKey || 'A'} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#7B1C2A]/20 outline-none bg-white">
                          {Array.from({ length: pkg.optionsCount || 4 }).map((_, idx) => {
                            const key = String.fromCharCode(65 + idx);
                            return <option key={key} value={key}>{key}</option>;
                          })}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Bobot Nilai</label>
                        <input name="weight" defaultValue={editingQuestion?.weight || 1} type="number" className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#7B1C2A]/20 outline-none" />
                      </div>
                    </div>
                  </div>
                )}

                {pkg?.type === 'essay' && (
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Bobot Nilai</label>
                    <input name="weight" defaultValue={editingQuestion?.weight || 1} type="number" className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#7B1C2A]/20 outline-none" />
                  </div>
                )}

                <div className="pt-4 flex justify-end gap-3 shrink-0">
                  <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm font-bold text-gray-500 hover:bg-gray-100 rounded-lg transition-colors">Batal</button>
                  <button type="submit" className="px-6 py-2 bg-[#7B1C2A] text-white text-sm font-bold rounded-lg hover:bg-[#9E2D3F] transition-colors shadow-sm">Simpan Soal</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Passage Modal */}
      <AnimatePresence>
        {showPassageModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                <h3 className="font-bold text-gray-900">{editingPassage ? 'Edit Teks Bacaan' : 'Tambah Teks Bacaan'}</h3>
                <button onClick={() => setShowPassageModal(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handlePassageSubmit} className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Judul Bacaan</label>
                  <input name="title" defaultValue={editingPassage?.title} required type="text" className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#7B1C2A]/20 outline-none" placeholder="Contoh: Teks Narasi 1" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Isi Bacaan</label>
                  <textarea name="content" defaultValue={editingPassage?.content} required className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#7B1C2A]/20 outline-none h-64 resize-none" placeholder="Ketikkan teks bacaan di sini..." />
                </div>
                <div className="pt-4 flex justify-end gap-3">
                  <button type="button" onClick={() => setShowPassageModal(false)} className="px-4 py-2 text-sm font-bold text-gray-500 hover:bg-gray-100 rounded-lg transition-colors">Batal</button>
                  <button type="submit" className="px-6 py-2 bg-[#7B1C2A] text-white text-sm font-bold rounded-lg hover:bg-[#9E2D3F] transition-colors shadow-sm">Simpan Bacaan</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ConfirmModal 
        isOpen={!!confirmDelete}
        title={confirmDelete?.type === 'question' ? 'Hapus Soal' : 'Hapus Bacaan'}
        message={confirmDelete?.type === 'question' ? 'Hapus soal ini?' : 'Hapus teks bacaan ini?'}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
      />

      <AnimatePresence>
        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      </AnimatePresence>
    </div>
  );
};

const AdminPackages = ({ onManageQuestions }: { onManageQuestions: (id: string) => void }) => {
  const [packages, setPackages] = useState<ExamPackage[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingPackage, setEditingPackage] = useState<ExamPackage | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, 'examPackages'), orderBy('createdAt', 'desc')), (snap) => {
      setPackages(snap.docs.map(d => ({ id: d.id, ...d.data() } as ExamPackage)));
    }, (err) => handleFirestoreError(err, OperationType.GET, 'examPackages'));
    return unsub;
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const type = formData.get('type') as any;
    const data = {
      title: formData.get('title') as string,
      type,
      optionsCount: type === 'multiple-choice' ? parseInt(formData.get('optionsCount') as string) : null,
      duration: parseInt(formData.get('duration') as string),
      status: formData.get('status') as any,
      description: formData.get('description') as string,
      shuffle: formData.get('shuffle') === 'true',
      questionCount: editingPackage?.questionCount || 0,
      createdAt: editingPackage?.createdAt || serverTimestamp()
    };

    try {
      if (editingPackage) {
        await updateDoc(doc(db, 'examPackages', editingPackage.id), data);
        setToast({ message: "Paket soal berhasil diperbarui.", type: 'success' });
      } else {
        await addDoc(collection(db, 'examPackages'), data);
        setToast({ message: "Paket soal berhasil ditambahkan.", type: 'success' });
      }
      setShowModal(false);
      setEditingPackage(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'examPackages');
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      // Delete questions first
      const qSnap = await getDocs(collection(db, 'examPackages', confirmDelete, 'questions'));
      const batch = writeBatch(db);
      qSnap.docs.forEach(d => batch.delete(d.ref));
      
      // Delete passages
      const pSnap = await getDocs(collection(db, 'examPackages', confirmDelete, 'passages'));
      pSnap.docs.forEach(d => batch.delete(d.ref));
      
      await batch.commit();
      await deleteDoc(doc(db, 'examPackages', confirmDelete));
      setToast({ message: "Paket soal berhasil dihapus.", type: 'success' });
      setConfirmDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `examPackages/${confirmDelete}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input 
            type="text" 
            placeholder="Cari paket soal..." 
            className="pl-10 pr-4 py-2 bg-white border border-[#e0d0d3] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#7B1C2A]/20 w-64"
          />
        </div>
        <button 
          onClick={() => { setEditingPackage(null); setShowModal(true); }}
          className="flex items-center gap-2 bg-[#7B1C2A] text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-[#9E2D3F] transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Tambah Paket
        </button>
      </div>

      <div className="bg-white rounded-xl border border-[#e0d0d3] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-[10px] uppercase font-bold tracking-wider">
              <tr>
                <th className="px-6 py-4 text-left">Nama Paket</th>
                <th className="px-6 py-4 text-left">Durasi</th>
                <th className="px-6 py-4 text-left">Status</th>
                <th className="px-6 py-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {packages.map((p) => (
                <tr key={p.id} className="hover:bg-rose-50/30 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-bold text-gray-900">{p.title}</div>
                    <div className="text-[10px] text-gray-400 mt-0.5">
                      {p.type === 'multiple-choice' ? 'Pilihan Ganda' : 'Essay'} • Dibuat {p.createdAt ? format(p.createdAt.toDate(), 'dd MMM yyyy') : '-'}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-gray-600">{p.duration} menit</td>
                  <td className="px-6 py-4 text-gray-600">{p.questionCount || 0} soal</td>
                  <td className="px-6 py-4">
                    <Badge variant={p.status === 'active' ? 'green' : p.status === 'running' ? 'maroon' : 'default'}>
                      {p.status === 'active' ? 'Aktif' : p.status === 'running' ? 'Berjalan' : 'Nonaktif'}
                    </Badge>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button 
                        onClick={() => onManageQuestions(p.id)}
                        className="px-3 py-1.5 text-xs font-bold text-[#7B1C2A] hover:bg-rose-50 rounded-lg transition-colors border border-transparent hover:border-[#7B1C2A]/20"
                      >
                        Kelola Soal
                      </button>
                      <button 
                        onClick={() => { setEditingPackage(p); setShowModal(true); }}
                        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => setConfirmDelete(p.id)}
                        className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {packages.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-gray-400 italic">Belum ada paket soal</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmModal 
        isOpen={!!confirmDelete}
        title="Hapus Paket Soal"
        message="Hapus paket soal ini? Semua soal di dalamnya juga akan terhapus."
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
      />

      <AnimatePresence>
        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      </AnimatePresence>

      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                <h3 className="font-bold text-gray-900">{editingPackage ? 'Edit Paket Soal' : 'Tambah Paket Soal'}</h3>
                <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Nama Paket</label>
                    <input name="title" defaultValue={editingPackage?.title} required type="text" className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#7B1C2A]/20 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Tipe Ujian</label>
                    <select name="type" defaultValue={editingPackage?.type || 'multiple-choice'} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#7B1C2A]/20 outline-none bg-white">
                      <option value="multiple-choice">Pilihan Ganda</option>
                      <option value="essay">Essay</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Jumlah Pilihan (A-E = 5)</label>
                    <input name="optionsCount" defaultValue={editingPackage?.optionsCount || 4} type="number" min="2" max="10" className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#7B1C2A]/20 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Durasi (Menit)</label>
                    <input name="duration" defaultValue={editingPackage?.duration} required type="number" className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#7B1C2A]/20 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Status</label>
                    <select name="status" defaultValue={editingPackage?.status || 'inactive'} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#7B1C2A]/20 outline-none bg-white">
                      <option value="active">Aktif</option>
                      <option value="inactive">Nonaktif</option>
                      <option value="running">Berjalan</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Deskripsi</label>
                  <textarea name="description" defaultValue={editingPackage?.description} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#7B1C2A]/20 outline-none h-24 resize-none" />
                </div>
                <div className="flex items-center gap-2">
                  <input name="shuffle" defaultChecked={editingPackage?.shuffle} type="checkbox" value="true" id="shuffle" className="w-4 h-4 accent-[#7B1C2A]" />
                  <label htmlFor="shuffle" className="text-sm text-gray-600">Acak urutan soal untuk setiap mahasiswa</label>
                </div>
                <div className="pt-4 flex justify-end gap-3">
                  <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm font-bold text-gray-500 hover:bg-gray-100 rounded-lg transition-colors">Batal</button>
                  <button type="submit" className="px-6 py-2 bg-[#7B1C2A] text-white text-sm font-bold rounded-lg hover:bg-[#9E2D3F] transition-colors shadow-sm">Simpan Paket</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

const AdminUsers = () => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, 'users'), orderBy('createdAt', 'desc')), (snap) => {
      setUsers(snap.docs.map(d => ({ ...d.data(), uid: d.id } as unknown as UserProfile)));
    }, (err) => handleFirestoreError(err, OperationType.GET, 'users'));
    return unsub;
  }, []);

  const handleAddUser = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const name = formData.get('name') as string;
    const nim = formData.get('nim') as string;
    const role = formData.get('role') as 'admin' | 'student';

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const newUser = userCredential.user;

      const newProfile: UserProfile = {
        uid: newUser.uid,
        name,
        nim,
        email,
        role,
        status: 'active',
        createdAt: serverTimestamp()
      };

      await setDoc(doc(db, 'users', newUser.uid), newProfile);
      setShowModal(false);
      setToast({ message: "Akun berhasil dibuat!", type: 'success' });
    } catch (error: any) {
      console.error("Error adding user", error);
      setToast({ message: "Gagal membuat akun: " + error.message, type: 'error' });
    }
  };

  const handleDeleteUser = async () => {
    if (!confirmDelete) return;
    try {
      await deleteDoc(doc(db, 'users', confirmDelete));
      setToast({ message: "Akun berhasil dihapus dari database.", type: 'success' });
      setConfirmDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `users/${confirmDelete}`);
    }
  };

  const toggleStatus = async (user: UserProfile) => {
    try {
      const newStatus = user.status === 'active' ? 'inactive' : 'active';
      await updateDoc(doc(db, 'users', user.uid), {
        status: newStatus
      });
      setToast({ 
        message: `Akun ${user.name} berhasil ${newStatus === 'active' ? 'diaktifkan' : 'dinonaktifkan'}.`, 
        type: 'success' 
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  const filteredUsers = users.filter(u => 
    u.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (u.nim && u.nim.toLowerCase().includes(searchTerm.toLowerCase())) ||
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input 
            type="text" 
            placeholder="Cari NIM / Nama / Email..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 pr-4 py-2 bg-white border border-[#e0d0d3] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#7B1C2A]/20 w-64"
          />
        </div>
        <button 
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-[#7B1C2A] text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-[#9E2D3F] transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Tambah Akun
        </button>
      </div>

      <div className="bg-white rounded-xl border border-[#e0d0d3] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-[10px] uppercase font-bold tracking-wider">
              <tr>
                <th className="px-6 py-4 text-left">Mahasiswa</th>
                <th className="px-6 py-4 text-left">Email</th>
                <th className="px-6 py-4 text-left">Role</th>
                <th className="px-6 py-4 text-left">Status</th>
                <th className="px-6 py-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredUsers.map((u) => (
                <tr key={u.uid || u.email} className="hover:bg-rose-50/30 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-bold text-gray-900">{u.name}</div>
                    <div className="text-[10px] text-gray-400 mt-0.5">{u.nim || '-'}</div>
                  </td>
                  <td className="px-6 py-4 text-gray-600">{u.email}</td>
                  <td className="px-6 py-4">
                    <Badge variant={u.role === 'admin' ? 'gold' : 'default'}>{u.role}</Badge>
                  </td>
                  <td className="px-6 py-4">
                    <Badge variant={u.status === 'active' ? 'green' : 'red'}>{u.status}</Badge>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button 
                        onClick={() => toggleStatus(u)}
                        title={u.status === 'active' ? 'Nonaktifkan' : 'Aktifkan'}
                        className={cn(
                          "p-1.5 rounded-lg transition-colors",
                          u.status === 'active' ? "text-amber-600 hover:bg-amber-50" : "text-green-600 hover:bg-green-50"
                        )}
                      >
                        {u.status === 'active' ? <X className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                      </button>
                      <button 
                        onClick={() => setConfirmDelete(u.uid)}
                        title="Hapus Akun"
                        className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-400 italic">Tidak ada data akun yang ditemukan.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmModal 
        isOpen={!!confirmDelete}
        title="Hapus Akun"
        message="Hapus akun ini dari database? (Catatan: Akun di Firebase Auth tidak akan terhapus otomatis)"
        onConfirm={handleDeleteUser}
        onCancel={() => setConfirmDelete(null)}
      />

      <AnimatePresence>
        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      </AnimatePresence>

      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                <h3 className="font-bold text-gray-900">Tambah Akun Baru</h3>
                <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleAddUser} className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Nama Lengkap</label>
                    <input name="name" required type="text" className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#7B1C2A]/20 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">NIM</label>
                    <input name="nim" type="text" className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#7B1C2A]/20 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Role</label>
                    <select name="role" className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#7B1C2A]/20 outline-none bg-white">
                      <option value="student">Mahasiswa</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Email</label>
                    <input name="email" required type="email" className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#7B1C2A]/20 outline-none" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Password (Min. 6 Karakter)</label>
                    <input name="password" required type="password" minLength={6} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#7B1C2A]/20 outline-none" />
                  </div>
                </div>
                <div className="pt-4 flex justify-end gap-3">
                  <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm font-bold text-gray-500 hover:bg-gray-100 rounded-lg transition-colors">Batal</button>
                  <button type="submit" className="px-6 py-2 bg-[#7B1C2A] text-white text-sm font-bold rounded-lg hover:bg-[#9E2D3F] transition-colors shadow-sm">Simpan Akun</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

const PrintResult = ({ result, onBack }: { result: ExamResult, onBack: () => void }) => {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between no-print">
        <button onClick={onBack} className="flex items-center gap-2 text-gray-500 hover:text-gray-900 font-bold text-sm">
          <ChevronLeft className="w-4 h-4" />
          Kembali
        </button>
        <button 
          onClick={() => {
            window.focus();
            window.print();
          }}
          className="flex items-center gap-2 bg-[#7B1C2A] text-white px-6 py-2 rounded-lg font-bold hover:bg-[#9E2D3F] transition-all shadow-lg shadow-[#7B1C2A]/20"
        >
          <Printer className="w-4 h-4" />
          Cetak Sekarang
        </button>
      </div>

      <div id="printable-area" className="bg-white p-12 rounded-2xl border border-[#e0d0d3] shadow-sm max-w-4xl mx-auto print:shadow-none print:border-none print:p-0">
        <div className="text-center border-b-2 border-gray-900 pb-8 mb-8">
          <h1 className="text-2xl font-bold uppercase tracking-widest">Universitas Harkat Negeri</h1>
          <p className="text-sm text-gray-500 mt-1">Laporan Hasil Ujian Mahasiswa</p>
        </div>

        <div className="grid grid-cols-2 gap-8 mb-12">
          <div className="space-y-4">
            <div>
              <div className="text-[10px] text-gray-400 uppercase font-bold tracking-widest">Nama Mahasiswa</div>
              <div className="text-lg font-bold text-gray-900">{result.studentName}</div>
            </div>
            <div>
              <div className="text-[10px] text-gray-400 uppercase font-bold tracking-widest">NIM</div>
              <div className="text-lg font-bold text-gray-900">{result.studentNim}</div>
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <div className="text-[10px] text-gray-400 uppercase font-bold tracking-widest">Paket Ujian</div>
              <div className="text-lg font-bold text-gray-900">{result.packageTitle}</div>
            </div>
            <div>
              <div className="text-[10px] text-gray-400 uppercase font-bold tracking-widest">Tanggal Selesai</div>
              <div className="text-lg font-bold text-gray-900">
                {result.endTime && result.endTime instanceof Timestamp ? format(result.endTime.toDate(), 'dd MMMM yyyy HH:mm') : '-'}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-6 mb-12">
          <div className="bg-gray-50 p-6 rounded-2xl text-center">
            <div className="text-[10px] text-gray-400 uppercase font-bold tracking-widest mb-1">Skor Akhir</div>
            <div className="text-5xl font-bold text-[#7B1C2A]">{result.score.toFixed(0)}</div>
          </div>
          <div className="bg-gray-50 p-6 rounded-2xl text-center">
            <div className="text-[10px] text-gray-400 uppercase font-bold tracking-widest mb-1">Jawaban Benar</div>
            <div className="text-5xl font-bold text-green-600">{result.correctCount}</div>
          </div>
          <div className="bg-gray-50 p-6 rounded-2xl text-center">
            <div className="text-[10px] text-gray-400 uppercase font-bold tracking-widest mb-1">Total Soal</div>
            <div className="text-5xl font-bold text-gray-400">{result.totalQuestions}</div>
          </div>
        </div>

        <div className="mt-24 flex justify-end">
          <div className="text-center w-64">
            <div className="text-sm text-gray-500 mb-16">Dicetak pada {format(new Date(), 'dd/MM/yyyy HH:mm')}</div>
            <div className="border-t border-gray-900 pt-2 font-bold text-gray-900">Kapala Unit Beasiswa dan Pemagangan</div>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          main { padding: 0 !important; margin: 0 !important; }
          .p-8 { padding: 0 !important; }
          header, aside, .sidebar-container { display: none !important; }
          .flex-1 { margin: 0 !important; width: 100% !important; overflow: visible !important; }
          #printable-area { 
            position: absolute; 
            left: 0; 
            top: 0; 
            width: 100%; 
            margin: 0; 
            padding: 0;
            border: none;
            box-shadow: none;
          }
        }
      `}</style>
    </div>
  );
};

const AdminResults = () => {
  const [packages, setPackages] = useState<ExamPackage[]>([]);
  const [selectedPackage, setSelectedPackage] = useState<ExamPackage | null>(null);
  const [results, setResults] = useState<ExamResult[]>([]);
  const [showPrintView, setShowPrintView] = useState<ExamResult | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, 'examPackages'), orderBy('createdAt', 'desc')), (snap) => {
      setPackages(snap.docs.map(d => ({ id: d.id, ...d.data() } as ExamPackage)));
    }, (err) => handleFirestoreError(err, OperationType.GET, 'examPackages'));
    return unsub;
  }, []);

  useEffect(() => {
    if (!selectedPackage) return;
    const unsub = onSnapshot(query(collection(db, 'examResults'), where('packageId', '==', selectedPackage.id), orderBy('endTime', 'desc')), (snap) => {
      setResults(snap.docs.map(d => ({ id: d.id, ...d.data() } as ExamResult)));
    }, (err) => handleFirestoreError(err, OperationType.GET, 'examResults'));
    return unsub;
  }, [selectedPackage]);

  if (showPrintView) {
    return <PrintResult result={showPrintView} onBack={() => setShowPrintView(null)} />;
  }

  if (selectedPackage) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <button onClick={() => setSelectedPackage(null)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-lg font-bold text-gray-900">Rekap Hasil: {selectedPackage.title}</h2>
            <div className="text-xs text-gray-500">{results.length} Mahasiswa telah mengerjakan</div>
          </div>
          <button 
            onClick={() => window.print()}
            className="ml-auto flex items-center gap-2 bg-white text-[#7B1C2A] border border-[#7B1C2A] px-4 py-2 rounded-lg text-sm font-bold hover:bg-rose-50 transition-colors no-print"
          >
            <Printer className="w-4 h-4" />
            Cetak Rekap
          </button>
        </div>

        <div className="bg-white rounded-xl border border-[#e0d0d3] shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-[10px] uppercase font-bold tracking-wider">
                <tr>
                  <th className="px-6 py-4 text-left">Mahasiswa</th>
                  <th className="px-6 py-4 text-center">Skor</th>
                  <th className="px-6 py-4 text-center">Benar</th>
                  <th className="px-6 py-4 text-center">Waktu Selesai</th>
                  <th className="px-6 py-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {results.map((r) => (
                  <tr key={r.id} className="hover:bg-rose-50/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-bold text-gray-900">{r.studentName}</div>
                      <div className="text-[10px] text-gray-400 mt-0.5">{r.studentNim}</div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={cn(
                        "px-2.5 py-1 rounded-lg font-bold text-sm",
                        r.score >= 70 ? "bg-green-100 text-green-700" : "bg-rose-100 text-[#7B1C2A]"
                      )}>
                        {r.score.toFixed(0)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center font-medium text-gray-600">
                      {r.correctCount} / {r.totalQuestions}
                    </td>
                    <td className="px-6 py-4 text-center text-gray-500 text-xs">
                      {r.endTime && r.endTime instanceof Timestamp ? format(r.endTime.toDate(), 'dd/MM/yyyy HH:mm') : '-'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => setShowPrintView(r)}
                        className="flex items-center gap-2 ml-auto bg-white text-[#7B1C2A] border border-[#7B1C2A] px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-rose-50 transition-colors"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        Cetak Hasil
                      </button>
                    </td>
                  </tr>
                ))}
                {results.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-gray-400 italic">Belum ada mahasiswa yang mengerjakan paket ini.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-[#e0d0d3] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-[10px] uppercase font-bold tracking-wider">
              <tr>
                <th className="px-6 py-4 text-left">Paket Soal</th>
                <th className="px-6 py-4 text-center">Tipe</th>
                <th className="px-6 py-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {packages.map((p) => (
                <tr key={p.id} className="hover:bg-rose-50/30 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-bold text-gray-900">{p.title}</div>
                    <div className="text-[10px] text-gray-400 mt-0.5">{p.questionCount} Soal • {p.duration} Menit</div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <Badge variant={p.type === 'multiple-choice' ? 'blue' : 'maroon'}>
                      {p.type === 'multiple-choice' ? 'Pilihan Ganda' : 'Essay'}
                    </Badge>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button 
                      onClick={() => setSelectedPackage(p)}
                      className="bg-[#7B1C2A] text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-[#9E2D3F] transition-colors shadow-sm"
                    >
                      Detail Rekap
                    </button>
                  </td>
                </tr>
              ))}
              {packages.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-6 py-12 text-center text-gray-400 italic">Tidak ada paket soal yang tersedia.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const AdminApp = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const { profile } = useAuth();

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'packages', label: 'Paket Soal', icon: FileText },
    { id: 'results', label: 'Hasil Ujian', icon: CheckCircle },
    { id: 'users', label: 'Pengaturan Akun', icon: UserIcon },
  ];

  return (
    <div className="flex min-h-screen bg-[#f7f2f3] relative">
      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-black/50 z-40 lg:hidden no-print"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.div 
        initial={false}
        animate={{ 
          width: isSidebarOpen ? 256 : 0,
          opacity: isSidebarOpen ? 1 : 0,
          x: isSidebarOpen ? 0 : -256
        }}
        className="bg-[#5A1220] flex flex-col shrink-0 no-print overflow-hidden fixed lg:relative h-full z-50 sidebar-container"
      >
        <div className="w-64 flex flex-col h-full">
          <div className="p-6 border-b border-white/10 flex items-center justify-between">
            <div>
              <div className="text-white font-bold tracking-wider">SIUJIAN</div>
              <div className="text-white/40 text-[10px] uppercase tracking-widest mt-1">Sistem Ujian Online</div>
            </div>
            <button 
              onClick={() => setIsSidebarOpen(false)}
              className="lg:hidden text-white/60 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <nav className="flex-1 py-4">
            <div className="px-6 text-[10px] text-white/30 uppercase font-bold tracking-widest mb-2">Menu Utama</div>
            {menuItems.map((item) => (
              <button
                key={item.id}
                onClick={() => { setActiveTab(item.id); setSelectedPackageId(null); setIsSidebarOpen(window.innerWidth >= 1024); }}
                className={cn(
                  "w-full flex items-center gap-3 px-6 py-3 text-sm transition-all border-l-4",
                  activeTab === item.id 
                    ? "bg-white/10 text-white border-[#C9963A]" 
                    : "text-white/60 border-transparent hover:bg-white/5 hover:text-white"
                )}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </button>
            ))}
          </nav>
          <div className="p-4 border-t border-white/10">
            <button 
              onClick={() => signOut(auth)}
              className="w-full flex items-center gap-3 px-4 py-2 text-sm text-white/60 hover:text-white transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Keluar
            </button>
          </div>
        </div>
      </motion.div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 bg-white border-b border-[#e0d0d3] flex items-center justify-between px-8 shrink-0 no-print">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-500"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h2 className="font-bold text-gray-800">
              {selectedPackageId ? 'Kelola Soal' : menuItems.find(m => m.id === activeTab)?.label}
            </h2>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <div className="text-xs font-bold text-gray-900">{profile?.name}</div>
              <div className="text-[10px] text-gray-400">Administrator</div>
            </div>
            <div className="w-10 h-10 rounded-full bg-[#7B1C2A] flex items-center justify-center text-white font-bold text-sm">
              {profile?.name?.substring(0, 2).toUpperCase()}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={selectedPackageId || activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {selectedPackageId ? (
                <AdminQuestions packageId={selectedPackageId} onBack={() => setSelectedPackageId(null)} />
              ) : (
                <>
                  {activeTab === 'dashboard' && <AdminDashboard />}
                  {activeTab === 'packages' && <AdminPackages onManageQuestions={(id) => setSelectedPackageId(id)} />}
                  {activeTab === 'users' && <AdminUsers />}
                  {activeTab === 'results' && <AdminResults />}
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
};

const StudentApp = () => {
  const { profile } = useAuth();
  const [packages, setPackages] = useState<ExamPackage[]>([]);
  const [userResults, setUserResults] = useState<ExamResult[]>([]);
  const [activeExam, setActiveExam] = useState<ExamPackage | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [passages, setPassages] = useState<Passage[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [examStarted, setExamStarted] = useState(false);
  const [examFinished, setExamFinished] = useState(false);
  const [showFinishModal, setShowFinishModal] = useState(false);
  const [result, setResult] = useState<ExamResult | null>(null);
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, 'examPackages'), where('status', '==', 'active')), (snap) => {
      setPackages(snap.docs.map(d => ({ id: d.id, ...d.data() } as ExamPackage)));
    }, (err) => handleFirestoreError(err, OperationType.GET, 'examPackages'));
    return unsub;
  }, []);

  useEffect(() => {
    if (!auth.currentUser) return;
    const unsub = onSnapshot(query(collection(db, 'examResults'), where('studentUid', '==', auth.currentUser.uid)), (snap) => {
      setUserResults(snap.docs.map(d => ({ id: d.id, ...d.data() } as ExamResult)));
    }, (err) => handleFirestoreError(err, OperationType.GET, 'examResults'));
    return unsub;
  }, []);

  useEffect(() => {
    let timer: any;
    if (examStarted && timeLeft > 0 && !examFinished) {
      timer = setInterval(() => {
        setTimeLeft(prev => prev - 1);
      }, 1000);
    } else if (timeLeft === 0 && examStarted && !examFinished) {
      finishExam();
    }
    return () => clearInterval(timer);
  }, [examStarted, timeLeft, examFinished]);

  const startExam = async (pkg: ExamPackage) => {
    if (userResults.some(r => r.packageId === pkg.id)) {
      setToast({ message: "Anda sudah mengerjakan paket soal ini.", type: 'error' });
      return;
    }
    try {
      const qSnap = await getDocs(collection(db, 'examPackages', pkg.id, 'questions'));
      const pSnap = await getDocs(collection(db, 'examPackages', pkg.id, 'passages'));
      
      let qs = qSnap.docs.map(d => ({ id: d.id, ...d.data() } as Question));
      const ps = pSnap.docs.map(d => ({ id: d.id, ...d.data() } as Passage));
      
      if (pkg.shuffle) {
        qs = qs.sort(() => Math.random() - 0.5);
      }
      
      setQuestions(qs);
      setPassages(ps);
      setActiveExam(pkg);
      setTimeLeft(pkg.duration * 60);
      setExamStarted(true);
      setAnswers({});
      setCurrentQuestionIndex(0);
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `examPackages/${pkg.id}`);
    }
  };

  const finishExam = async () => {
    if (!activeExam) return;
    setExamFinished(true);
    setShowFinishModal(false);

    let correctCount = 0;
    if (activeExam.type === 'multiple-choice') {
      questions.forEach(q => {
        if (answers[q.id] === q.correctKey) correctCount++;
      });
    }

    const score = activeExam.type === 'multiple-choice' 
      ? (correctCount / questions.length) * 100 
      : 0; // Essay needs manual grading

    const resultData: Omit<ExamResult, 'id'> = {
      studentUid: auth.currentUser!.uid,
      studentNim: profile?.nim || '',
      studentName: profile?.name || '',
      packageId: activeExam.id,
      packageTitle: activeExam.title,
      score,
      correctCount,
      totalQuestions: questions.length,
      answers,
      startTime: serverTimestamp(),
      endTime: serverTimestamp()
    };

    try {
      const docRef = await addDoc(collection(db, 'examResults'), resultData);
      const finalResult = { id: docRef.id, ...resultData } as ExamResult;
      setResult(finalResult);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'examResults');
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  if (examFinished && result) {
    return (
      <div className="min-h-screen bg-[#f7f2f3] flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-2xl shadow-xl border border-[#e0d0d3] w-full max-w-lg overflow-hidden"
        >
          <div className="bg-[#5A1220] p-8 text-center text-white">
            <CheckCircle className="w-16 h-16 mx-auto mb-4 text-green-400" />
            <h2 className="text-2xl font-bold">Ujian Selesai!</h2>
            <p className="text-white/60 mt-1">Terima kasih telah mengerjakan ujian dengan jujur.</p>
          </div>
          <div className="p-8 space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-50 p-4 rounded-xl text-center">
                <div className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Skor Akhir</div>
                <div className="text-4xl font-bold text-[#7B1C2A] mt-1">{result.score.toFixed(0)}</div>
              </div>
              <div className="bg-gray-50 p-4 rounded-xl text-center">
                <div className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Jawaban Benar</div>
                <div className="text-4xl font-bold text-green-600 mt-1">{result.correctCount} / {result.totalQuestions}</div>
              </div>
            </div>
            <button 
              onClick={() => signOut(auth)}
              className="w-full bg-[#7B1C2A] text-white py-3 rounded-xl font-bold hover:bg-[#9E2D3F] transition-all"
            >
              Selesai & Keluar
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  if (examStarted && activeExam) {
    const q = questions[currentQuestionIndex];
    const passage = q?.passageId ? passages.find(p => p.id === q.passageId) : null;

    return (
      <div className="min-h-screen bg-[#f7f2f3] p-4 sm:p-8">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="bg-[#5A1220] text-white p-6 rounded-2xl shadow-lg flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold">{activeExam.title}</h2>
              <div className="text-white/60 text-xs mt-1">{profile?.name} · {profile?.nim}</div>
            </div>
            <div className="bg-white/10 px-4 py-2 rounded-xl text-center border border-white/10">
              <div className="text-[10px] text-white/60 uppercase font-bold tracking-wider">Sisa Waktu</div>
              <div className={cn("text-2xl font-bold font-mono", timeLeft < 300 ? "text-red-400 animate-pulse" : "text-white")}>
                {formatTime(timeLeft)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Passage Section */}
            {passage && (
              <div className="lg:col-span-5 bg-white rounded-2xl border border-[#e0d0d3] p-6 shadow-sm max-h-[70vh] overflow-y-auto">
                <h3 className="font-bold text-[#7B1C2A] mb-4 flex items-center gap-2 border-b pb-2">
                  <BookOpen className="w-4 h-4" />
                  {passage.title}
                </h3>
                <div className="text-gray-700 text-sm leading-relaxed whitespace-pre-wrap">
                  {passage.content}
                </div>
              </div>
            )}

            {/* Question Section */}
            <div className={cn(passage ? "lg:col-span-7" : "lg:col-span-12", "space-y-6")}>
              <div className="bg-white rounded-2xl border border-[#e0d0d3] p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-bold text-[#7B1C2A] uppercase tracking-widest">Soal {currentQuestionIndex + 1} dari {questions.length}</span>
                  <div className="flex gap-1">
                    {questions.map((_, i) => (
                      <div key={i} className={cn(
                        "w-1.5 h-1.5 rounded-full",
                        i === currentQuestionIndex ? "bg-[#C9963A]" : answers[questions[i].id] ? "bg-[#7B1C2A]" : "bg-gray-200"
                      )} />
                    ))}
                  </div>
                </div>
                
                <div className="text-gray-800 text-lg leading-relaxed mb-8">
                  {q.imageUrl && <img src={q.imageUrl} className="mb-6 rounded-xl max-h-64 object-contain mx-auto border border-gray-100 bg-gray-50 p-2" alt="Soal" referrerPolicy="no-referrer" />}
                  <div className="whitespace-pre-wrap">{q.text}</div>
                </div>

                {activeExam.type === 'multiple-choice' && q.options && (
                  <div className="space-y-3">
                    {Array.from({ length: activeExam.optionsCount || 4 }).map((_, idx) => {
                      const key = String.fromCharCode(65 + idx);
                      const val = q.options?.[key];
                      if (!val) return null;
                      return (
                        <button
                          key={key}
                          onClick={() => setAnswers(prev => ({ ...prev, [q.id]: key }))}
                          className={cn(
                            "w-full flex items-center gap-4 p-4 rounded-xl border text-left transition-all",
                            answers[q.id] === key 
                              ? "bg-rose-50 border-[#7B1C2A] shadow-sm" 
                              : "bg-white border-gray-200 hover:border-[#7B1C2A]/50 hover:bg-gray-50"
                          )}
                        >
                          <div className={cn(
                            "w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0 border-2",
                            answers[q.id] === key ? "bg-[#7B1C2A] border-[#7B1C2A] text-white" : "border-gray-200 text-gray-400"
                          )}>
                            {key}
                          </div>
                          <div className={cn("text-sm", answers[q.id] === key ? "text-gray-900 font-medium" : "text-gray-600")}>
                            {val}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {activeExam.type === 'essay' && (
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-gray-500 uppercase">Jawaban Anda</label>
                    <textarea 
                      value={answers[q.id] || ''}
                      onChange={(e) => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                      className="w-full h-48 p-4 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#7B1C2A]/20 outline-none resize-none text-sm"
                      placeholder="Ketikkan jawaban essay Anda di sini..."
                    />
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between">
                <button 
                  disabled={currentQuestionIndex === 0}
                  onClick={() => setCurrentQuestionIndex(prev => prev - 1)}
                  className="flex items-center gap-2 px-6 py-3 bg-white border border-[#e0d0d3] rounded-xl font-bold text-gray-600 disabled:opacity-30 transition-all hover:bg-gray-50"
                >
                  <ChevronLeft className="w-5 h-5" />
                  Sebelumnya
                </button>
                
                {currentQuestionIndex === questions.length - 1 ? (
                  <button 
                    onClick={() => setShowFinishModal(true)}
                    className="px-8 py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 transition-all shadow-lg shadow-green-600/20"
                  >
                    Selesai Ujian
                  </button>
                ) : (
                  <button 
                    onClick={() => setCurrentQuestionIndex(prev => prev + 1)}
                    className="flex items-center gap-2 px-6 py-3 bg-[#7B1C2A] text-white rounded-xl font-bold hover:bg-[#9E2D3F] transition-all shadow-lg shadow-[#7B1C2A]/20"
                  >
                    Selanjutnya
                    <ChevronRight className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <AnimatePresence>
          {showFinishModal && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden p-8 text-center"
              >
                <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-4 text-[#7B1C2A]">
                  <AlertCircle className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Selesaikan Ujian?</h3>
                <p className="text-sm text-gray-500 mb-8">
                  Pastikan semua jawaban telah terisi. Anda tidak dapat kembali setelah menekan tombol selesai.
                </p>
                <div className="flex gap-3">
                  <button 
                    onClick={() => setShowFinishModal(false)}
                    className="flex-1 px-4 py-3 text-sm font-bold text-gray-500 hover:bg-gray-100 rounded-xl transition-colors"
                  >
                    Batal
                  </button>
                  <button 
                    onClick={finishExam}
                    className="flex-1 px-4 py-3 bg-[#7B1C2A] text-white text-sm font-bold rounded-xl hover:bg-[#9E2D3F] transition-colors shadow-sm"
                  >
                    Ya, Selesai
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f7f2f3]">
      <header className="bg-[#5A1220] text-white p-6 shadow-lg">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight">SIUJIAN</h1>
            <p className="text-white/50 text-xs uppercase tracking-widest mt-0.5">Sistem Ujian Online</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <div className="text-sm font-bold">{profile?.name}</div>
              <div className="text-[10px] text-white/50">{profile?.nim}</div>
            </div>
            <button onClick={() => signOut(auth)} className="p-2 bg-white/10 rounded-lg hover:bg-white/20 transition-colors">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-6 sm:p-10">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-800">Selamat Datang, {profile?.name}!</h2>
          <p className="text-gray-500 mt-1">Silakan pilih paket soal yang tersedia untuk memulai ujian.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {packages.map((p) => {
            const isCompleted = userResults.some(r => r.packageId === p.id);
            return (
              <motion.div 
                key={p.id}
                whileHover={{ y: -5 }}
                className="bg-white rounded-2xl border border-[#e0d0d3] p-6 shadow-sm hover:shadow-md transition-all flex flex-col"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl bg-rose-50 flex items-center justify-center text-[#7B1C2A]">
                    <FileText className="w-6 h-6" />
                  </div>
                  <Badge variant={isCompleted ? "gold" : "green"}>
                    {isCompleted ? "Selesai" : "Aktif"}
                  </Badge>
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">{p.title}</h3>
                <p className="text-xs text-gray-500 mb-6 line-clamp-2 leading-relaxed">
                  {p.description || 'Tidak ada deskripsi tambahan untuk paket soal ini.'}
                </p>
                <div className="mt-auto space-y-4">
                  <div className="flex items-center gap-6 text-xs font-bold text-gray-400">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      {p.duration} Menit
                    </div>
                    <div className="flex items-center gap-1.5">
                      <CheckCircle className="w-3.5 h-3.5" />
                      {p.questionCount || '-'} Soal
                    </div>
                  </div>
                  <button 
                    disabled={isCompleted}
                    onClick={() => startExam(p)}
                    className={cn(
                      "w-full py-3 rounded-xl font-bold transition-all shadow-sm",
                      isCompleted 
                        ? "bg-gray-100 text-gray-400 cursor-not-allowed" 
                        : "bg-[#7B1C2A] text-white hover:bg-[#9E2D3F]"
                    )}
                  >
                    {isCompleted ? "Sudah Dikerjakan" : "Mulai Ujian"}
                  </button>
                </div>
              </motion.div>
            );
          })}
          {packages.length === 0 && (
            <div className="col-span-full bg-white p-12 rounded-2xl border border-[#e0d0d3] text-center">
              <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-300">
                <FileText className="w-8 h-8" />
              </div>
              <h3 className="font-bold text-gray-800">Belum Ada Ujian</h3>
              <p className="text-sm text-gray-400 mt-1">Saat ini belum ada paket soal aktif yang tersedia untuk Anda.</p>
            </div>
          )}
        </div>
      </main>

      <AnimatePresence>
        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      </AnimatePresence>
    </div>
  );
};

// --- Main App ---

const AppContent = () => {
  const { user, profile, loading, isAdmin } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f7f2f3]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-[#7B1C2A] border-t-transparent rounded-full animate-spin" />
          <div className="text-[#7B1C2A] font-bold tracking-widest text-xs uppercase">Memuat SIUJIAN...</div>
        </div>
      </div>
    );
  }

  if (!user) return <LoginView />;

  if (isAdmin) return <AdminApp />;

  if (profile?.status === 'inactive') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f7f2f3] p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl border border-amber-200 max-w-md text-center">
          <AlertCircle className="w-16 h-16 text-amber-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-800">Akun Belum Aktif</h2>
          <p className="text-gray-500 mt-2 text-sm">Akun Anda sedang dalam proses verifikasi atau dinonaktifkan oleh administrator. Silakan hubungi bagian akademik.</p>
          <button onClick={() => signOut(auth)} className="mt-6 text-[#7B1C2A] font-bold text-sm hover:underline">Keluar</button>
        </div>
      </div>
    );
  }

  return <StudentApp />;
};

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        try {
          // Check if user exists in Firestore
          const userRef = doc(db, 'users', firebaseUser.uid);
          const userSnap = await getDoc(userRef);
          
          if (userSnap.exists()) {
            setProfile(userSnap.data() as UserProfile);
          } else {
            // Check if user is the default admin
            const isDefaultAdmin = firebaseUser.email === "972023032@student.uksw.edu";
            
            // Create profile if not exists
            const newProfile: UserProfile = {
              uid: firebaseUser.uid,
              name: firebaseUser.displayName || 'User',
              email: firebaseUser.email || '',
              role: isDefaultAdmin ? 'admin' : 'student',
              status: 'active',
              createdAt: serverTimestamp()
            };
            await setDoc(userRef, newProfile);
            setProfile(newProfile);
          }
        } catch (error) {
          console.error("Error fetching user profile", error);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const isAdmin = useMemo(() => profile?.role === 'admin', [profile]);

  return (
    <AuthContext.Provider value={{ user, profile, loading, isAdmin }}>
      <AppContent />
    </AuthContext.Provider>
  );
}

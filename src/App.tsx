import React, { useState, useCallback, useRef, useEffect } from 'react';
import { 
  Upload, 
  Settings, 
  Play, 
  StopCircle, 
  Download, 
  FileText, 
  CheckCircle2, 
  AlertCircle, 
  Terminal, 
  Moon, 
  Sun,
  ChevronRight,
  Search,
  Eye,
  FileCode,
  X,
  Loader2,
  Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { extractZip, createZip } from './lib/jszip-utils';
import { isTranslatable, isBinary, readFileAsText } from './lib/file-utils';
import { translateContent } from './services/translationService';
import { AppStatus, ProcessedFile, AppLog } from './types';
import { cn } from './lib/utils';
import Prism from 'prismjs';
import 'prismjs/themes/prism-tomorrow.css';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';

// Import Prism CSS manually if needed, but let's assume it works with the import

const LANGUAGES = [
  { label: 'Vietnamese', value: 'Vietnamese' },
  { label: 'English', value: 'English' },
  { label: 'Japanese', value: 'Japanese' },
  { label: 'Chinese', value: 'Chinese' },
  { label: 'Korean', value: 'Korean' },
  { label: 'Russian', value: 'Russian' },
  { label: 'Thai', value: 'Thai' },
];

export default function App() {
  const [status, setStatus] = useState<AppStatus>('IDLE');
  const [targetLang, setTargetLang] = useState('Vietnamese');
  const [files, setFiles] = useState<Map<string, ProcessedFile>>(new Map());
  const [logs, setLogs] = useState<AppLog[]>([]);
  const [progress, setProgress] = useState(0);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  
  const stopRef = useRef(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    await handleFileSelection(e);
  };

  const addLog = useCallback((message: string, level: AppLog['level'] = 'INFO') => {
    setLogs(prev => [
      ...prev,
      { id: Math.random().toString(36).substr(2, 9), timestamp: new Date(), level, message }
    ]);
  }, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  useEffect(() => {
    if (selectedFilePath) {
      Prism.highlightAll();
    }
  }, [selectedFilePath, files]);

  const handleFileSelection = async (event: React.ChangeEvent<HTMLInputElement> | React.DragEvent) => {
    let inputFiles: File[] = [];
    
    if ('dataTransfer' in event) {
      event.preventDefault();
      inputFiles = Array.from(event.dataTransfer.files);
    } else if ('target' in event && event.target instanceof HTMLInputElement && event.target.files) {
      inputFiles = Array.from(event.target.files);
    }

    if (inputFiles.length === 0) return;

    setStatus('SCANNING');
    addLog(`Đang quét ${inputFiles.length} tệp/thư mục...`);
    const newFiles = new Map<string, ProcessedFile>();

    for (const file of inputFiles) {
      const ext = file.name.split('.').pop()?.toLowerCase();
      
      if (ext === 'zip' || ext === 'mcpack' || ext === 'mcaddon') {
        try {
          const zipContent = await extractZip(file);
          for (const [path, data] of zipContent.entries()) {
            if (isBinary(path)) {
              newFiles.set(path, { path, originalContent: data, status: 'SKIPPED', isText: false });
            } else {
              const { content, encoding } = await readFileAsText(data);
              const translatable = isTranslatable(path);
              newFiles.set(path, { 
                path, 
                originalContent: content, 
                status: 'PENDING', 
                isText: true, 
                encoding,
                translatedContent: translatable ? undefined : content
              });
            }
          }
        } catch (e) {
          addLog(`Lỗi giải nén ${file.name}: ${e}`, 'ERROR');
        }
      } else {
        if (isBinary(file.name)) {
           const buffer = await file.arrayBuffer();
           newFiles.set(file.name, { path: file.name, originalContent: new Uint8Array(buffer), status: 'SKIPPED', isText: false });
        } else {
          const buffer = await file.arrayBuffer();
          const { content, encoding } = await readFileAsText(new Uint8Array(buffer));
          newFiles.set(file.name, { 
            path: file.name, 
            originalContent: content, 
            status: 'PENDING', 
            isText: true, 
            encoding 
          });
        }
      }
    }

    setFiles(newFiles);
    setStatus('IDLE');
    addLog(`Đã quét xong. Tìm thấy ${newFiles.size} tệp.`, 'SUCCESS');
  };

  const startTranslation = async () => {
    if (files.size === 0) return;
    
    stopRef.current = false;
    setStatus('TRANSLATING');
    addLog(`Bắt đầu dịch sang ${targetLang}...`);

    const fileList = Array.from(files.entries()) as [string, ProcessedFile][];
    const translatableFiles = fileList.filter(([_, f]) => f.isText && isTranslatable(f.path));
    
    let completed = 0;
    const total = translatableFiles.length;

    for (const [path, file] of translatableFiles) {
      if (stopRef.current) {
        addLog('Đã dừng tiến trình dịch.', 'WARNING');
        break;
      }

      try {
        addLog(`Đang dịch: ${path}...`);
        const translated = await translateContent(path, file.originalContent as string, { targetLanguage: targetLang });
        
        if (path.endsWith('.json')) {
          try {
            JSON.parse(translated);
          } catch (e: any) {
            const errorMessage = e.message || 'Unknown JSON error';
            addLog(`Lỗi cú pháp JSON trong ${path}: ${errorMessage}`, 'WARNING');
            
            // Convert position to line/column
            const posMatch = errorMessage.match(/at position (\d+)/i);
            let detailedError = errorMessage;
            if (posMatch) {
              const pos = parseInt(posMatch[1]);
              const lines = translated.substring(0, pos).split('\n');
              const line = lines.length;
              const col = lines[lines.length - 1].length + 1;
              detailedError = `${errorMessage} (Line ${line}, Col ${col})`;
            }

            setFiles((prev: Map<string, ProcessedFile>) => {
              const next = new Map(prev);
              const f = next.get(path);
              if (f) next.set(path, { 
                ...f, 
                status: 'ERROR', 
                error: detailedError,
                translatedContent: translated
              });
              return next;
            });
            continue;
          }
        }

        setFiles((prev: Map<string, ProcessedFile>) => {
          const next = new Map(prev);
          const f = next.get(path);
          if (f) next.set(path, { ...f, translatedContent: translated, status: 'SUCCESS' });
          return next;
        });
      } catch (e) {
        addLog(`Lỗi dịch ${path}: ${e}`, 'ERROR');
        setFiles((prev: Map<string, ProcessedFile>) => {
          const next = new Map(prev);
          const f = next.get(path);
          if (f) next.set(path, { ...f, status: 'ERROR', error: String(e) });
          return next;
        });
      }

      completed++;
      setProgress(Math.round((completed / total) * 100));
    }

    setStatus('DONE');
    addLog('Tiến trình dịch hoàn tất.', 'SUCCESS');
  };

  const downloadResult = async () => {
    setStatus('EXPORTING');
    addLog('Đang đóng gói tệp...');
    
    const exportFiles = new Map<string, Uint8Array | string>();
    for (const [path, file] of files.entries()) {
      const finalContent = (file.status === 'SUCCESS' && file.translatedContent) 
        ? file.translatedContent 
        : file.originalContent;
      
      exportFiles.set(path, finalContent);
    }

    try {
      const blob = await createZip(exportFiles);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mc_addon_translated_${targetLang.toLowerCase()}.mcaddon`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      addLog('Đã tải xuống thành công!', 'SUCCESS');
    } catch (e) {
      addLog(`Lỗi khi đóng gói: ${e}`, 'ERROR');
    }
    setStatus('DONE');
  };

  const filteredFiles = (Array.from(files.values()) as ProcessedFile[]).filter(f => 
    f.path.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col h-screen w-full bg-[#0c0d0e] text-gray-200 font-sans overflow-hidden md:border-4 border-[#1a1c1e]">
      {/* Header */}
      <header className="flex items-center justify-between px-4 md:px-6 py-3 md:py-4 bg-[#15171a] border-b border-[#2d3139] shadow-lg shrink-0">
        <div className="flex items-center space-x-2 md:space-x-3">
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-1.5 hover:bg-white/5 rounded-md md:hidden"
          >
            <Settings className="w-5 h-5 text-green-500" />
          </button>
          <div className="w-7 h-7 md:w-8 md:h-8 bg-green-500 rounded flex items-center justify-center shadow-[0_0_15px_rgba(34,197,94,0.4)] shrink-0">
            <svg className="w-4 h-4 md:w-5 md:h-5 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path>
            </svg>
          </div>
          <div className="hidden sm:block">
            <h1 className="text-sm md:text-lg font-bold tracking-tight text-white uppercase">MC-Trans <span className="text-green-500">v2.0</span></h1>
            <p className="text-[9px] md:text-[10px] text-gray-500 font-mono tracking-widest uppercase truncate">ADDON LOCALIZATION</p>
          </div>
        </div>

        <div className="flex items-center space-x-2 md:space-x-4">
          <div className="flex items-center bg-[#1c1f24] border border-[#373c44] rounded px-2 md:px-3 py-1 md:py-1.5 focus-within:border-green-500 transition-colors">
            <span className="hidden lg:inline text-[10px] font-bold text-gray-500 mr-2 uppercase">Language:</span>
            <select 
              value={targetLang}
              onChange={(e) => setTargetLang(e.target.value)}
              className="bg-transparent text-xs md:text-sm font-medium text-white focus:outline-none cursor-pointer"
            >
              {LANGUAGES.map(lang => (
                <option key={lang.value} value={lang.value} className="bg-[#1c1f24]">{lang.label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center space-x-1 md:space-x-2">
            <button 
              onClick={startTranslation}
              disabled={status === 'TRANSLATING' || status === 'SCANNING' || files.size === 0}
              className="px-2 md:px-4 py-1.5 bg-[#22c55e] hover:bg-[#16a34a] disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold text-[10px] md:text-sm rounded shadow-[0_0_20px_rgba(34,197,94,0.2)] flex items-center gap-1 md:gap-2 transition-all active:scale-95"
            >
              {status === 'TRANSLATING' ? <Loader2 className="w-3.5 h-3.5 md:w-4 md:h-4 animate-spin" /> : 
                <span className="hidden xs:inline">START</span>}
              <span className="xs:hidden">GO</span>
            </button>
            <button 
              onClick={() => stopRef.current = true}
              disabled={status !== 'TRANSLATING'}
              className="px-2 md:px-4 py-1.5 bg-[#ef4444] hover:bg-[#dc2626] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-[10px] md:text-sm rounded flex items-center gap-1 md:gap-2 transition-all active:scale-95"
            >
              STOP
            </button>
            <button 
              onClick={downloadResult}
              disabled={files.size === 0 || status === 'TRANSLATING'}
              className="px-2 md:px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-[10px] md:text-sm rounded flex items-center gap-1 md:gap-2 transition-all active:scale-95"
            >
              <Download className="w-3 h-3 md:w-4 md:h-4" />
              <span className="hidden md:inline">EXPORT</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden relative">
        {/* Sidebar */}
        <aside className={cn(
          "fixed inset-y-0 left-0 z-40 w-72 bg-[#0e1013] border-r border-[#2d3139] flex flex-col transition-transform duration-300 md:relative md:translate-x-0 md:z-0",
          isSidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}>
          <div className="p-3 bg-[#15171a] border-b border-[#2d3139] flex items-center justify-between">
            <span className="text-[11px] font-bold text-gray-500 uppercase">File Explorer</span>
            <div className="flex items-center gap-2">
              <span className="text-[11px] px-1.5 py-0.5 bg-[#2d3139] rounded text-gray-400">{files.size}</span>
              <button onClick={() => setIsSidebarOpen(false)} className="md:hidden">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          
          <div className="p-2 border-b border-[#2d3139]">
            <input 
              type="text" 
              placeholder="Filter files..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-[#111315] border border-[#2d3139] rounded px-3 py-1.5 text-xs font-mono placeholder:text-gray-600 focus:outline-none focus:border-green-500/50"
            />
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1 font-mono text-xs custom-scrollbar">
            {files.size === 0 ? (
              <div 
                onClick={() => document.getElementById('fileInput')?.click()}
                className="flex-1 flex flex-col items-center justify-center py-12 opacity-30 cursor-pointer hover:opacity-50 border-2 border-dashed border-gray-800 rounded-lg m-2"
              >
                <Upload className="w-8 h-8 mb-2" />
                <p>Drop or Click</p>
                <input id="fileInput" type="file" multiple className="hidden" onChange={handleFileSelection} />
              </div>
            ) : (
              filteredFiles.map((file) => (
                <div 
                  key={file.path}
                  onClick={() => setSelectedFilePath(file.path)}
                  className={cn(
                    "flex items-center p-2 rounded group cursor-pointer border border-transparent transition-colors",
                    selectedFilePath === file.path 
                      ? "bg-[#22c55e15] border-[#22c55e50] text-green-400" 
                      : "hover:bg-[#1c1f24] text-gray-400"
                  )}
                >
                  <span className={cn(
                    "w-2 h-2 rounded-full mr-2 shrink-0",
                    file.status === 'SUCCESS' ? "bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.5)]" :
                    file.status === 'ERROR' ? "bg-red-500 shadow-[0_0_5px_rgba(239,68,68,0.5)]" :
                    file.status === 'PENDING' ? "bg-blue-500" : "bg-gray-500"
                  )}></span>
                  <span className="truncate flex-1">{file.path}</span>
                </div>
              ))
            )}
          </div>

          <div className="p-4 bg-[#15171a] border-t border-[#2d3139]">
            <div className="flex justify-between text-[10px] mb-1 text-gray-400 font-bold uppercase">
              <span>Processing Queue</span>
              <span>{progress}%</span>
            </div>
            <div className="w-full h-1 bg-gray-800 rounded-full overflow-hidden">
              <motion.div 
                className="h-full bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]" 
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </aside>

        {/* Content Section */}
        <section 
          className="flex-1 flex flex-col bg-[#0c0d0e] overflow-hidden relative"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* Drag Overlay */}
          <AnimatePresence>
            {isDragging && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-50 flex items-center justify-center bg-green-500/10 backdrop-blur-sm border-4 border-dashed border-green-500/50 m-4 rounded-2xl"
              >
                <div className="flex flex-col items-center">
                  <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center shadow-[0_0_30px_rgba(34,197,94,0.4)] animate-bounce">
                    <Upload className="w-10 h-10 text-black" />
                  </div>
                  <h2 className="mt-6 text-2xl font-bold text-white uppercase tracking-tighter">Release to Upload</h2>
                  <p className="text-green-500 font-mono text-sm uppercase">Archive Protocol Detected</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {files.size === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-8">
              <div className="relative group cursor-pointer" onClick={() => document.getElementById('fileInputMain')?.click()}>
                <input id="fileInputMain" type="file" multiple className="hidden" onChange={handleFileSelection} />
                <div className="absolute inset-0 bg-green-500/20 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity rounded-full" />
                <div className="relative w-48 h-48 md:w-64 md:h-64 border-2 border-dashed border-[#2d3139] group-hover:border-green-500/50 rounded-3xl flex flex-col items-center justify-center transition-all bg-[#0e1013] shadow-2xl animate-pulse group-hover:animate-none">
                  <div className="p-6 bg-green-500/10 rounded-2xl mb-4 group-hover:scale-110 transition-transform">
                    <Upload className="w-12 h-12 text-green-500" />
                  </div>
                  <p className="text-sm font-bold text-gray-500 uppercase tracking-[0.2em]">Drop Archive Here</p>
                </div>
                <div className="mt-8 space-y-2">
                  <h3 className="text-xl font-bold text-white uppercase tracking-tighter">Initialize Payload</h3>
                  <p className="text-[10px] text-gray-500 max-w-xs mx-auto font-mono uppercase tracking-widest">Supports MCPACK / MCADDON / ZIP / FOLDER</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-3 md:p-6 flex flex-col space-y-4 overflow-hidden">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between shrink-0 gap-2">
              <div className="flex space-x-1 shrink-0 overflow-x-auto pb-1 sm:pb-0">
                {selectedFilePath ? (
                  <>
                    <span className="px-2 py-0.5 md:py-1 bg-[#1a1c1e] text-[9px] md:text-[10px] border border-[#2d3139] text-gray-400 whitespace-nowrap">
                      Enc: {files.get(selectedFilePath)?.encoding || 'N/A'}
                    </span>
                    <span className="px-2 py-0.5 md:py-1 bg-[#1a1c1e] text-[9px] md:text-[10px] border border-[#2d3139] text-gray-400 whitespace-nowrap">
                      Stat: {files.get(selectedFilePath)?.status}
                    </span>
                  </>
                ) : (
                  <span className="px-2 py-0.5 md:py-1 bg-[#1a1c1e] text-[9px] md:text-[10px] border border-[#2d3139] text-gray-400 uppercase tracking-widest">Protocol Active</span>
                )}
              </div>
              <div className="text-[10px] md:text-xs text-green-500 font-mono truncate max-w-full">
                {selectedFilePath ? `diff --git ${selectedFilePath}` : 'Waiting for protocol payload...'}
              </div>
            </div>

            <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 overflow-hidden">
              <div className="bg-[#090a0b] border border-[#2d3139] rounded overflow-hidden flex flex-col min-h-[150px]">
                <div className="p-2 bg-[#15171a] border-b border-[#2d3139] text-[10px] md:text-[11px] font-bold text-gray-500 uppercase tracking-widest shrink-0">ORIGINAL SOURCE</div>
                <div className="flex-1 p-3 md:p-4 font-mono text-[10px] md:text-xs text-gray-400 overflow-auto leading-relaxed custom-scrollbar bg-black/20">
                  <pre className="m-0">
                    <code className={cn(
                      selectedFilePath?.endsWith('.js') ? "language-javascript" :
                      selectedFilePath?.endsWith('.ts') ? "language-typescript" : "language-json"
                    )}>
                      {selectedFilePath ? (
                        typeof files.get(selectedFilePath)?.originalContent === 'string' 
                          ? (files.get(selectedFilePath)?.originalContent as string) 
                          : "[Binary Content]"
                      ) : "// Select a resource to decode"}
                    </code>
                  </pre>
                </div>
              </div>

              <div className="bg-[#090a0b] border border-[#22c55e30] rounded overflow-hidden flex flex-col shadow-[inset_0_0_30px_rgba(34,197,94,0.05)] min-h-[150px]">
                <div className="p-2 bg-[#15171a] border-b border-[#2d3139] text-[10px] md:text-[11px] font-bold text-green-500 flex justify-between uppercase tracking-widest shrink-0">
                  <div className="flex items-center gap-2">
                    <span>TRANSLATED PREVIEW</span>
                    {selectedFilePath && files.get(selectedFilePath)?.status === 'ERROR' && (
                      <span className="text-red-500 bg-red-500/10 px-1.5 py-0.5 rounded text-[9px] animate-pulse">SYNTAX ERROR</span>
                    )}
                  </div>
                  <span className="text-[9px] bg-green-500/20 px-1 rounded hidden sm:inline">OUTPUT</span>
                </div>
                {selectedFilePath && files.get(selectedFilePath)?.status === 'ERROR' && (
                  <div className="px-4 py-2 bg-red-500/10 border-b border-red-500/20 text-red-500 text-[10px] font-mono flex items-center gap-2 shrink-0">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>{files.get(selectedFilePath)?.error}</span>
                  </div>
                )}
                <div className="flex-1 p-3 md:p-4 font-mono text-[10px] md:text-xs text-gray-200 overflow-auto leading-relaxed custom-scrollbar bg-black/20">
                  <pre className="m-0">
                    <code className={cn(
                      selectedFilePath?.endsWith('.js') ? "language-javascript" :
                      selectedFilePath?.endsWith('.ts') ? "language-typescript" : "language-json"
                    )}>
                      {selectedFilePath ? (
                        files.get(selectedFilePath)?.translatedContent 
                          ? (files.get(selectedFilePath)?.translatedContent as string) 
                          : "// Waiting for localization sequence..."
                      ) : "// Resource preview disabled"}
                    </code>
                  </pre>
                </div>
              </div>
              </div>
            </div>
          )}

          {/* Terminal */}
          <div className="h-48 border-t border-[#2d3139] bg-[#090a0b] flex flex-col">
            <div className="flex items-center px-4 py-2 bg-[#15171a] border-b border-[#2d3139]">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em]">System Terminal Output</span>
              </div>
            </div>
            <div className="flex-1 p-3 font-mono text-[11px] text-gray-500 overflow-y-auto space-y-1 custom-scrollbar">
              {logs.length === 0 ? (
                <div className="flex animate-pulse"><span className="text-green-500 mr-2">_</span> Waiting for user input...</div>
              ) : (
                logs.map(log => (
                  <div key={log.id} className="flex">
                    <span className={cn(
                      "mr-2 whitespace-nowrap uppercase w-14",
                      log.level === 'SUCCESS' ? "text-green-500" :
                      log.level === 'ERROR' ? "text-red-500" :
                      log.level === 'WARNING' ? "text-yellow-500" : "text-blue-500"
                    )}>[{log.level}]</span>
                    <span className="opacity-80 break-all">{log.message}</span>
                  </div>
                ))
              )}
              <div ref={logEndRef} />
            </div>
          </div>
        </section>
      </main>

      <footer className="px-4 py-2 bg-[#1c1f24] border-t border-[#2d3139] flex justify-between items-center shrink-0">
        <div className="flex space-x-4 text-[10px] text-gray-500 font-mono uppercase">
          <span>CPU: {status === 'TRANSLATING' ? '84%' : '12%'}</span>
          <span>MEMORY: 512MB</span>
          <span>ENGINE: GEMINI_3_FLASH</span>
        </div>
        <div className="flex items-center space-x-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest">
          <span>Session: {new Date().toLocaleDateString()}</span>
          <span className={status === 'TRANSLATING' ? 'text-amber-500' : 'text-green-600'}>
            Status: {status}
          </span>
        </div>
      </footer>
    </div>
  );
}

import { useState, useMemo } from 'react';
import type { DragEvent, ChangeEvent, FormEvent } from 'react';
import axios from 'axios';
import './App.css';

interface CVResult {
  name: string;
  filename: string;
  email: string;
  phone: string;
  score: number;
  matched_keywords: string[];
  text: string;
}

// Nueva interfaz para las competencias
interface KeywordData {
  word: string;
  isMust: boolean;
}

function App() {
  const [files, setFiles] = useState<File[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [results, setResults] = useState<CVResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  
  // --- FASE 3: Estado de Competencias con Obligatoriedad ---
  const [keywordList, setKeywordList] = useState<KeywordData[]>([
    { word: '', isMust: true },  // El primero lo dejamos obligatorio por defecto
    { word: '', isMust: false },
    { word: '', isMust: false },
    { word: '', isMust: false }
  ]);
  const defaultPlaceholders = ['Responsable', 'Puntual', 'Proactivo', 'Excel'];

  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [filterSkill, setFilterSkill] = useState<string>('All');

  const handleKeywordChange = (index: number, value: string) => {
    const newList = [...keywordList];
    newList[index].word = value;
    setKeywordList(newList);
  };

  const toggleMustHave = (index: number) => {
    const newList = [...keywordList];
    newList[index].isMust = !newList[index].isMust;
    setKeywordList(newList);
  };

  const addKeywordInput = () => { setKeywordList([...keywordList, { word: '', isMust: false }]); };

  const removeKeywordInput = (index: number) => {
    if (keywordList.length > 4) {
      const newList = keywordList.filter((_, i) => i !== index);
      setKeywordList(newList);
    }
  };

  const addFilesToList = (newFiles: FileList | null) => {
    if (!newFiles) return;
    const incomingFiles = Array.from(newFiles);
    setFiles(prevFiles => {
      const filteredNewFiles = incomingFiles.filter(
        newFile => !prevFiles.some(prevFile => prevFile.name === newFile.name && prevFile.size === newFile.size)
      );
      return [...prevFiles, ...filteredNewFiles];
    });
    setError(null);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); setIsDragging(false); };
  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault(); setIsDragging(false);
    if (e.dataTransfer.files) addFilesToList(e.dataTransfer.files);
  };
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => { addFilesToList(e.target.files); };
  const clearFiles = () => { setFiles([]); setResults([]); setFilterSkill('All'); };

  const handleOpenCV = (filename: string) => {
    const file = files.find(f => f.name === filename);
    if (file) {
      const fileURL = URL.createObjectURL(file);
      window.open(fileURL, '_blank');
      setTimeout(() => URL.revokeObjectURL(fileURL), 10000);
    }
  };

  const getGmailLink = (email: string) => `https://mail.google.com/mail/?view=cm&fs=1&to=${email}`;
  const getWhatsAppLink = (phone: string) => {
    let cleanPhone = phone.replace(/[^\d+]/g, '');
    if (cleanPhone.length === 9 && cleanPhone.startsWith('9')) cleanPhone = '56' + cleanPhone;
    if (cleanPhone.startsWith('+')) cleanPhone = cleanPhone.substring(1);
    return `https://wa.me/${cleanPhone}`;
  };

  // --- FASE 3: Exportar a CSV ---
  const exportToCSV = () => {
    const headers = ['Nombre Candidato', 'Correo', 'Telefono', 'Puntaje (%)', 'Competencias Cumplidas', 'Nombre Archivo'];
    const rows = filteredAndSortedResults.map(cv => [
      `"${cv.name}"`,
      `"${cv.email}"`,
      `"${cv.phone}"`,
      `${cv.score}`,
      `"${cv.matched_keywords.join(', ')}"`,
      `"${cv.filename}"`
    ]);
    
    // Usamos BOM para que Excel detecte los tildes y caracteres latinos automáticamente
    const csvContent = "\uFEFF" + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'Reporte_Candidatos_ATS.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (files.length === 0) { setError('Por favor, selecciona al menos un documento.'); return; }
    
    setIsLoading(true); setError(null); setResults([]);
    
    const formData = new FormData();
    // Separamos en dos listas para el Backend
    const mustHaves = keywordList.filter(k => k.word.trim() !== '' && k.isMust).map(k => k.word).join(',');
    const niceToHaves = keywordList.filter(k => k.word.trim() !== '' && !k.isMust).map(k => k.word).join(',');
    
    formData.append('must_haves', mustHaves);
    formData.append('nice_to_haves', niceToHaves);
    files.forEach(file => { formData.append('files', file); });

    try {
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const response = await axios.post(`${API_URL}/api/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResults(response.data.results);
    } catch (err) {
      setError('Hubo un error al procesar los documentos.');
    } finally {
      setIsLoading(false);
    }
  };

  const filteredAndSortedResults = useMemo(() => {
    let output = [...results];
    if (filterSkill !== 'All') output = output.filter(cv => cv.matched_keywords.includes(filterSkill));
    output.sort((a, b) => sortOrder === 'desc' ? b.score - a.score : a.score - b.score);
    return output;
  }, [results, sortOrder, filterSkill]);

  const uniqueSkillsFound = useMemo(() => {
    const skills = new Set<string>();
    results.forEach(cv => cv.matched_keywords.forEach(sk => skills.add(sk)));
    return Array.from(skills);
  }, [results]);

  return (
    <div className="container">
      <header className="header">
        <h1>Filtros ATS 📄🔍</h1>
        <p>Procesa múltiples CVs al instante, filtra competencias y contacta al talento directamente.</p>
      </header>

      <form onSubmit={handleSubmit} className="main-form">
        <div className="search-bar">
          <label>Competencias requeridas: <small style={{fontWeight: 'normal', color: '#64748b'}}>(Haz clic en la estrella ⭐ para hacerla obligatoria)</small></label>
          <div className="keywords-input-container">
            {keywordList.map((kw, index) => (
              <div key={index} className={`keyword-input-box ${kw.isMust ? 'is-must' : ''}`}>
                <input 
                  type="text" 
                  placeholder={index < 4 ? defaultPlaceholders[index] : 'EJ: Herramienta o aptitud'} 
                  value={kw.word}
                  onChange={(e) => handleKeywordChange(index, e.target.value)}
                  disabled={isLoading}
                />
                
                {/* Botón de Estrella para Obligatorio */}
                <button 
                  type="button" 
                  className={`star-btn ${kw.isMust ? 'active' : ''}`} 
                  onClick={() => toggleMustHave(index)}
                  title={kw.isMust ? "Competencia Obligatoria" : "Competencia Deseable"}
                >
                  {kw.isMust ? '⭐' : '☆'}
                </button>

                {keywordList.length > 4 && (
                  <button type="button" className="remove-kw-btn" onClick={() => removeKeywordInput(index)}>✕</button>
                )}
              </div>
            ))}
            <button type="button" className="add-kw-btn" onClick={addKeywordInput} disabled={isLoading}>+ Agregar</button>
          </div>
        </div>

        <div className={`dropzone ${isDragging ? 'dragging' : ''} ${files.length > 0 ? 'has-files' : ''}`}
          onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
        >
          <div className="dropzone-content">
            <span className="icon">📂</span>
            {files.length > 0 ? (
              <div>
                <p><strong>{files.length} documento(s)</strong> seleccionados.</p>
                <button type="button" className="clear-btn" onClick={clearFiles}>Limpiar lista</button>
              </div>
            ) : (
              <p>Arrastra CVs aquí o haz clic para explorar.</p>
            )}
            <input type="file" accept=".pdf, .doc, .docx" multiple onChange={handleFileChange} disabled={isLoading} className="file-input-hidden" id="file-upload"/>
            <label htmlFor="file-upload" className="browse-btn">Añadir archivos</label>
          </div>
        </div>
        
        <button className="analyze-btn" type="submit" disabled={files.length === 0 || isLoading}>
          {isLoading ? '⚙️ Procesando documentos...' : '🚀 Analizar CVs'}
        </button>
      </form>

      {error && <div className="error-message">⚠️ {error}</div>}

      {results.length > 0 && (
        <div className="results-section">
          <div className="results-header">
            <h2>📊 Panel de Candidatos ({filteredAndSortedResults.length})</h2>
            
            <div className="filter-controls">
              <label>Filtrar por competencia:</label>
              <select value={filterSkill} onChange={(e) => setFilterSkill(e.target.value)}>
                <option value="All">Todas las competencias</option>
                {uniqueSkillsFound.map(skill => (
                  <option key={skill} value={skill}>{skill}</option>
                ))}
              </select>

              {/* --- BOTÓN DE EXPORTACIÓN --- */}
              <button onClick={exportToCSV} className="export-btn">
                📥 Exportar a Excel
              </button>
            </div>
          </div>

          <div className="table-container">
            <table className="ats-table">
              <thead>
                <tr>
                  <th>Información de Contacto</th>
                  <th>CV Original</th>
                  <th onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')} className="sortable-header" title="Clic para ordenar">
                    % Match {sortOrder === 'desc' ? '▼' : '▲'}
                  </th>
                  <th>Competencias Encontradas</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredAndSortedResults.map((cv, index) => (
                  <tr key={index} className={cv.score === 0 ? 'row-discarded' : ''}>
                    <td>
                      <div className="fw-bold">{cv.name}</div>
                      <div className="contact-info">
                        <small>📧 {cv.email}</small><br/>
                        <small>📱 {cv.phone}</small>
                      </div>
                    </td>
                    <td>
                      <span className="filename-badge" onClick={() => handleOpenCV(cv.filename)}>📄 {cv.filename}</span>
                    </td>
                    <td>
                      <div className="score-container">
                        <div className="score-bar-bg">
                          <div className="score-bar-fill" style={{ width: `${cv.score}%`, backgroundColor: cv.score >= 80 ? '#10b981' : cv.score >= 50 && cv.score > 0 ? '#f59e0b' : '#ef4444' }}></div>
                        </div>
                        <span className="score-text" style={{color: cv.score === 0 ? '#ef4444' : 'inherit'}}>{cv.score}%</span>
                      </div>
                      {cv.score === 0 && <small className="text-danger">Descartado (Falta Obligatorio)</small>}
                    </td>
                    <td>
                      <div className="keywords-container">
                        {cv.matched_keywords.length > 0 ? (
                          cv.matched_keywords.map((kw, i) => <span key={i} className="keyword-badge">{kw}</span>)
                        ) : (
                          <span className="text-muted">Ninguna</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="actions-container">
                        <a href={getGmailLink(cv.email)} target="_blank" rel="noopener noreferrer" className={`action-btn email-btn ${cv.email === 'No encontrado' ? 'disabled' : ''}`}>✉️ Gmail</a>
                        <a href={getWhatsAppLink(cv.phone)} target="_blank" rel="noopener noreferrer" className={`action-btn wa-btn ${cv.phone === 'No encontrado' ? 'disabled' : ''}`}>💬 WhatsApp</a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
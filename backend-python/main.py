from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import List
import pypdf
import docx
import io
import re

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- FASE 3: DICCIONARIO SEMÁNTICO DE SINÓNIMOS ---
SYNONYMS = {
    "react": ["reactjs", "react.js", "react js"],
    "node.js": ["node", "nodejs", "node js"],
    "inglés avanzado": ["c1", "c2", "bilingüe", "fluent english", "advanced english", "ingles avanzado"],
    "excel": ["microsoft excel", "hojas de cálculo"],
    "javascript": ["js", "ecmascript", "es6"],
    "python": ["python3", "python 3"],
    "liderazgo": ["líder", "manejo de equipos", "team leader", "jefatura"],
    "proactivo": ["proactividad", "iniciativa"]
}

def build_keyword_pattern(kw: str) -> str:
    kw_lower = kw.lower()
    terms = [kw]
    if kw_lower in SYNONYMS:
        terms.extend(SYNONYMS[kw_lower])
    
    escaped_terms = [re.escape(t) for t in terms]
    # Crea un regex que busca la palabra exacta o cualquiera de sus sinónimos
    return r'\b(' + '|'.join(escaped_terms) + r')\b'

@app.get("/")
def read_root():
    return {"message": "¡El ATS en Python está funcionando con IA Semántica! 🐍🚀"}

# --- FASE 3: Ahora recibimos Must-Haves y Nice-to-Haves separados ---
@app.post("/api/upload")
async def upload_cvs(
    files: List[UploadFile] = File(...), 
    must_haves: str = Form(""),
    nice_to_haves: str = Form("")
):
    if not files:
        raise HTTPException(status_code=400, detail="No se subieron archivos.")

    must_list = [k.strip() for k in must_haves.split(",")] if must_haves.strip() else []
    nice_list = [k.strip() for k in nice_to_haves.split(",")] if nice_to_haves.strip() else []
    
    results = []

    for cv in files:
        extracted_text = ""
        try:
            file_bytes = await cv.read()
            file_stream = io.BytesIO(file_bytes)

            if cv.content_type == "application/pdf":
                reader = pypdf.PdfReader(file_stream)
                for page in reader.pages:
                    text = page.extract_text()
                    if text: extracted_text += text + "\n"
            elif cv.content_type in ["application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]:
                doc = docx.Document(file_stream)
                for para in doc.paragraphs: extracted_text += para.text + "\n"
            else:
                continue

            email_match = re.search(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', extracted_text)
            email = email_match.group(0) if email_match else "No encontrado"

            phone_match = re.search(r'(?:\+?56[\s-]?)?(?:9[\s-]?\d{4}[\s-]?\d{4})', extracted_text)
            phone = phone_match.group(0) if phone_match else "No encontrado"

            # Extracción de Nombre Mejorada
            lines = [line.strip() for line in extracted_text.split('\n') if line.strip()]
            candidate_name = "Candidato Desconocido"
            for line in lines[:5]:
                if not any(char.isdigit() for char in line) and 3 < len(line) < 35:
                    candidate_name = line
                    break

            # --- FASE 3: LÓGICA DE PUNTUACIÓN ESTRICTA ---
            matched_keywords = []
            
            # Evaluar Obligatorios (Must-haves)
            passed_must_haves = True
            matched_must = 0
            for kw in must_list:
                pattern = build_keyword_pattern(kw)
                if re.search(pattern, extracted_text, re.IGNORECASE):
                    matched_keywords.append(kw)
                    matched_must += 1
                else:
                    passed_must_haves = False

            # Evaluar Deseables (Nice-to-haves)
            matched_nice = 0
            for kw in nice_list:
                pattern = build_keyword_pattern(kw)
                if re.search(pattern, extracted_text, re.IGNORECASE):
                    matched_keywords.append(kw)
                    matched_nice += 1

            # Calcular el % Total
            total_words = len(must_list) + len(nice_list)
            score = 0
            if total_words > 0:
                score = round(((matched_must + matched_nice) / total_words) * 100)
                
                # REGLA DE ORO: Si falla un obligatorio, se descarta (0%)
                if must_list and not passed_must_haves:
                    score = 0

            results.append({
                "name": candidate_name,
                "filename": cv.filename,
                "email": email,
                "phone": phone,
                "score": score,
                "matched_keywords": matched_keywords,
                "text": extracted_text.strip()
            })

        except Exception as e:
            print(f"Error procesando {cv.filename}: {e}")

    return {"results": results}
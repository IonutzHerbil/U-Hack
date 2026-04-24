# ⚽ Football Scouting Insight App (Hackathon Concept)

## 🧠 Idee generală

Aplicația analizează datele de meci (Wyscout) pentru a identifica stilul de joc al echipei FC Universitatea Cluj și pentru a oferi recomandări de scouting bazate pe obiective tactice.

---

## 🎯 Obiective

* Determinarea stilului de joc actual:

  * Direct play
  * Contraatac rapid
  * Posesie
  * Joc pe flancuri
  * Pase lungi / scurte
* Evaluarea nivelului echipei pe fiecare stil (scoruri/metrici)
* Identificarea:

  * 🔼 jucătorilor potriviți pentru dezvoltarea unui stil dorit
  * 🔽 (opțional) jucătorilor care nu se potrivesc stilului

---

## 📊 Cum gândim problema

### 1. Extracție feature-uri din date

Din evenimentele Wyscout:

* pase (lungime, direcție, viteză)
* recuperări / intercepții
* tranziții (defensiv → ofensiv)
* poziționare pe teren
* tempo (timp între acțiuni)

### 2. Definire stiluri (heuristici simple)

Exemple:

* **Direct play** → multe pase lungi + progresie rapidă
* **Contraatac** → recuperare + șut în timp scurt
* **Posesie** → multe pase scurte consecutive

→ fiecare stil = set de reguli + scor

### 3. Scoring echipă

* pentru fiecare stil → scor [0–1] sau %
* output: profil tactic

### 4. Scouting

* comparăm profilul dorit vs actual
* filtrăm jucători din dataset:

  * care au metrici compatibile cu stilul dorit
* ranking simplu (scor compatibilitate)

---

## 💡 Output (UI simplu)

* Radar chart / bar chart cu stilurile echipei
* Recomandări jucători:

  * “Top 5 pentru contraatac”
* (optional) insights text:

  * “Echipa joacă lent, lipsă progresie verticală”

---

## ⚙️ Tehnologie (rapid de implementat)

### Backend

* Python + Pandas (analiză date)
* FastAPI (API rapid)
* eventual scikit-learn (clustering simplu, dacă aveți timp)

### Data processing

* batch processing (nu realtime)
* JSON / CSV din Wyscout

### Frontend

* React / Next.js
* Chart libs:

  * Recharts / Chart.js

### Vizualizare

* Radar charts (profil stil)
* tabel jucători recomandați

### Arhitectură simplă

* script Python → calculează metrici
* API → servește rezultate
* frontend → vizualizează

---

## 🚀 MVP (ce faceți sigur în hackathon)

1. Calcul stiluri
2. Vizualizare profil echipă
3. Recomandare simplă jucători (top N)


"""Build a public metadata snapshot and a local relational catalog."""
import argparse
import datetime as dt
import json
import sqlite3
import subprocess
from pathlib import Path

CASES = [
    ("semaglutide","司美格鲁肽","Semaglutide","Wegovy,Ozempic,Rybelsus","GLP-1R","代谢与内分泌","肥胖,超重","NCT03548935","33567185"),
    ("pembrolizumab","帕博利珠单抗","Pembrolizumab","Keytruda,帕博利珠单抗","PD-1","肿瘤治疗","非小细胞肺癌","NCT02142738","27718847"),
    ("trastuzumab-deruxtecan","德曲妥珠单抗","Trastuzumab deruxtecan","Enhertu,T-DXd,DS-8201a","HER2","肿瘤治疗","乳腺癌","NCT03529110","35320644"),
    ("osimertinib","奥希替尼","Osimertinib","Tagrisso,AZD9291","EGFR","肿瘤治疗","非小细胞肺癌","NCT02296125","29151359"),
    ("upadacitinib","乌帕替尼","Upadacitinib","Rinvoq,ABT-494,乌帕替尼","JAK1","免疫与炎症","类风湿关节炎","NCT02629159","42342288"),
]

def get(url):
    return json.loads(subprocess.check_output(["curl","-fsSL","--max-time","25","--retry","1",url]))

def load(source, key, url):
    return json.loads((source / f"{key}.json").read_text()) if source else get(url)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--sources", type=Path)
    parser.add_argument("--db", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    pmids = ",".join(c[-1] for c in CASES)
    literature_url = f"https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id={pmids}&retmode=json"
    articles = load(args.sources, "pubmed", literature_url)["result"]
    catalog = []
    with sqlite3.connect(args.db) as db:
        db.execute("PRAGMA foreign_keys=ON")
        db.executescript("""
        CREATE TABLE IF NOT EXISTS drug(id TEXT PRIMARY KEY, name TEXT NOT NULL, generic TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS tag(kind TEXT, name TEXT, PRIMARY KEY(kind,name));
        CREATE TABLE IF NOT EXISTS drug_tag(drug_id TEXT REFERENCES drug(id), kind TEXT, name TEXT, PRIMARY KEY(drug_id,kind,name), FOREIGN KEY(kind,name) REFERENCES tag(kind,name));
        CREATE TABLE IF NOT EXISTS trial(nct_id TEXT PRIMARY KEY, source_json TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS literature(pmid TEXT PRIMARY KEY, doi TEXT, source_json TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS drug_trial(drug_id TEXT REFERENCES drug(id), nct_id TEXT REFERENCES trial(nct_id), PRIMARY KEY(drug_id,nct_id));
        CREATE TABLE IF NOT EXISTS trial_literature(nct_id TEXT REFERENCES trial(nct_id), pmid TEXT REFERENCES literature(pmid), locator TEXT NOT NULL, PRIMARY KEY(nct_id,pmid));
        CREATE TABLE IF NOT EXISTS evidence(id TEXT PRIMARY KEY, nct_id TEXT NOT NULL REFERENCES trial(nct_id), locator TEXT NOT NULL, statement TEXT NOT NULL, source_json TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS adverse_event(id TEXT PRIMARY KEY, drug_id TEXT NOT NULL REFERENCES drug(id), nct_id TEXT REFERENCES trial(nct_id), term TEXT NOT NULL, source_url TEXT NOT NULL, denominator INTEGER, numerator INTEGER);
        """)
        for id, name, generic, aliases, target, field, condition, nct, pmid in CASES:
            url = f"https://clinicaltrials.gov/api/v2/studies/{nct}"
            study = load(args.sources, nct, url)
            p = study["protocolSection"]
            assert p["identificationModule"]["nctId"] == nct and articles[pmid]["uid"] == pmid
            design = p["designModule"]
            outcomes = []
            for ix, outcome in enumerate(study.get("resultsSection", {}).get("outcomeMeasuresModule", {}).get("outcomeMeasures", [])):
                if outcome.get("type") == "PRIMARY":
                    outcomes.append({**outcome, "locator": f"resultsSection.outcomeMeasuresModule.outcomeMeasures[{ix}]"})
            trial = dict(id=nct, title=p["identificationModule"]["briefTitle"], updated=p["statusModule"]["lastUpdatePostDateStruct"]["date"],
                status=p["statusModule"]["overallStatus"], sponsor=p["sponsorCollaboratorsModule"]["leadSponsor"]["name"],
                phases=design.get("phases", []), enrollment=design.get("enrollmentInfo", {}), design=design.get("designInfo", {}),
                planned=p.get("outcomesModule", {}).get("primaryOutcomes", []), reported=study["hasResults"], outcomes=outcomes, source=url)
            a = articles[pmid]
            doi = next((i["value"] for i in a.get("articleids", []) if i["idtype"] == "doi"), None)
            article = dict(id=pmid, title=a["title"], doi=doi, date=a["pubdate"], journal=a["fulljournalname"],
                kind=a.get("pubtype", []), followup=id=="upadacitinib")
            row = dict(id=id,name=name,generic=generic,aliases=aliases.split(","),targets=[target],fields=[field],conditions=condition.split(","),trial=trial,article=article)
            catalog.append(row)
            db.execute("INSERT INTO drug VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,generic=excluded.generic",(id,name,generic))
            for kind, values in [("alias", row["aliases"]),("target", row["targets"]),("area",row["fields"]),("study_condition",row["conditions"])]:
                for value in values:
                    db.execute("INSERT OR IGNORE INTO tag VALUES(?,?)",(kind,value))
                    db.execute("INSERT OR IGNORE INTO drug_tag VALUES(?,?,?)",(id,kind,value))
            for table, record_id, record in [("trial",nct,trial),("literature",pmid,article)]:
                serialized = json.dumps(record, ensure_ascii=False)
                if table=="trial":
                    db.execute("INSERT INTO trial VALUES(?,?) ON CONFLICT(nct_id) DO UPDATE SET source_json=excluded.source_json",(record_id,serialized))
                else:
                    db.execute("INSERT INTO literature VALUES(?,?,?) ON CONFLICT(pmid) DO UPDATE SET doi=excluded.doi,source_json=excluded.source_json",(record_id,doi,serialized))
            db.execute("INSERT OR IGNORE INTO drug_trial VALUES(?,?)",(id,nct))
            db.execute("INSERT OR IGNORE INTO trial_literature VALUES(?,?,?)",(nct,pmid,f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/"))
            db.execute("DELETE FROM evidence WHERE nct_id=?",(nct,))
            for outcome in outcomes:
                loc=outcome["locator"]
                db.execute("INSERT INTO evidence VALUES(?,?,?,?,?)",(f"{nct}:{loc}",nct,loc,outcome["title"],json.dumps(outcome,ensure_ascii=False)))
        assert not db.execute("PRAGMA foreign_key_check").fetchall()
    args.output.write_text(json.dumps({"retrieved":dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).date().isoformat(),"drugs":catalog},ensure_ascii=False,separators=(",",":"))+"\n")

if __name__ == "__main__":
    main()

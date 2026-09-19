/* ==========================================================================
   Report builder client — talks to the Google Apps Script web app (Code.gs).

   Sends the two CSV texts (this night + whole season) and gets back a formatted
   Excel workbook and PDF. Used by the "Build report" button on the Admin page's
   Stats & export tab.

   SETUP: deploy Code.gs as a Web app (Execute as: Me, Who has access: Anyone)
   and paste its URL into REPORT_URL below.

   THE KEY: nothing secret lives in this file, so it's safe in a public repo.
   The first time you click the button the page asks for the key (the
   WEB_APP_KEY you set in Code.gs) and remembers it in that browser. If the
   server rejects it, the page forgets it and asks again next time.
   ========================================================================== */

export const REPORT_URL = 'https://script.google.com/macros/library/d/14IFMi2pBG9Xlsp2QMEHXNuxKSuoEmXllTcb4PJSiwJ9Nt-tZbFfxLojk/1';
const KEY_STORAGE = 'dartReportKey';

export function forgetReportKey() {
  try { localStorage.removeItem(KEY_STORAGE); } catch (e) { /* storage unavailable */ }
}

function getReportKey() {
  let key = '';
  try { key = localStorage.getItem(KEY_STORAGE) || ''; } catch (e) { /* storage unavailable */ }
  if (!key) {
    key = (window.prompt('Report key (the WEB_APP_KEY from Code.gs):') || '').trim();
    if (key) { try { localStorage.setItem(KEY_STORAGE, key); } catch (e) { /* keep for this call only */ } }
  }
  return key;
}

/** Sends both CSVs; resolves with {ok, links, files:{xlsx,pdf}, warnings} or throws an Error with a readable message. */
export async function requestReport(nightCsvText, seasonCsvText, { fetchFn = (...a) => fetch(...a), key } = {}) {
  if (REPORT_URL.includes('PASTE_YOUR')) {
    throw new Error("The report builder isn't set up yet — paste your Apps Script Web app URL into lib/report.js.");
  }
  key = key || getReportKey();
  if (!key) throw new Error('No report key entered.');
  const res = await fetchFn(REPORT_URL, {
    method: 'POST',
    // text/plain keeps this a "simple" request, so the browser doesn't need a CORS preflight
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ key, night: nightCsvText, season: seasonCsvText }),
    redirect: 'follow',
  });
  const data = await res.json();
  if (!data.ok) {
    if (data.error === 'Not authorised') forgetReportKey();
    throw new Error(data.error || 'The report builder returned an error.');
  }
  const hasFiles = data.files && data.files.pdf && data.files.xlsx;
  const hasLinks = data.links && (data.links.pdf || data.links.xlsx);
  if (!hasFiles && !hasLinks) {
    throw new Error(`The report builder replied but sent no files (it said: ${JSON.stringify(data).slice(0, 160)}). ` +
      'This usually means the Apps Script deployment is out of date: in Apps Script, use Deploy → Manage deployments → Edit → New version.');
  }
  return data;
}

function base64ToBlob(b64, mime) {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: mime });
}

/** Turns a successful response into links: [{label, url, name?, newTab?, blob?}]. Call revokeDownloads() when done with them. */
export function reportDownloads(data) {
  const out = [];
  if (data.files && data.files.pdf && data.files.xlsx) {
    out.push(
      { label: 'Download PDF', name: data.files.pdf.name, url: URL.createObjectURL(base64ToBlob(data.files.pdf.base64, 'application/pdf')), blob: true },
      { label: 'Download Excel', name: data.files.xlsx.name,
        url: URL.createObjectURL(base64ToBlob(data.files.xlsx.base64, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')), blob: true });
  } else if (data.links) {
    // The report was built and saved in Drive but the files weren't sent back: link to the Drive copies instead.
    if (data.links.pdf) out.push({ label: 'Open PDF in Drive', url: data.links.pdf, newTab: true });
    if (data.links.xlsx) out.push({ label: 'Open Excel in Drive', url: data.links.xlsx, newTab: true });
    if (data.links.sheet) out.push({ label: 'Open Google Sheet', url: data.links.sheet, newTab: true });
  }
  if (data.links && data.links.folder) out.push({ label: 'Open Drive folder', url: data.links.folder, newTab: true });
  return out;
}

export function revokeDownloads(list) {
  (list || []).forEach((d) => { if (d.blob) URL.revokeObjectURL(d.url); });
}

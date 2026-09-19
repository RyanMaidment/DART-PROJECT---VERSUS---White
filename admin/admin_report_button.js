/**
 * Admin page: "Build formatted report" button.
 *
 * Sends the two CSV texts to the Google Apps Script web app (Code.gs) and shows
 * download links for the finished Excel + PDF.
 *
 * SETUP
 *   1. Deploy Code.gs as a Web app (Execute as: Me, Who has access: Anyone) and paste its URL below.
 *   2. Set REPORT_KEY to the same long random string you put in CONFIG.WEB_APP_KEY in Code.gs.
 *   3. Add the button + wiring at the bottom to the Admin page, replacing the two
 *      getXxxCsvText() calls with however your Stats & Export code already builds its CSV text.
 *
 * NOTE: REPORT_KEY is visible to anyone who can view this page's source. That's fine if the
 * Admin page is already restricted; otherwise treat it as light protection only.
 */
const REPORT_URL = 'https://script.google.com/macros/s/PASTE_YOUR_DEPLOYMENT_ID_HERE/exec';
const REPORT_KEY = 'PASTE_THE_SAME_LONG_RANDOM_STRING_HERE';

/** DOM-free core: returns {ok, links, files:{xlsx:{name,base64}, pdf:{name,base64}}, warnings} or throws. */
async function requestReport(nightCsvText, seasonCsvText, fetchFn = fetch) {
  const res = await fetchFn(REPORT_URL, {
    method: 'POST',
    // text/plain keeps this a "simple" request, so the browser doesn't need a CORS preflight
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ key: REPORT_KEY, night: nightCsvText, season: seasonCsvText }),
    redirect: 'follow',
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'The report builder returned an error.');
  return data;
}

function base64ToBlob(b64, mime) {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: mime });
}

/** Builds the report and puts two download links (PDF, Excel) into statusEl. */
async function buildLeagueReport(nightCsvText, seasonCsvText, statusEl) {
  statusEl.textContent = 'Building report… (about 30–60 seconds)';
  try {
    const data = await requestReport(nightCsvText, seasonCsvText);
    statusEl.textContent = '';
    const add = (label, file, mime) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(base64ToBlob(file.base64, mime));
      a.download = file.name;
      a.textContent = label;
      a.style.marginRight = '1.2em';
      statusEl.appendChild(a);
    };
    add('Download PDF', data.files.pdf, 'application/pdf');
    add('Download Excel', data.files.xlsx, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    (data.warnings || []).forEach((w) => {
      const p = document.createElement('div');
      p.textContent = 'Warning: ' + w;
      statusEl.appendChild(p);
    });
  } catch (err) {
    statusEl.textContent = 'Could not build the report: ' + err.message;
  }
}

/* ---- example wiring (put in the Admin page) ----------------------------------------
<button id="build-report">Build formatted report (Excel + PDF)</button>
<span id="report-status"></span>
<script>
document.getElementById('build-report').addEventListener('click', async () => {
  const nightCsv  = await getTonightCsvText();  // <-- replace with your existing "tonight" CSV text
  const seasonCsv = await getSeasonCsvText();   // <-- replace with your existing "all weeks" CSV text
  buildLeagueReport(nightCsv, seasonCsv, document.getElementById('report-status'));
});
</script>
---------------------------------------------------------------------------------------- */

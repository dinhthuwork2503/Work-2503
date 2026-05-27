/**
 * Jordan Task Manager v1 Cloud Sync Edition
 * Google Apps Script Webhook
 *
 * Cách dùng:
 * 1. Mở Google Sheet mới.
 * 2. Extensions > Apps Script.
 * 3. Dán toàn bộ code này.
 * 4. Deploy > New deployment > Web app.
 * 5. Execute as: Me.
 * 6. Who has access: Anyone with the link.
 * 7. Copy Web App URL dán vào Jordan Task Manager > Cloud Sync > Google Sheets Webhook URL.
 */

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents || "{}");
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var data = payload.data || {};

    writeObjects_(ss, "Accounts", data.accounts || []);
    writeObjects_(ss, "Videos", data.videos || []);
    writeObjects_(ss, "Proxies", data.proxies || []);
    writeObjects_(ss, "Posts", data.posts || []);
    writeObjects_(ss, "Hashtags", data.hashtags || []);
    writeObjects_(ss, "AppUsers", data.appUsers || []);
    writeObjects_(ss, "AuthLogs", data.authLogs || []);

    writeDashboard_(ss, data, payload);

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, message: "Synced to Google Sheets", at: new Date().toISOString() }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function writeObjects_(ss, sheetName, rows) {
  var sh = getOrCreateSheet_(ss, sheetName);
  sh.clearContents();

  if (!rows.length) {
    sh.getRange(1, 1).setValue("No data");
    return;
  }

  var headers = Object.keys(rows[0]);
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);

  var values = rows.map(function(row) {
    return headers.map(function(h) {
      var val = row[h];
      if (typeof val === "object") return JSON.stringify(val);
      return val;
    });
  });

  sh.getRange(2, 1, values.length, headers.length).setValues(values);
  sh.autoResizeColumns(1, headers.length);
}

function writeDashboard_(ss, data, payload) {
  var sh = getOrCreateSheet_(ss, "Dashboard");
  sh.clearContents();

  var accounts = data.accounts || [];
  var videos = data.videos || [];
  var proxies = data.proxies || [];
  var posts = data.posts || [];

  var liveAccounts = accounts.filter(function(a) { return String(a.status || "").toLowerCase() === "live"; }).length;

  var rows = [
    ["Jordan Task Manager Dashboard", ""],
    ["Last Sync", payload.sentAt || new Date().toISOString()],
    ["Total Accounts", accounts.length],
    ["Live Accounts", liveAccounts],
    ["Total Videos", videos.length],
    ["Total Proxies", proxies.length],
    ["Total Posts", posts.length]
  ];

  sh.getRange(1, 1, rows.length, 2).setValues(rows);
  sh.getRange(1, 1).setFontWeight("bold").setFontSize(16);
  sh.autoResizeColumns(1, 2);
}

function getOrCreateSheet_(ss, name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

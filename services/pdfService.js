import puppeteer from "puppeteer";

function escapeHtml(input = "") {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function createPdfHtml(content) {
  const textContent =
    typeof content === "string" ? content : JSON.stringify(content, null, 2);

  const safe = escapeHtml(textContent);

  return `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Resumate Resume</title>
        <style>
          body {
            font-family: Inter, Arial, sans-serif;
            color: #111827;
            margin: 0;
            padding: 32px;
            line-height: 1.6;
            white-space: pre-wrap;
          }
          h1 {
            margin: 0 0 12px;
            font-size: 24px;
          }
          .content {
            border-top: 1px solid #e5e7eb;
            margin-top: 16px;
            padding-top: 16px;
            font-size: 14px;
          }
        </style>
      </head>
      <body>
        <h1>Resumate Resume</h1>
        <div class="content">${safe}</div>
      </body>
    </html>
  `;
}

export async function generatePDF(content) {
  // TODO: add caching layer for repeated PDF payloads.
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(createPdfHtml(content), { waitUntil: "networkidle0" });
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "20px", right: "20px", bottom: "20px", left: "20px" },
    });

    return pdfBuffer;
  } finally {
    await browser.close();
  }
}

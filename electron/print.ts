import path from "node:path";
import fs from "node:fs/promises";
import { BrowserWindow } from "electron";
import { fileURLToPath } from "node:url";
import type ProfileManager from "./profile-manager";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getAppIconPath(): string {
  const appRoot = process.env.APP_ROOT || path.join(__dirname, "..");
  const vitePublic = process.env.VITE_PUBLIC;
  if (vitePublic) {
    return path.join(vitePublic, "icon.ico");
  }
  return path.join(appRoot, "public", "icon.ico");
}

type PrintRenderStatus = {
  bodyTextLength: number;
  timedOut: boolean;
  isReady: boolean;
};

type InvoicePrintData = {
  invoice: any;
  items: any[];
};

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatNum(value: unknown): string {
  const num = Number(value ?? 0);
  if (Number.isNaN(num)) return "0";
  return num.toLocaleString("en-PK");
}

function formatDate(value: unknown): string {
  const input = String(value ?? "").trim();
  if (!input) return "N/A";
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) return input;
  return parsed.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function buildInvoiceHtml(
  kind: "purchase" | "sale",
  data: InvoicePrintData,
): string {
  const invoice = data?.invoice ?? {};
  const items = Array.isArray(data?.items) ? data.items : [];

  const partyName =
    invoice.supplierName || invoice.customerName || "Walk-in Customer";
  const title = kind === "purchase" ? "PURCHASE INVOICE" : "SALE INVOICE";
  const address = invoice.address || "";
  const phone = invoice.contactNo || "";
  const totalQty = items.reduce(
    (sum: number, item: any) => sum + (Number(item?.qty) || 0),
    0,
  );
  const totalRate = items.reduce(
    (sum: number, item: any) => sum + (Number(item?.rate) || 0),
    0,
  );

  const rows =
    items.length > 0
      ? items
          .map((item: any) => {
            const qty = Number(item?.qty || 0);
            const rate = Number(item?.rate || 0);
            const total = qty * rate;
            return `
              <tr>
                <td>${escapeHtml(item?.name || "")}</td>
                <td class="num">${formatNum(qty)}</td>
                <td class="num">${formatNum(rate)}</td>
                <td class="num strong">${formatNum(total)}</td>
              </tr>
            `;
          })
          .join("")
      : `
        <tr>
          <td colspan="4" class="empty">No items in invoice</td>
        </tr>
      `;

  return `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Legerly Invoice Print</title>
    <style>
      @page { margin: 10mm; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        padding: 0;
        color: #111;
        background: #fff;
        font-family: Cambria, Georgia, "Times New Roman", serif;
      }
      .sheet {
        width: 100%;
        max-width: 190mm;
        margin: 0 auto;
      }
      .header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        border-bottom: 2px solid #000;
        padding-bottom: 12px;
        margin-bottom: 16px;
      }
      .title {
        font-size: 28px;
        margin: 0 0 8px 0;
        letter-spacing: 0.8px;
      }
      .party {
        font-size: 14px;
        line-height: 1.45;
      }
      .party .name {
        font-size: 18px;
        font-weight: 700;
      }
      .meta {
        text-align: right;
        font-size: 13px;
        line-height: 1.6;
      }
      .meta .value {
        font-weight: 700;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 13px;
      }
      th {
        text-align: left;
        text-transform: uppercase;
        font-size: 11px;
        letter-spacing: 0.6px;
        padding: 8px 6px;
        border-bottom: 2px solid #000;
      }
      td {
        padding: 8px 6px;
        border-bottom: 1px solid #ddd;
        vertical-align: top;
      }
      .num { text-align: right; font-variant-numeric: tabular-nums; }
      .strong { font-weight: 700; }
      tfoot td {
        border-top: 2px solid #000;
        border-bottom: 0;
        font-weight: 700;
      }
      .empty {
        text-align: center;
        color: #666;
        padding: 16px 0;
      }
      .footer {
        margin-top: 24px;
        padding-top: 12px;
        border-top: 1px solid #000;
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 12px;
      }
      .muted { color: #555; }
    </style>
  </head>
  <body>
    <main class="sheet" data-print-content="true">
      <section class="header">
        <div>
          <h1 class="title">${escapeHtml(title)}</h1>
          <div class="party">
            <div class="name">${escapeHtml(partyName)}</div>
            ${address && address !== "NA" ? `<div><strong>Address:</strong> ${escapeHtml(address)}</div>` : ""}
            ${phone && phone !== "NA" ? `<div><strong>Phone:</strong> ${escapeHtml(phone)}</div>` : ""}
          </div>
        </div>
        <div class="meta">
          <div><strong>Invoice #:</strong> <span class="value">${escapeHtml(invoice.number || "")}</span></div>
          <div><strong>Date:</strong> ${escapeHtml(formatDate(invoice.invoiceDate || invoice.createdAt))}</div>
        </div>
      </section>

      <table>
        <thead>
          <tr>
            <th>Item Description</th>
            <th class="num">Qty</th>
            <th class="num">Rate</th>
            <th class="num">Total</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
        <tfoot>
          <tr>
            <td class="num">Totals:</td>
            <td class="num">${formatNum(totalQty)}</td>
            <td class="num">${formatNum(totalRate)}</td>
            <td class="num">${formatNum(invoice.total)}</td>
          </tr>
        </tfoot>
      </table>

      <section class="footer">
        <div class="muted">
          <div>Generated by Legerly</div>
          <div>${escapeHtml(new Date().toLocaleString())}</div>
        </div>
        <div><strong>Thank you for your business!</strong></div>
      </section>
    </main>
  </body>
</html>
  `;
}

export async function saveInvoicePdf(
  kind: "purchase" | "sale",
  id: number,
  destinationPath: string,
  pageSize: "A4" | "A5" = "A4",
  profileManager?: ProfileManager,
  profileId?: string,
  invoiceData?: InvoicePrintData,
): Promise<{ success: boolean; path?: string; error?: string }> {
  if (profileManager && profileId) {
    const db = profileManager.getConnection(profileId);
    const key = profileManager.getEncryptionKey(profileId);

    if (!db || !key) {
      throw new Error("Profile not open");
    }
  }

  // FIX: Calculate paths inside the function to ensure process.env.APP_ROOT is set
  // This prevents issues where this module loads before main.ts sets the env var
  const APP_ROOT = process.env.APP_ROOT || path.join(__dirname, "..");

  if (!invoiceData?.invoice) {
    throw new Error("Missing invoice data for PDF generation");
  }

  console.log(`Preparing PDF for ${kind} invoice #${id}`);

  console.log("Print Window Config:", {
    APP_ROOT,
  });

  const win = new BrowserWindow({
    show: true,
    width: 1024,
    height: 768,
    icon: getAppIconPath(),
    x: -10000,
    y: 0,
    skipTaskbar: true,
    focusable: false,
    paintWhenInitiallyHidden: true,
    backgroundColor: "#ffffff",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      backgroundThrottling: false,
      // ✅ Ensure DevTools are disabled for the print window
      devTools: false,
    },
  });

  try {
    const html = buildInvoiceHtml(kind, invoiceData);
    const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
    console.log("Loading in-memory print template...");
    await win.loadURL(dataUrl);

    // Wait for DOM and fonts so Chromium has fully painted content before PDF capture.
    const renderStatus = (await win.webContents.executeJavaScript(
      `
      new Promise((resolve) => {
        const start = Date.now();
        const timeoutMs = 15000;

        const check = () => {
          const isReady = document.readyState === 'complete';
          const hasContent = !!document.querySelector('[data-print-content]');
          const text = (document.body && document.body.innerText) || '';
          const timedOut = Date.now() - start > timeoutMs;

          if (!isReady && !timedOut) {
            setTimeout(check, 50);
            return;
          }

          const settle = async () => {
            try {
              if (document.fonts && document.fonts.ready) {
                await document.fonts.ready;
              }
            } catch {}

            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                resolve({
                  bodyTextLength: text.length,
                  timedOut,
                  isReady,
                });
              });
            });
          };

          settle();
        };

        check();
      });
    `,
      true,
    )) as PrintRenderStatus;

    console.log("Print render status:", renderStatus);

    if (renderStatus.timedOut && renderStatus.bodyTextLength < 20) {
      throw new Error("Print page did not finish rendering before timeout");
    }

    // Extra safety buffer for slower Windows GPUs/drivers.
    await new Promise((resolve) => setTimeout(resolve, 250));

    console.log("Generating PDF from webContents...");
    const data = await win.webContents.printToPDF({
      pageSize: pageSize === "A5" ? "A5" : "A4",
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      printBackground: true,
      preferCSSPageSize: true,
    });

    if (!data || data.byteLength < 1500) {
      throw new Error("Generated PDF is unexpectedly small");
    }

    console.log("Writing PDF to file:", destinationPath);
    await fs.writeFile(destinationPath, data);
    console.log("PDF write complete. Path:", destinationPath);
    return { success: true, path: destinationPath };
  } catch (error: any) {
    console.error("PDF Generation failed in print.ts:", error);
    return { success: false, error: error.message };
  } finally {
    console.log("Cleaning up print window...");
    if (!win.isDestroyed()) win.destroy();
  }
}

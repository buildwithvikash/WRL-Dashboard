import axios from "axios";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { assets, baseURL } from "../../assets/assets";
import toast from "react-hot-toast";
import QRCode from "qrcode";

/* ------------------------------------------------------------------ */
/*  Fixed text - edit here if the wording ever changes                 */
/* ------------------------------------------------------------------ */
const COMPANY_NAME = "Western Refrigeration Pvt. Ltd";

const COMPANY_ADDRESS =
  "Survey No 631, 633, 634, 635, 636, 647, 654, 707, 726, 732, 741, 748, 752, " +
  "Village: Tadgam, Tal. Umargaon - 396 135, Gujarat";

const NOTES = [
  "Return the pass duly signed and timed by the employee visited.",
  "Entry to the production department is not allowed without a valid permit.",
];

const INSTRUCTIONS = [
  "Display your visitor pass inside the plant and return it at the main security gate before leaving.",
  "Entry under the influence of alcohol or drugs is strictly prohibited. Possession or consumption of alcohol or illegal drugs is not allowed on the premises.",
  "Mobile phones may be used at the workplace only with prior consent.",
  "Photography without authorization is strictly prohibited.",
  "Smoking is not allowed anywhere inside the plant.",
];

const FORMAT_LINE =
  "Format No.: WRLTAD-F-SEC-24  |  Rev. No.: 00  |  Rev. Date: 01-09-2025";

const MAX_COMPANIONS_SHOWN = 4;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
const formatDate = (value) => {
  if (!value) return "N/A";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};

// Convert possible item values into printable text.
const formatItems = (value) => {
  if (value === undefined || value === null || value === "") return "";

  if (typeof value === "string") return value.trim();

  if (Array.isArray(value)) {
    return value
      .map((item, index) => {
        if (typeof item === "string") return `${index + 1}. ${item}`;

        if (item && typeof item === "object") {
          const name =
            item.name ??
            item.item_name ??
            item.asset_name ??
            item.description ??
            "Item";
          const quantity = item.quantity ?? item.qty;

          return `${index + 1}. ${name}${
            quantity !== undefined ? ` (Qty: ${quantity})` : ""
          }`;
        }

        return "";
      })
      .filter(Boolean)
      .join("\n");
  }

  if (typeof value === "object") {
    return Object.entries(value)
      .map(([key, item]) => `${key}: ${item ?? ""}`)
      .join("\n");
  }

  return String(value);
};

/* ------------------------------------------------------------------ */
/*  Small building blocks                                              */
/* ------------------------------------------------------------------ */
const Field = ({ label, value }) => (
  <div className="vp-field">
    <span className="vp-label">{label}</span>
    <span className="vp-value">{value || "N/A"}</span>
  </div>
);

const PassCard = ({ passId, passDetails, itemsBroughtIn }) => {
  const companions = passDetails.companions ?? [];
  const shownCompanions = companions.slice(0, MAX_COMPANIONS_SHOWN);
  const hiddenCompanions = companions.length - shownCompanions.length;

  return (
    <article className="vp-pass">
      {/* ---------- Header: logo + company ---------- */}
      <header className="vp-header">
        <div className="vp-brand">
          <img className="vp-logo" src={assets.logo} alt="Western logo" />

          <div className="vp-company">
            <h1>{COMPANY_NAME}</h1>
            <p>{COMPANY_ADDRESS}</p>
          </div>
        </div>

        <div className="vp-meta">
          <span className="vp-passid">Pass ID: {passId}</span>
        </div>
      </header>

      <div className="vp-title">Visitor Pass</div>

      {/* ---------- Photo | details | QR ---------- */}
      <section className="vp-body">
        <div className="vp-photo">
          {passDetails.visitor_photo ? (
            <img src={passDetails.visitor_photo} alt="Visitor" />
          ) : (
            <span>No photo</span>
          )}
        </div>

        <div className="vp-details">
          <Field label="Visitor Name" value={passDetails.visitor_name} />
          <Field label="Contact No." value={passDetails.visitor_contact_no} />
          <Field
            label="Department to Visit"
            value={passDetails.department_name}
          />
          <Field label="Employee to Visit" value={passDetails.employee_name} />
          <Field label="Valid From" value={formatDate(passDetails.allow_on)} />
          <Field
            label="Valid Till"
            value={formatDate(passDetails.allow_till)}
          />
          <Field
            label="Purpose of Visit"
            value={passDetails.purpose_of_visit}
          />
          <Field label="Company From" value={passDetails.company} />
        </div>

        <div className="vp-qr">
          <img src={passDetails.qrCode} alt="Visitor pass QR code" />
          <span>Scan at gate</span>
        </div>
      </section>

      {/* ---------- Items / assets ---------- */}
      <section className="vp-items">
        <h3>Items / Assets Carried by Visitor</h3>
        <div className="vp-items-text">{itemsBroughtIn || "None"}</div>
      </section>

      {/* ---------- Companions ---------- */}
      {companions.length > 0 && (
        <section className="vp-companions">
          <span className="vp-label">Accompanying people</span>
          <div className="vp-companion-list">
            {shownCompanions.map((companion, index) => (
              <div
                className="vp-companion"
                key={companion.id ?? companion._id ?? index}
              >
                {companion.photo && (
                  <img
                    src={companion.photo}
                    alt={companion.name || "Companion"}
                  />
                )}
                <span>
                  {companion.name || "N/A"}
                  {companion.phone ? ` (${companion.phone})` : ""}
                </span>
              </div>
            ))}
            {hiddenCompanions > 0 && (
              <span className="vp-more">+{hiddenCompanions} more</span>
            )}
          </div>
        </section>
      )}

      {/* ---------- Signatures ---------- */}
      <div className="vp-signatures">
        <div>Security officer</div>
        <div>Visitor</div>
        <div>Employee visited</div>
      </div>

      {/* ---------- Notes and instructions ---------- */}
      <footer className="vp-footer">
        <div className="vp-footer-col">
          <h4>Note</h4>
          <ul className="list-disc pl-5">
            {NOTES.map((note, index) => (
              <li key={`${note}-${index}`}>{note}</li>
            ))}
          </ul>
        </div>

        <div className="vp-footer-col vp-footer-wide">
          <h4>Instructions for Visitors</h4>
          <ul className="list-disc pl-5">
            {INSTRUCTIONS.map((rule, index) => (
              <li key={`${rule}-${index}`}>{rule}</li>
            ))}
          </ul>
        </div>

        <div className="vp-format">{FORMAT_LINE}</div>
      </footer>
    </article>
  );
};

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */
const VisitorPassDisplay = () => {
  const { passId } = useParams();
  const [passDetails, setPassDetails] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const fetchPassDetails = async () => {
      setLoading(true);

      try {
        const res = await axios.get(`${baseURL}visitor/pass-details/${passId}`);

        if (!res?.data?.success) {
          toast.error("Failed to fetch pass details");
          return;
        }

        const data = res.data.data;
        const qrCode = await QRCode.toDataURL(String(passId), { margin: 1 });

        if (!cancelled) {
          setPassDetails({ ...data, qrCode });
        }
      } catch (error) {
        console.error("Error fetching pass details:", error);
        if (!cancelled) {
          toast.error("Failed to fetch pass details");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    if (passId) {
      fetchPassDetails();
    } else {
      setLoading(false);
    }

    return () => {
      cancelled = true;
    };
  }, [passId]);

  if (loading) {
    return <div className="p-4">Loading visitor pass...</div>;
  }

  if (!passDetails) {
    return <div className="p-4">No pass details found.</div>;
  }

  // GeneratePass submits this field as visitorData.specialInstruction.
  // The fallback names support different backend naming conventions.
  const rawItems =
    passDetails.specialInstruction ??
    passDetails.special_instruction ??
    passDetails.specialInstructions ??
    passDetails.special_instructions ??
    passDetails.itemsBroughtIn ??
    passDetails.items_brought_in ??
    passDetails.assetsBroughtIn ??
    passDetails.assets_brought_in ??
    passDetails.items ??
    passDetails.assets ??
    "";

  const itemsBroughtIn = formatItems(rawItems);

  return (
    <div className="vp-page min-h-screen bg-gray-100 p-4">
      {/* On screen: preview of the pass. On paper: only the pass. */}
      <div className="vp-scroll">
        <div className="vp-sheet">
          <PassCard
            passId={passId}
            passDetails={passDetails}
            itemsBroughtIn={itemsBroughtIn}
          />
        </div>
      </div>

      <div className="no-print mt-3 flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded bg-blue-600 px-5 py-2 text-white hover:bg-blue-700"
        >
          Print pass
        </button>
        <p className="text-xs text-gray-500">
          In the print dialog use A4, Scale 100%, and turn off Headers and
          footers.
        </p>
      </div>

      <style>{`
        @page {
          size: A4 portrait;
          margin: 0;
        }

        .vp-scroll {
          overflow-x: auto;
        }

        /* ---------- Sheet: A4 wide, only as tall as the pass ---------- */
        .vp-sheet {
          box-sizing: border-box;
          width: 210mm;
          margin: 0 auto;
          padding: 7mm 8mm;
          background: #fff;
          color: #000;
          font-family: "Segoe UI", Arial, Helvetica, sans-serif;
          box-shadow: 0 1px 6px rgba(0, 0, 0, 0.2);
        }

        .vp-sheet *,
        .vp-sheet *::before,
        .vp-sheet *::after {
          box-sizing: border-box;
        }

        /* ---------- The pass: 136 mm tall ---------- */
        .vp-pass {
          display: flex;
          flex-direction: column;
          height: 136mm;
          border: 0.4mm solid #000;
          font-size: 8.5pt;
          line-height: 1.25;
          overflow: hidden;
          break-inside: avoid;
          page-break-inside: avoid;
        }

        .vp-header {
          flex: 0 0 auto;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 4mm;
          padding: 2mm 4mm;
        }

        /* Logo (2:1) sits to the left of the company name and address */
        .vp-brand {
          display: flex;
          align-items: center;
          gap: 3mm;
          min-width: 0;
        }

        .vp-logo {
          flex: 0 0 auto;
          height: 12mm;
          width: auto;
          object-fit: contain;
        }

        .vp-company h1 {
          margin: 0;
          font-size: 14pt;
          font-weight: 700;
          line-height: 1.15;
        }

        .vp-company p {
          margin: 0.8mm 0 0;
          font-size: 6.5pt;
          line-height: 1.3;
          color: #333;
        }

        .vp-meta {
          flex-shrink: 0;
          white-space: nowrap;
        }

        .vp-passid {
          font-size: 9pt;
          font-weight: 600;
        }

        .vp-title {
          flex: 0 0 auto;
          padding: 1.2mm 0;
          border-top: 0.3mm solid #000;
          border-bottom: 0.3mm solid #000;
          background: #ececec;
          text-align: center;
          font-size: 12pt;
          font-weight: 700;
          letter-spacing: 0.6mm;
        }

        /* ---------- Photo | details | QR ---------- */
        .vp-body {
          display: flex;
          flex: 0 0 auto;
          align-items: flex-start;
          gap: 4mm;
          padding: 2.5mm 4mm;
        }

        .vp-photo {
          flex: 0 0 30mm;
          width: 30mm;
          height: 36mm;
          border: 0.3mm solid #000;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          font-size: 7pt;
          color: #666;
        }

        .vp-photo img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .vp-details {
          display: flex;
          flex: 1 1 auto;
          flex-wrap: wrap;
          align-content: flex-start;
          min-width: 0;
          column-gap: 4mm;
          row-gap: 1.4mm;
        }

        .vp-field {
          display: flex;
          flex-direction: column;
          width: calc(50% - 2mm);
          min-width: 0;
          padding-bottom: 0.8mm;
          border-bottom: 0.2mm solid #bbb;
        }

        .vp-label {
          font-size: 6.5pt;
          color: #555;
        }

        .vp-value {
          font-size: 9pt;
          font-weight: 600;
          overflow-wrap: anywhere;
        }

        .vp-qr {
          flex: 0 0 28mm;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1mm;
          font-size: 6.5pt;
          color: #444;
        }

        .vp-qr img {
          width: 28mm;
          height: 28mm;
        }

        /* ---------- Items brought in (takes the spare height) ---------- */
        .vp-items {
          flex: 1 1 auto;
          min-height: 16mm;
          margin: 0 4mm;
          padding: 1.5mm 2mm;
          border: 0.3mm solid #000;
          overflow: hidden;
        }

        .vp-items h3 {
          margin: 0 0 0.6mm;
          font-size: 7.5pt;
          font-weight: 700;
        }

        .vp-items-text {
          font-size: 8pt;
          white-space: pre-line;
          overflow-wrap: anywhere;
        }

        /* ---------- Companions ---------- */
        .vp-companions {
          flex: 0 0 auto;
          display: flex;
          align-items: center;
          gap: 3mm;
          margin: 1.5mm 4mm 0;
        }

        .vp-companion-list {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 1mm 4mm;
        }

        .vp-companion {
          display: flex;
          align-items: center;
          gap: 1.5mm;
          font-size: 7.5pt;
        }

        .vp-companion img {
          width: 7mm;
          height: 7mm;
          border: 0.2mm solid #000;
          border-radius: 50%;
          object-fit: cover;
        }

        .vp-more {
          font-size: 7.5pt;
          font-weight: 600;
        }

        /* ---------- Signatures ---------- */
        .vp-signatures {
          flex: 0 0 auto;
          display: flex;
          justify-content: space-between;
          gap: 8mm;
          margin: 6mm 4mm 0;
        }

        .vp-signatures div {
          flex: 1;
          padding-top: 0.8mm;
          border-top: 0.3mm solid #000;
          text-align: center;
          font-size: 7.5pt;
        }

        /* ---------- Notes + instructions ---------- */
        .vp-footer {
          display: flex;
          flex: 0 0 auto;
          flex-wrap: wrap;
          column-gap: 5mm;
          margin: 2.5mm 4mm 0;
          padding: 1.5mm 0 1.5mm;
          border-top: 0.3mm dashed #000;
          font-size: 6.3pt;
          line-height: 1.25;
        }

        .vp-footer-col ul {
          list-style-type: disc;
          padding-left: 20px;
        }

        .vp-footer-col li {
          display: list-item;
        }

        .vp-footer-wide {
          flex: 1.7 1 0;
        }

        .vp-footer h4 {
          margin: 0 0 0.5mm;
          font-size: 7pt;
          font-weight: 700;
        }

        .vp-footer ol {
          margin: 0;
          padding-left: 3.5mm;
        }

        .vp-format {
          flex: 0 0 100%;
          margin-top: 1mm;
          text-align: right;
          font-size: 6pt;
          color: #444;
        }

        /* ---------- Print ---------- */
        @media print {
          html,
          body,
          #root {
            height: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: visible !important;
            background: #fff !important;
          }

          body * {
            visibility: hidden !important;
          }

          .vp-sheet,
          .vp-sheet * {
            visibility: visible !important;
          }

          .vp-sheet {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            margin: 0 !important;
            box-shadow: none !important;
          }

          .no-print {
            display: none !important;
          }

          * {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      `}</style>
    </div>
  );
};

export default VisitorPassDisplay;

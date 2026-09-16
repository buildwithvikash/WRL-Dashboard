import { CgProfile } from "react-icons/cg";
import {
  FaTimes, FaPhone, FaEnvelope, FaBuilding, FaIdCard, FaCar, FaClock,
} from "react-icons/fa";
import { formatISODateString } from "../../utils/dateUtils";

const PresenceBadge = ({ checkedOut }) =>
  checkedOut ? (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
      <span className="w-1.5 h-1.5 rounded-full bg-gray-400" /> Checked Out
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> On Site
    </span>
  );

// Shared "Visitor Profile & Visit Details" side panel — used by the Visitor
// History and Visitor Reports pages, both of which resolve a selected
// visitor via GET /visitor/details/:visitorId ({ visitor, visit_logs }) and
// pass it down as `detail = { visitor, logs, host }` (host = logs[0], the
// most recent visit, used for "who they're here to see" + presence).
const ProfilePanel = ({ visitorId, detail, loading, onClose }) => {
  if (!visitorId) {
    return (
      <div className="bg-white shadow-md rounded-xl border border-gray-100 p-6 h-full flex flex-col items-center justify-center text-center">
        <CgProfile className="text-5xl text-gray-200 mb-3" />
        <p className="text-sm font-medium text-gray-500">No visitor selected</p>
        <p className="text-xs text-gray-400 mt-1">Click "View Profile" on a row to see full visit details here.</p>
      </div>
    );
  }

  return (
    <div className="bg-white shadow-md rounded-xl border border-gray-100 flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
        <h3 className="text-sm font-bold text-gray-800">Visitor Profile &amp; Visit Details</h3>
        <button onClick={onClose} className="p-1.5 rounded-full text-gray-400 hover:bg-gray-100 cursor-pointer">
          <FaTimes className="text-xs" />
        </button>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center py-10">
          <div className="animate-spin h-8 w-8 border-b-2 border-blue-500 rounded-full" />
        </div>
      ) : !detail ? null : (
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* Identity */}
          <div className="flex items-center gap-3 mb-4">
            {detail.visitor.visitor_photo ? (
              <img
                src={detail.visitor.visitor_photo}
                alt={detail.visitor.visitor_name}
                className="w-16 h-16 rounded-full object-cover border-2 border-blue-200"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center border-2 border-gray-200 shrink-0">
                <CgProfile className="text-3xl text-gray-400" />
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-base font-bold text-gray-800 truncate">{detail.visitor.visitor_name}</p>
                <PresenceBadge checkedOut={Boolean(detail.host?.check_out_time)} />
              </div>
              <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                <FaPhone className="text-[10px] text-blue-400" /> {detail.visitor.contact_no || "—"}
              </p>
            </div>
          </div>

          {detail.visitor.company && (
            <p className="text-xs font-semibold text-gray-700 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 mb-4 flex items-center gap-2">
              <FaBuilding className="text-purple-400 shrink-0" /> {detail.visitor.company}
            </p>
          )}

          <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs mb-4">
            <div>
              <p className="text-gray-400 flex items-center gap-1"><FaIdCard className="text-[10px]" /> ID Type</p>
              <p className="text-gray-700 font-medium mt-0.5">{detail.visitor.identity_type || "—"}</p>
            </div>
            <div>
              <p className="text-gray-400">ID No.</p>
              <p className="text-gray-700 font-medium mt-0.5">{detail.visitor.identity_no || "—"}</p>
            </div>
            <div>
              <p className="text-gray-400 flex items-center gap-1"><FaCar className="text-[10px]" /> Vehicle</p>
              <p className="text-gray-700 font-medium mt-0.5">{detail.visitor.vehicle_details || "—"}</p>
            </div>
            <div>
              <p className="text-gray-400">Primary Host</p>
              <p className="text-gray-700 font-medium mt-0.5 truncate">
                {detail.host?.employee_name || "—"}{detail.host?.department_name ? ` · ${detail.host.department_name}` : ""}
              </p>
            </div>
          </div>

          {detail.visitor.email && (
            <p className="text-xs text-gray-500 flex items-center gap-1.5 mb-4">
              <FaEnvelope className="text-emerald-400" /> {detail.visitor.email}
            </p>
          )}

          {/* Visit history timeline */}
          <p className="text-xs font-bold text-gray-700 flex items-center gap-1.5 mb-2 pt-2 border-t border-gray-100">
            <FaClock className="text-blue-400" /> Visit Timeline
          </p>
          {detail.logs.length === 0 ? (
            <p className="text-xs text-gray-400 py-4 text-center">No visit logs found.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {detail.logs.map((log, i) => (
                <div key={`${log.pass_id}-${log.check_in_time}`} className="border border-gray-100 rounded-lg p-2.5">
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="flex items-center gap-1.5">
                      <span className="text-[9px] font-bold text-white bg-blue-500 px-1.5 py-0.5 rounded-full">#{detail.logs.length - i}</span>
                      <span className="font-semibold text-gray-600">{formatISODateString(log.check_in_time) || "—"}</span>
                    </span>
                    {log.check_out_time ? (
                      <span className="text-gray-400">Out: {formatISODateString(log.check_out_time)}</span>
                    ) : (
                      <span className="text-emerald-600 font-bold bg-emerald-50 px-1.5 py-0.5 rounded-full">Currently In</span>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-1.5 text-[10px] text-gray-500">
                    <span className="truncate">{log.employee_name || "—"}</span>
                    <span className="truncate">{log.department_name || "—"}</span>
                    <span className="text-right truncate">{log.purpose_of_visit || "—"}</span>
                  </div>
                  {log.token && (
                    <p className="text-[10px] text-gray-400 mt-1">Token: <span className="font-mono text-gray-600">{log.token}</span></p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ProfilePanel;

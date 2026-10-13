import { CgProfile } from "react-icons/cg";

// People accompanying the main visitor on one pass ({ name, phone, photo }[]).
// onPhotoClick, when given, lets the caller enlarge a photo (e.g. at the gate).
const CompanionList = ({ companions, onPhotoClick, size = "w-8 h-8" }) => {
  if (!companions?.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {companions.map((c, i) => (
        <div key={i} className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-full pr-2.5">
          {c.photo ? (
            <img
              src={c.photo}
              alt={c.name || "Companion"}
              onClick={onPhotoClick ? () => onPhotoClick(c.photo) : undefined}
              className={`${size} rounded-full object-cover border border-gray-300 ${onPhotoClick ? "cursor-zoom-in" : ""}`}
            />
          ) : (
            <span className={`${size} rounded-full bg-gray-100 border border-gray-300 flex items-center justify-center text-gray-400`}>
              <CgProfile />
            </span>
          )}
          <span className="text-[11px] text-gray-700 leading-tight">
            {c.name || "Unnamed"}
            {c.phone && <span className="block text-[10px] text-gray-400">{c.phone}</span>}
          </span>
        </div>
      ))}
    </div>
  );
};

export default CompanionList;

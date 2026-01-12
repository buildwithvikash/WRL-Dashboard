import { useState, useEffect } from "react";
import {
  FaUpload,
  FaEye,
  FaTrashAlt,
  FaFilePowerpoint,
  FaFileAlt,
  FaVideo,
  FaExternalLinkAlt,
  FaLock,
  FaImage,
  FaDownload,
} from "react-icons/fa";
import toast from "react-hot-toast";
import axios from "axios";
import { baseURL } from "../../assets/assets";

import Button from "../ui/Button";

/* ================= CONFIG ================= */
const ALLOWED_TYPES = [
  "application/pdf",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/msword",
  "video/mp4",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

const MAX_SIZE_MB = 10;

/* ================= COMPONENT ================= */
export default function MaterialsTab({ trainingId }) {
  const [materials, setMaterials] = useState([]);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  /* ================= FLOW FLAGS ================= */
  const [attendanceCompleted] = useState(true);
  const [trainingClosed] = useState(false);

  /* ================= LOAD MATERIALS ================= */
  const loadMaterials = async () => {
    if (!trainingId) return;

    try {
      const res = await axios.get(
        `${baseURL}trainings/${trainingId}/materials`
      );
      setMaterials(res.data.data || []);
    } catch {
      toast.error("Failed to load materials");
    }
  };

  useEffect(() => {
    loadMaterials();
  }, [trainingId]);

  /* ================= FILE VALIDATION ================= */
  const validateFile = (selectedFile) => {
    if (!selectedFile) return false;

    if (selectedFile.size > MAX_SIZE_MB * 1024 * 1024) {
      toast.error("File size must be under 10 MB");
      return false;
    }

    if (!ALLOWED_TYPES.includes(selectedFile.type)) {
      toast.error("Invalid file type");
      return false;
    }

    setFile(selectedFile);
    return true;
  };

  const detectCategoryFromFile = (file) => {
    if (!file) return "OTHER";

    const type = file.type;
    const name = file.name.toLowerCase();

    // PDF
    if (type === "application/pdf") return "PDF";

    // PPT
    if (
      type === "application/vnd.ms-powerpoint" ||
      type ===
        "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    )
      return "PPT";

    // Excel
    if (
      type === "application/vnd.ms-excel" ||
      type ===
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
      return "EXCEL";

    // Word / SOP
    if (
      type === "application/msword" ||
      type ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )
      return "SOP";

    // Video
    if (type.startsWith("video/")) return "VIDEO";

    // Images (optional)
    if (type.startsWith("image/")) return "IMAGE";

    return "OTHER";
  };

  /* ================= MATERIAL UPLOAD ================= */
  const uploadMaterial = async () => {
    if (!file || !trainingId) return;

    const detectedCategory = detectCategoryFromFile(file);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("Category", detectedCategory);
    formData.append("MaterialType", "FILE"); // still fixed (correct)

    try {
      setUploading(true);

      await axios.post(`${baseURL}trainings/${trainingId}/materials`, formData);

      toast.success(`Material uploaded as ${detectedCategory}`);
      setFile(null);
      loadMaterials();
    } catch (err) {
      console.error(err);
      toast.error("Upload failed");
    } finally {
      setUploading(false);
    }
  };

  /* ================= IMAGE UPLOAD ================= */
  const uploadImages = async (files) => {
    const formData = new FormData();
    files.forEach((f) => formData.append("files", f));

    try {
      await axios.post(
        `${baseURL}trainings/${trainingId}/materials/images`,
        formData
      );
      toast.success("Images uploaded");
      loadMaterials();
    } catch {
      toast.error("Image upload failed");
    }
  };

  /* ================= REPORT UPLOAD ================= */
  const uploadReport = async (file) => {
    const formData = new FormData();
    formData.append("file", file);

    try {
      await axios.post(
        `${baseURL}trainings/${trainingId}/materials/report`,
        formData
      );
      toast.success("Report uploaded");
      loadMaterials();
    } catch {
      toast.error("Report upload failed");
    }
  };

  const handleDownload = (material) => {
    if (!material.FilePath) {
      toast.error("File path missing");
      return;
    }

    const link = document.createElement("a");
    link.href = material.FilePath;
    link.download = material.FileName || "training-material";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  /* ================= DELETE ================= */
  const handleDelete = async (material) => {
    if (!window.confirm(`Delete "${material.FileName}"?`)) return;

    try {
      await axios.delete(`${baseURL}trainings/materials/${material.ID}`);
      toast.success("Material deleted");
      loadMaterials();
    } catch {
      toast.error("Delete failed");
    }
  };

  /* ================= CATEGORY BADGE ================= */
  const getCategoryBadge = (category) => {
    const map = {
      PPT: {
        icon: <FaFilePowerpoint />,
        color: "bg-orange-100 text-orange-700",
      },
      SOP: { icon: <FaFileAlt />, color: "bg-purple-100 text-purple-700" },
      VIDEO: { icon: <FaVideo />, color: "bg-green-100 text-green-700" },
      LINK: { icon: <FaExternalLinkAlt />, color: "bg-blue-100 text-blue-700" },
    };
    const cfg = map[category] || map.LINK;
    return (
      <span
        className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded ${cfg.color}`}
      >
        {cfg.icon}
        {category}
      </span>
    );
  };

  /* ================= UI ================= */
  return (
    <div className="space-y-8">
      {/* ================= UPLOAD SECTION ================= */}
      <div className="border rounded-xl p-6 bg-gray-50 relative">
        {!attendanceCompleted && (
          <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-10 rounded-xl">
            <FaLock className="text-2xl mr-2" />
            Attendance not completed
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* MATERIAL */}
          <ProofCard title="Training Material Upload" icon={<FaUpload />}>
            <input
              type="file"
              onChange={(e) => validateFile(e.target.files[0])}
            />
            <Button
              onClick={uploadMaterial}
              disabled={!file || uploading}
              className="mt-2"
            >
              Upload
            </Button>
          </ProofCard>

          {/* IMAGES */}
          <ProofCard title="Training Image Upload" icon={<FaImage />}>
            <input
              type="file"
              multiple
              accept="image/*"
              onChange={(e) => uploadImages(Array.from(e.target.files))}
            />
          </ProofCard>

          {/* REPORT */}
          <ProofCard title="Training Report Upload" icon={<FaFileAlt />}>
            <input
              type="file"
              onChange={(e) => uploadReport(e.target.files[0])}
            />
          </ProofCard>
        </div>
      </div>

      {/* ================= MATERIAL LIST ================= */}
      <div className="border rounded-xl divide-y bg-white">
        {materials.map((m) => (
          <div key={m.ID} className="p-4 flex justify-between items-center">
            <div className="flex gap-3">
              {getCategoryBadge(m.Category)}
              <span className="text-sm font-medium">{m.FileName}</span>
            </div>

            <div className="flex gap-2">
              <Button
                bgColor="bg-transparent"
                textColor="text-green-600"
                onClick={() => handleDownload(m)}
              >
                <FaDownload />
              </Button>

              <Button
                bgColor="bg-transparent"
                textColor="text-red-600"
                onClick={() => handleDelete(m)}
              >
                <FaTrashAlt />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ================= SMALL CARD ================= */
function ProofCard({ title, icon, children }) {
  return (
    <div className="border rounded-xl p-4 bg-white text-center">
      <div className="text-2xl mb-2 text-blue-600">{icon}</div>
      <p className="text-sm font-semibold mb-3">{title}</p>
      {children}
    </div>
  );
}

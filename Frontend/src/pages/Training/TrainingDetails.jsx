import { useMemo, useState, useEffect } from "react";
import {
  FaClipboardList,
  FaUsers,
  FaFolderOpen,
  FaUserCheck,
  FaMapMarkerAlt,
  FaCalendarAlt,
  FaChalkboardTeacher,
  FaExclamationCircle,
  FaClock,
} from "react-icons/fa";
import toast from "react-hot-toast";
import { baseURL } from "../../assets/assets";
import axios from "axios";

import Title from "../../components/ui/Title";
import Button from "../../components/ui/Button";
import InputField from "../../components/ui/InputField";

// Tabs
import OverviewTab from "../../components/Training/OverviewTab";
import NominationTab from "../../components/Training/NominationTab";
import MaterialsTab from "../../components/Training/MaterialsTab";
import AttendanceTab from "../../components/Training/AttendanceTab";
import CreateTrainingModal from "../../components/Training/CreateTrainingModal";

export default function TrainingDetails() {
  const [view, setView] = useState("LIST"); // LIST | DETAIL
  const [activeTab, setActiveTab] = useState("OVERVIEW");
  const [showSummary, setShowSummary] = useState(true);
  const [selectedTraining, setSelectedTraining] = useState(null);
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [trainings, setTrainings] = useState([]);
  const [editingTraining, setEditingTraining] = useState(null);
  const [attendanceCompleted, setAttendanceCompleted] = useState(false);

  /* ================= LOAD ================= */
  useEffect(() => {
    loadTraningList();
  }, []);

  const loadTraningList = async () => {
    try {
      const res = await axios.get(`${baseURL}trainings/get-training`);
      setTrainings(res?.data?.data || []);
    } catch (error) {
      toast.error("Failed to load records");
    }
  };

  const handleCreateTraining = async (form) => {
    try {
      const payload = {
        TrainingTitle: form.TrainingTitle,
        TrainingType: form.TrainingType,
        TrainerType: form.TrainerType,
        Mode: form.Mode,
        LocationDetails: form.LocationDetails || null,
        StartDateTime: form.StartDateTime,
        EndDateTime: form.EndDateTime,
        Mandatory: form.Mandatory ? 1 : 0,
      };

      // Trainer condition (IMPORTANT)
      if (form.TrainerType === "INTERNAL") {
        payload.TrainerEmployeeId = form.TrainerEmployeeId;
        payload.ExternalTrainerName = null;
      } else {
        payload.TrainerEmployeeId = null;
        payload.ExternalTrainerName = form.ExternalTrainerName;
      }

      await axios.post(`${baseURL}trainings/create-training`, payload);

      toast.success("Training created successfully");

      setShowCreateModal(false);
      loadTraningList();
    } catch (err) {
      console.error("Create Training Error:", err.response?.data || err);
      toast.error(err.response?.data?.message || "Failed to create training");
    }
  };

  const handleUpdateTraining = async (form, trainingId) => {
    try {
      const payload = {
        TrainingTitle: form.TrainingTitle,
        TrainingType: form.TrainingType,
        TrainerType: form.TrainerType,
        Mode: form.Mode,
        LocationDetails: form.LocationDetails || null,
        StartDateTime: form.StartDateTime,
        EndDateTime: form.EndDateTime,
        Mandatory: form.Mandatory ? 1 : 0,
      };

      if (form.TrainerType === "INTERNAL") {
        payload.TrainerEmployeeId = form.TrainerEmployeeId;
        payload.ExternalTrainerName = null;
      } else {
        payload.TrainerEmployeeId = null;
        payload.ExternalTrainerName = form.ExternalTrainerName;
      }

      await axios.put(`${baseURL}trainings/training/${trainingId}`, payload);

      toast.success("Training updated successfully");
      setShowCreateModal(false);
      setEditingTraining(null);
      loadTraningList();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to update training");
    }
  };

  /* =============================== HELPER =============================== */
  const getTrainingStatus = (start, end) => {
    const now = new Date();
    const s = new Date(start);
    const e = new Date(end);

    if (now < s) return "UPCOMING";
    if (now >= s && now <= e) return "ONGOING";
    return "COMPLETED";
  };

  const filteredTrainings = useMemo(() => {
    return trainings.filter((t) => {
      const status = getTrainingStatus(t.StartDateTime, t.EndDateTime);

      const matchesFilter = filter === "ALL" || status === filter;
      const matchesSearch =
        t.TrainingTitle.toLowerCase().includes(search.toLowerCase()) ||
        t.TrainerName.toLowerCase().includes(search.toLowerCase());

      return matchesFilter && matchesSearch;
    });
  }, [trainings, filter, search]);

  /* =============================== TABS =============================== */
  const tabs = [
    { key: "OVERVIEW", label: "Overview", icon: <FaClipboardList /> },
    { key: "NOMINATION", label: "Nomination", icon: <FaUsers /> },
    { key: "MATERIALS", label: "Materials", icon: <FaFolderOpen /> },
    { key: "ATTENDANCE", label: "Attendance", icon: <FaUserCheck /> },
  ];

  /* =============================== LIST VIEW =============================== */
  if (view === "LIST") {
    return (
      <div className="bg-gray-50 p-6 rounded-xl border">
        <Title text="Training Register" />

        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Training List</h2>
            <p className="text-sm text-gray-500">
              View and manage all employee training programs
            </p>
          </div>

          <Button
            onClick={() => {
              setEditingTraining(null);
              setShowCreateModal(true);
            }}
            className="bg-blue-600 text-white px-4 py-2 rounded-md"
          >
            Create Training
          </Button>
        </div>

        {showCreateModal && (
          <CreateTrainingModal
            editData={editingTraining}
            onClose={() => {
              setShowCreateModal(false);
              setEditingTraining(null);
            }}
            onCreate={handleCreateTraining}
            onUpdate={handleUpdateTraining}
          />
        )}

        {/* FILTERS */}
        <div className="flex flex-wrap gap-3 mb-6">
          {["ALL", "UPCOMING", "ONGOING", "COMPLETED"].map((f) => (
            <Button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-1.5 text-sm rounded-md border ${
                filter === f ? "bg-gray-900 text-white" : "hover:bg-blue-500"
              }`}
            >
              {f}
            </Button>
          ))}

          <InputField
            label="Search"
            type="text"
            placeholder="Search training or trainer"
            className="ml-auto border rounded-md px-4 py-2 text-sm w-72"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* LIST */}
        <div className="space-y-4">
          {filteredTrainings.map((t, index) => {
            const status = getTrainingStatus(t.StartDateTime, t.EndDateTime);

            return (
              <div
                key={t.ID || index}
                onClick={() => {
                  setSelectedTraining(t);
                  setView("DETAIL");
                }}
                className="bg-white border rounded-lg p-4 hover:shadow cursor-pointer"
              >
                {/* HEADER */}
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold text-gray-800">
                      {index + 1}. {t.TrainingTitle}
                    </h3>
                    <p className="text-sm text-gray-500">
                      Trainer: {t.TrainerName}
                    </p>
                  </div>

                  <span className="text-xs bg-gray-100 px-3 py-1 rounded-full">
                    {t.Status}
                  </span>
                </div>

                {/* BADGES + EDIT */}
                <div className="flex items-center justify-between mt-3 gap-3">
                  {/* LEFT : BADGES */}
                  <div className="flex flex-wrap gap-2 text-xs">
                    <Badge
                      icon={<FaCalendarAlt />}
                      text={t.StartDateTime.slice(0, 10)}
                    />
                    <Badge
                      icon={<FaClock />}
                      text={`${(() => {
                        const h = parseInt(t.StartDateTime.slice(11, 13));
                        const m = t.StartDateTime.slice(14, 16);
                        return `${h % 12 || 12}:${m} ${h >= 12 ? "PM" : "AM"}`;
                      })()}`}
                    />

                    <Badge
                      icon={<FaMapMarkerAlt />}
                      text={t.LocationDetails || "Online"}
                    />
                    <Badge icon={<FaClipboardList />} text={t.TrainingType} />
                    <Badge icon={<FaChalkboardTeacher />} text={t.Mode} />
                  </div>

                  {/* RIGHT : EDIT BUTTON */}
                  <Button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingTraining(t);
                      setShowCreateModal(true);
                    }}
                    className="text-xs px-3 py-1 whitespace-nowrap"
                  >
                    Edit
                  </Button>
                </div>

                {/* MANDATORY TAG */}
                {t.Mandatory && (
                  <span
                    className="inline-flex mt-3 items-center gap-1
                           bg-red-100 text-red-700
                           px-3 py-1 rounded-full text-xs"
                  >
                    <FaExclamationCircle />
                    {t.Mandatory === 0 ? "Optional" : "Mandatory"}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  /* ===============================
     DETAIL VIEW
     =============================== */
  if (!selectedTraining) return null;

  const status = getTrainingStatus(
    selectedTraining.StartDateTime,
    selectedTraining.EndDateTime
  );

  return (
    <div className="bg-gray-50 p-4 rounded-lg border">
      <Button
        onClick={() => setView("LIST")}
        className="text-xs text-blue-600 mb-2"
      >
        ← Back
      </Button>

      <Title text="Training Details" />

      {/* SUMMARY */}
      {showSummary && (
        <div className="grid md:grid-cols-3 gap-3 mb-4">
          <InfoCard
            icon={<FaCalendarAlt />}
            label="Schedule"
            value={`${selectedTraining.StartDateTime.slice(0, 10)} ${(() => {
              const h = parseInt(selectedTraining.StartDateTime.slice(11, 13));
              const m = selectedTraining.StartDateTime.slice(14, 16);
              return `${h % 12 || 12}:${m} ${h >= 12 ? "PM" : "AM"}`;
            })()} → ${selectedTraining.EndDateTime.slice(0, 10)} ${(() => {
              const h = parseInt(selectedTraining.EndDateTime.slice(11, 13));
              const m = selectedTraining.EndDateTime.slice(14, 16);
              return `${h % 12 || 12}:${m} ${h >= 12 ? "PM" : "AM"}`;
            })()}`}
          />
          <InfoCard
            icon={<FaMapMarkerAlt />}
            label="Location"
            value={selectedTraining.LocationDetails || "Online"}
          />
          <InfoCard
            icon={<FaChalkboardTeacher />}
            label="Trainer"
            value={selectedTraining.TrainerName}
          />
        </div>
      )}

      {/* TABS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {tabs.map((tab) => {
          const disabled = tab.key === "ATTENDANCE" && status === "UPCOMING";

          return (
            <Button
              key={tab.key}
              disabled={disabled}
              onClick={() => setActiveTab(tab.key)}
              className={`px-3 py-2 rounded-lg border text-sm ${
                activeTab === tab.key
                  ? "bg-blue-600 text-white"
                  : "hover:bg-gray-100"
              } ${disabled && "opacity-50 cursor-not-allowed"}`}
            >
              {tab.icon} {tab.label}
            </Button>
          );
        })}
      </div>

      <div className="bg-white border rounded-lg p-4">
        {activeTab === "OVERVIEW" && (
          <OverviewTab training={selectedTraining} />
        )}
        {activeTab === "NOMINATION" && (
          <NominationTab trainingId={selectedTraining.ID} />
        )}
        {activeTab === "MATERIALS" && (
          <MaterialsTab trainingId={selectedTraining.ID} />
        )}
        {activeTab === "ATTENDANCE" && (
          <AttendanceTab
            trainingId={selectedTraining.ID}
            onAttendanceCompleted={() => {
              setAttendanceCompleted(true);
              loadTraningList();
            }}
          />
        )}
      </div>
    </div>
  );
}

/* ===============================
   SMALL COMPONENTS
   =============================== */

function InfoCard({ icon, label, value }) {
  return (
    <div className="bg-white border rounded-lg p-3">
      <div className="text-xs text-gray-500 flex items-center gap-1">
        {icon} {label}
      </div>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}

function Badge({ icon, text }) {
  return (
    <span className="inline-flex items-center gap-1 bg-gray-100 px-3 py-1 rounded-full">
      {icon}
      {text}
    </span>
  );
}
